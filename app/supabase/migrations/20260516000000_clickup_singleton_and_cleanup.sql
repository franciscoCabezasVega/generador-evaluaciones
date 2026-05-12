-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clickup_singleton_and_cleanup
-- Date: 2026-05-16
-- Purpose:
--   1. Drop the redundant btree index on clickup_task_sync(task_id) that was
--      created explicitly in the previous migration even though the UNIQUE
--      constraint already creates an identical index automatically.
--   2. Add a singleton enforcement column to clickup_settings so the table
--      can hold at most one row at the DB level, enabling safe upsert.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop redundant index (the UNIQUE constraint already provides this index)
DROP INDEX IF EXISTS clickup_task_sync_task_id_idx;

-- 2. Add singleton_key to clickup_settings
--    The column is always TRUE; the unique constraint prevents a second row.
ALTER TABLE clickup_settings
  ADD COLUMN IF NOT EXISTS singleton_key BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS clickup_settings_singleton_idx
  ON clickup_settings (singleton_key);
