-- ============================================================
-- PR5 — Drop columnas legacy + recrear VIEW
-- Esta migración usa DROP IF EXISTS y CREATE OR REPLACE para ser idempotente.
-- Es seguro ejecutarla en orden automático siempre que las columnas nuevas
-- (timing_qa_category_hours) existan (migración 20260510000000_create_timing_categories.sql previa).
-- ============================================================

-- 1. Eliminar VIEW que depende de las columnas antiguas
DROP VIEW IF EXISTS task_timings_with_totals;

-- 2. Recrear VIEW usando la nueva estructura dinámica
CREATE VIEW task_timings_with_totals AS
SELECT
  t.id,
  t.task_id,
  t.month,
  t.year,
  t.user_id,
  t.created_at,
  t.updated_at,
  COALESCE(SUM(ch.hours), 0)::INTEGER AS total_hours
FROM task_timings t
LEFT JOIN timing_qa_entries e  ON e.timing_id = t.id
LEFT JOIN timing_qa_category_hours ch ON ch.timing_qa_entry_id = e.id
GROUP BY t.id;

-- 3. Drop columnas legacy de timing_qa_entries
ALTER TABLE timing_qa_entries
  DROP COLUMN IF EXISTS total_hours,
  DROP COLUMN IF EXISTS effective_testing_hours,
  DROP COLUMN IF EXISTS waiting_environment_hours,
  DROP COLUMN IF EXISTS waiting_development_fixes_hours,
  DROP COLUMN IF EXISTS retest_hours,
  DROP COLUMN IF EXISTS clarification_hours;

-- 4. Drop columnas legacy de task_timings (si existen duplicadas)
ALTER TABLE task_timings
  DROP COLUMN IF EXISTS effective_testing_hours,
  DROP COLUMN IF EXISTS waiting_environment_hours,
  DROP COLUMN IF EXISTS waiting_development_fixes_hours,
  DROP COLUMN IF EXISTS retest_hours,
  DROP COLUMN IF EXISTS clarification_hours;
