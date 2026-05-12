-- Corrective migration for task RPCs:
--   C2: use auth.uid() instead of p_input->>'user_id' in create_task_with_squads
--   I4: embed SET LOCAL statement_timeout inside each RPC body
--   I6: use the ? operator in update_task_with_squads to distinguish
--       "field absent" from "field = null", enabling explicit null clears
--   I5: add explanatory comment to covering index
--
-- Both functions are replaced in full to keep the definition authoritative.

-- ============================================================
-- RPC: create_task_with_squads  (replaces prior version)
-- ============================================================
create or replace function create_task_with_squads(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task    tasks%rowtype;
  v_squads  jsonb;
begin
  -- Aislate this RPC from the global statement_timeout (which may be
  -- unset or set to a longer value for reports / batch AI).
  set local statement_timeout = '10s';

  -- Defence-in-depth: reject unauthenticated calls even if RLS is misconfigured.
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Insertar tarea; user_id viene de auth.uid(), nunca del payload del cliente.
  insert into tasks (
    name, task_link, product_type, status,
    month, year, user_id, assigned_qa,
    effort_score_date, tshirt_size, project_type
  )
  values (
    p_input->>'name',
    p_input->>'task_link',
    p_input->>'product_type',
    p_input->>'status',
    (p_input->>'month')::int,
    (p_input->>'year')::int,
    auth.uid(),
    case
      when p_input->'assigned_qa' is not null
      then array(select jsonb_array_elements_text(p_input->'assigned_qa'))
      else '{}'::text[]
    end,
    (p_input->>'effort_score_date')::date,
    p_input->>'tshirt_size',
    p_input->>'project_type'
  )
  returning * into v_task;

  -- Insertar squads en batch (solo si squads es un array válido)
  insert into task_squad (task_id, squad, low_returns, medium_returns, high_returns, calculated_score, additional_notes)
  select
    v_task.id,
    (sq->>'squad'),
    coalesce((sq->>'low_returns')::int, 0),
    coalesce((sq->>'medium_returns')::int, 0),
    coalesce((sq->>'high_returns')::int, 0),
    coalesce((sq->>'calculated_score')::numeric, 10),
    coalesce(sq->>'additional_notes', '')
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_input->'squads') = 'array' then p_input->'squads'
      else '[]'::jsonb
    end
  ) as sq;

  -- Recuperar squads insertados
  select jsonb_agg(ts) into v_squads
  from task_squad ts
  where ts.task_id = v_task.id;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'squads', coalesce(v_squads, '[]'::jsonb)
  );
end;
$$;

grant execute on function create_task_with_squads(jsonb) to authenticated;


-- ============================================================
-- RPC: update_task_with_squads  (replaces prior version)
-- ============================================================
create or replace function update_task_with_squads(p_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_task    tasks%rowtype;
  v_new_task    tasks%rowtype;
  v_old_squads  jsonb;
  v_new_squads  jsonb;
begin
  set local statement_timeout = '10s';

  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Snapshot old state
  select * into v_old_task from tasks where id = p_id;
  if not found then
    raise exception 'Task not found: %', p_id;
  end if;

  select jsonb_agg(ts) into v_old_squads
  from task_squad ts where ts.task_id = p_id;

  -- Use the ? operator to distinguish "key absent" from "key = null".
  -- This lets PATCH { effort_score_date: null } clear the date, while a
  -- PATCH that omits the key entirely leaves the existing value untouched.
  update tasks set
    name              = case when p_input ? 'name'              then p_input->>'name'              else name end,
    task_link         = case when p_input ? 'task_link'         then p_input->>'task_link'         else task_link end,
    product_type      = case when p_input ? 'product_type'      then p_input->>'product_type'      else product_type end,
    status            = case when p_input ? 'status'            then p_input->>'status'            else status end,
    month             = case when p_input ? 'month'             then (p_input->>'month')::int      else month end,
    year              = case when p_input ? 'year'              then (p_input->>'year')::int       else year end,
    assigned_qa       = case
                          when p_input ? 'assigned_qa' and p_input->'assigned_qa' is not null
                          then array(select jsonb_array_elements_text(p_input->'assigned_qa'))
                          when p_input ? 'assigned_qa'
                          then '{}'::text[]
                          else assigned_qa
                        end,
    effort_score_date = case when p_input ? 'effort_score_date' then (p_input->>'effort_score_date')::date else effort_score_date end,
    tshirt_size       = case when p_input ? 'tshirt_size'       then p_input->>'tshirt_size'       else tshirt_size end,
    project_type      = case when p_input ? 'project_type'      then p_input->>'project_type'      else project_type end,
    updated_at        = now()
  where id = p_id
  returning * into v_new_task;

  -- Si se proveen squads como array válido, reemplazar set completo
  if jsonb_typeof(p_input->'squads') = 'array' then
    delete from task_squad where task_id = p_id;

    insert into task_squad (task_id, squad, low_returns, medium_returns, high_returns, calculated_score, additional_notes)
    select
      p_id,
      (sq->>'squad'),
      coalesce((sq->>'low_returns')::int, 0),
      coalesce((sq->>'medium_returns')::int, 0),
      coalesce((sq->>'high_returns')::int, 0),
      coalesce((sq->>'calculated_score')::numeric, 10),
      coalesce(sq->>'additional_notes', '')
    from jsonb_array_elements(p_input->'squads') as sq;
  end if;

  -- Snapshot new squads state
  select jsonb_agg(ts) into v_new_squads
  from task_squad ts where ts.task_id = p_id;

  return jsonb_build_object(
    'old_task',   to_jsonb(v_old_task),
    'new_task',   to_jsonb(v_new_task),
    'old_squads', coalesce(v_old_squads, '[]'::jsonb),
    'new_squads', coalesce(v_new_squads, '[]'::jsonb)
  );
end;
$$;

grant execute on function update_task_with_squads(uuid, jsonb) to authenticated;


-- I5: document the covering index added in a prior migration
-- Covering index for SELECT role_id FROM user_profiles WHERE id = ?
-- Enables index-only scan; saves 1 heap fetch per auth call.
-- Trade-off: one extra index to maintain on writes (infrequent on this table).
comment on index user_profiles_id_role_idx is
  'Covering index: enables index-only scan for auth role lookup. '
  'Trade-off: 1 extra index on a write-infrequent table.';
