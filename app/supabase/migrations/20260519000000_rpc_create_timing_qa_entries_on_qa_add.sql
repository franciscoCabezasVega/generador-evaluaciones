-- Migration: when QA is added to a task that already has task_timings rows,
-- automatically create timing_qa_entries so ClickUp sync can write hours.
-- Previously the RPC only inserted task_qa rows but never linked them to
-- existing timing rows → sync returned skipped (no qa entries found).

CREATE OR REPLACE FUNCTION public.update_task_with_squads(p_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_old_task          tasks%rowtype;
  v_new_task          tasks%rowtype;
  v_old_squads        jsonb;
  v_new_squads        jsonb;
  v_new_qa_names      text[];
  v_removed_tq_id     uuid;
  v_replacement_qa_id uuid;
begin
  set local statement_timeout = '10s';

  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_old_task from tasks where id = p_id;
  if not found then
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

  -- ── Sync task_qa ────────────────────────────────────────────────────────────
  if p_input ? 'assigned_qa' and jsonb_typeof(p_input->'assigned_qa') = 'array' then
    v_new_qa_names := array(select jsonb_array_elements_text(p_input->'assigned_qa'));

    -- 1. Insert new QA names first so the replacement target already exists
    --    before we try to transfer timing entries to it.
    insert into task_qa (task_id, qa_name)
    select p_id, qa_name_val
    from unnest(v_new_qa_names) as qa_name_val
    where not exists (
      select 1 from task_qa tq where tq.task_id = p_id and tq.qa_name = qa_name_val
    );

    -- 1b. For newly added QA that are now in task_qa, create timing_qa_entries
    --     for every existing task_timings row so ClickUp sync can write hours.
    --     ON CONFLICT DO NOTHING ensures idempotency (re-adding same QA is safe).
    insert into timing_qa_entries (timing_id, task_qa_id)
    select tt.id, tq.id
    from task_timings tt
    cross join task_qa tq
    where tt.task_id = p_id
      and tq.task_id = p_id
      and tq.qa_name = any(v_new_qa_names)
      and not exists (
        select 1 from timing_qa_entries tqe
        where tqe.timing_id = tt.id and tqe.task_qa_id = tq.id
      );

    -- 2. For each QA being removed that still has timing entries:
    --    transfer their entries to the first remaining QA, or delete if none.
    for v_removed_tq_id in
      select tq.id
      from task_qa tq
      where tq.task_id = p_id
        and tq.qa_name <> all(v_new_qa_names)
        and exists (select 1 from timing_qa_entries tqe where tqe.task_qa_id = tq.id)
    loop
      select tq2.id into v_replacement_qa_id
      from task_qa tq2
      where tq2.task_id = p_id
        and tq2.qa_name = any(v_new_qa_names)
      order by tq2.created_at
      limit 1;

      if v_replacement_qa_id is not null then
        update timing_qa_entries
        set task_qa_id = v_replacement_qa_id
        where task_qa_id = v_removed_tq_id;
      else
        -- No remaining QA — cascade delete the orphaned timing data.
        delete from timing_qa_category_hours
        where timing_qa_entry_id in (
          select id from timing_qa_entries where task_qa_id = v_removed_tq_id
        );
        delete from timing_qa_entries where task_qa_id = v_removed_tq_id;
      end if;
    end loop;

    -- 3. All removed QA are now free of timing entries — delete them.
    delete from task_qa
    where task_id = p_id
      and qa_name <> all(v_new_qa_names);
  end if;
  -- ────────────────────────────────────────────────────────────────────────────

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
$function$;
