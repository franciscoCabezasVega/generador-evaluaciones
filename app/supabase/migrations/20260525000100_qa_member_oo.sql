-- ============================================================
-- Tabla de períodos OOO (Out of Office) por QA member
-- Requiere la extensión btree_gist para la constraint de solapamiento.
-- ============================================================

-- btree_gist es necesaria para EXCLUDE USING gist con tipos scalar (UUID)
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS qa_member_oo (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_id      UUID        NOT NULL REFERENCES qa_members(id) ON DELETE CASCADE,
  date_from  DATE        NOT NULL,
  date_to    DATE        NOT NULL,
  reason     TEXT,
  -- 'manual' = ingresado por el usuario; 'holiday' = generado automáticamente desde festivos
  source     TEXT        NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- date_to no puede ser anterior a date_from
  CONSTRAINT qa_member_oo_dates_check CHECK (date_to >= date_from),

  -- Impedir rangos solapados para el mismo QA
  -- (requiere btree_gist arriba)
  EXCLUDE USING gist (
    qa_id WITH =,
    daterange(date_from, date_to, '[]') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS qa_member_oo_qa_id_idx ON qa_member_oo (qa_id);
CREATE INDEX IF NOT EXISTS qa_member_oo_dates_idx ON qa_member_oo (date_from, date_to);
-- Índice para filtrar rápidamente por source (ej. DELETE ... WHERE source='holiday')
CREATE INDEX IF NOT EXISTS qa_member_oo_qa_source_idx ON qa_member_oo (qa_id, source);

-- ────────────────────────────────────────────────────────────
-- RLS: misma política que qa_members (catálogo)
-- ────────────────────────────────────────────────────────────
ALTER TABLE qa_member_oo ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer
CREATE POLICY "qa_member_oo_select_authenticated" ON qa_member_oo
  FOR SELECT
  USING (( SELECT auth.uid() AS uid) IS NOT NULL);

-- Solo admins pueden escribir
CREATE POLICY "qa_member_oo_insert_admin" ON qa_member_oo
  FOR INSERT
  WITH CHECK (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');

CREATE POLICY "qa_member_oo_update_admin" ON qa_member_oo
  FOR UPDATE
  USING   (get_user_role(( SELECT auth.uid() AS uid)) = 'admin')
  WITH CHECK (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');

CREATE POLICY "qa_member_oo_delete_admin" ON qa_member_oo
  FOR DELETE
  USING (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');
