-- Capa 3: RPCs atómicas para create/update de tareas
-- Reduce roundtrips y garantiza consistencia transaccional

-- ============================================================
-- RPC: create_task_with_squads
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
  -- Insertar tarea
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
    (p_input->>'user_id')::uuid,
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
-- RPC: update_task_with_squads
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
  v_squad_ids   uuid[];
begin
  -- Snapshot old state
  select * into v_old_task from tasks where id = p_id;
  if not found then
    raise exception 'Task not found: %', p_id;
  end if;

  select jsonb_agg(ts) into v_old_squads
  from task_squad ts where ts.task_id = p_id;

  -- Actualizar tarea
  update tasks set
    name             = coalesce(p_input->>'name',             name),
    task_link        = coalesce(p_input->>'task_link',        task_link),
    product_type     = coalesce(p_input->>'product_type',     product_type),
    status           = coalesce(p_input->>'status',           status),
    month            = coalesce((p_input->>'month')::int,     month),
    year             = coalesce((p_input->>'year')::int,      year),
    assigned_qa      = case
                         when p_input->'assigned_qa' is not null
                         then array(select jsonb_array_elements_text(p_input->'assigned_qa'))
                         else assigned_qa
                       end,
    effort_score_date = coalesce((p_input->>'effort_score_date')::date, effort_score_date),
    tshirt_size      = coalesce(p_input->>'tshirt_size',      tshirt_size),
    project_type     = coalesce(p_input->>'project_type',     project_type),
    updated_at       = now()
  where id = p_id
  returning * into v_new_task;

  -- Si se proveen squads como array válido, reemplazar set completo
  if jsonb_typeof(p_input->'squads') = 'array' then
    -- Eliminar squads existentes
    delete from task_squad where task_id = p_id;

    -- Insertar nuevos squads en batch
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
