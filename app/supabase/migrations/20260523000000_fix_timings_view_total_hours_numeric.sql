-- Migration: recreate task_timings_with_totals without the ::INTEGER cast on total_hours.
--
-- After migration 20260521000000 changed timing_qa_category_hours.hours from INTEGER
-- to NUMERIC(10,2), the VIEW's COALESCE(SUM(ch.hours), 0)::INTEGER cast re-introduced
-- truncation for all consumers of the view (TimingsList, TimingMetrics, API routes).
-- A ClickUp-synced timing with 20.88 hours would display as 20 in the UI.
-- Removing the ::INTEGER cast preserves decimal precision throughout the stack.

DROP VIEW IF EXISTS task_timings_with_totals;

CREATE VIEW task_timings_with_totals AS
SELECT
  t.id,
  t.task_id,
  t.month,
  t.year,
  t.user_id,
  t.created_at,
  t.updated_at,
  COALESCE(SUM(ch.hours), 0)::NUMERIC(10, 2) AS total_hours
FROM task_timings t
LEFT JOIN timing_qa_entries e  ON e.timing_id = t.id
LEFT JOIN timing_qa_category_hours ch ON ch.timing_qa_entry_id = e.id
GROUP BY t.id;
