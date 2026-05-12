-- Fix: use a stable SQLSTATE (P0002 = no_data_found) for the "task not found"
-- condition in update_task_with_squads instead of a free-text message.
-- TypeScript now checks rpcError.code === 'P0002' — immune to i18n / driver changes.

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

  select * into v_old_task from tasks where id = p_id;
  if not found then
    -- P0002 = no_data_found: stable SQLSTATE, independent of message text / i18n.
    raise exception 'Task not found: %', p_id using errcode = 'P0002';
  end if;

  select jsonb_agg(ts) into v_old_squads
  from task_squad ts where ts.task_id = p_id;

  update tasks set
    name              = case when p_input ? 'name'              then p_input->>'name'              else name end,
    task_link         = case when p_input ? 'task_link'         then p_input->>'task_link'         else task_link end,
    product_type      = case when p_input ? 'product_type'      then p_input->>'product_type'      else product_type end,
    status            = case when p_input ? 'status'            then p_input->>'status'            else status end,
    month             = case when p_input ? 'month'             then (p_input->>'month')::int      else month end,
    year              = case when p_input ? 'year'              then (p_input->>'year')::int       else year end,
    assigned_qa       = case
                          when p_input ? 'assigned_qa' and jsonb_typeof(p_input->'assigned_qa') = 'array'
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
