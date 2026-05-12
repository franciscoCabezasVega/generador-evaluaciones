-- ============================================================
-- ClickUp Integration
-- ============================================================

-- API key storage (single-row table, encrypted with AES-GCM)
CREATE TABLE clickup_settings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_key TEXT       NOT NULL,
  key_iv        TEXT       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
CREATE TRIGGER set_clickup_settings_updated_at
  BEFORE UPDATE ON clickup_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Per-task sync state
CREATE TABLE clickup_task_sync (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE UNIQUE,
  clickup_qa_task_id   TEXT        NOT NULL,
  sync_enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_synced_at       TIMESTAMPTZ,
  last_clickup_status  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX clickup_task_sync_task_id_idx     ON clickup_task_sync (task_id);
CREATE INDEX clickup_task_sync_sync_enabled_idx ON clickup_task_sync (sync_enabled) WHERE sync_enabled = TRUE;

-- Trigger updated_at
CREATE TRIGGER set_clickup_task_sync_updated_at
  BEFORE UPDATE ON clickup_task_sync
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add ClickUp user ID to QA members (nullable, no uniqueness constraint)
ALTER TABLE qa_members ADD COLUMN IF NOT EXISTS clickup_user_id TEXT;

-- ────────────────────────────────────────────────────────────
-- RLS: solo service role puede acceder (no user-level access)
-- ────────────────────────────────────────────────────────────

ALTER TABLE clickup_settings ENABLE ROW LEVEL SECURITY;

-- Block all direct user access; service role bypasses RLS
CREATE POLICY "clickup_settings_no_direct_access" ON clickup_settings
  USING (false);

ALTER TABLE clickup_task_sync ENABLE ROW LEVEL SECURITY;

-- Block all direct user access; service role bypasses RLS
CREATE POLICY "clickup_task_sync_no_direct_access" ON clickup_task_sync
  USING (false);
