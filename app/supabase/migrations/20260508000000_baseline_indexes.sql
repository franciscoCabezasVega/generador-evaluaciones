-- =============================================================================
-- Baseline indexes migration
-- Ejecutar en SQL Editor de Supabase con CONCURRENTLY para no bloquear escrituras
-- Usar IF NOT EXISTS para idempotencia
-- =============================================================================

-- tasks: filtros más usados (user_id, year, month, status, product_type)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_user_year_month_status_idx
  ON tasks (user_id, year, month, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_product_type_idx
  ON tasks (product_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_effort_score_date_idx
  ON tasks (effort_score_date);

-- Unique para dedup por link (ya debe existir vía constraint, pero por si acaso)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS tasks_task_link_uniq
  ON tasks (task_link);

-- task_squad: FK y filtro por squad
CREATE INDEX CONCURRENTLY IF NOT EXISTS task_squad_task_id_idx
  ON task_squad (task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_squad_squad_idx
  ON task_squad (squad);

-- task_qa: unique para upsert onConflict
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS task_qa_task_qaname_uniq
  ON task_qa (task_id, qa_name);

-- task_timings: FK + filtro de mes/año
CREATE INDEX CONCURRENTLY IF NOT EXISTS task_timings_task_year_month_idx
  ON task_timings (task_id, year, month);

-- timing_qa_entries: FK lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS timing_qa_entries_timing_id_idx
  ON timing_qa_entries (timing_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS timing_qa_entries_task_qa_id_idx
  ON timing_qa_entries (task_qa_id);

-- audit_logs: tabla de mayor crecimiento, ordenadas por timestamp desc
CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs (entity_type, entity_id, "timestamp" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_logs_user_ts_idx
  ON audit_logs (user_id, "timestamp" DESC);

-- reports: versionado por squad/mes/año
CREATE INDEX CONCURRENTLY IF NOT EXISTS reports_squad_year_month_version_idx
  ON reports (squad, year, month, version DESC);

-- Actualizar estadísticas del planner
ANALYZE;
