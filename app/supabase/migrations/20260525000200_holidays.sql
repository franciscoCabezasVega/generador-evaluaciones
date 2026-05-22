-- ============================================================
-- Tabla de caché de festivos por país (via Nager.Date)
-- ============================================================

CREATE TABLE IF NOT EXISTS holidays (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2)     NOT NULL,
  holiday_date DATE        NOT NULL,
  name         TEXT        NOT NULL,
  source       TEXT        NOT NULL DEFAULT 'nager.date',
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT holidays_country_code_check
    CHECK (country_code ~ '^[A-Z]{2}$'),

  UNIQUE (country_code, holiday_date)
);

CREATE INDEX IF NOT EXISTS holidays_country_date_idx
  ON holidays (country_code, holiday_date);

-- ────────────────────────────────────────────────────────────
-- RLS:
--   - Lectura: cualquier usuario autenticado
--   - Escritura: solo service_role (el workCalendarService usa getServiceClient()
--     que bypasa RLS; ningún usuario directo puede insertar/actualizar/borrar)
-- ────────────────────────────────────────────────────────────
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select_authenticated" ON holidays
  FOR SELECT
  USING (( SELECT auth.uid() AS uid) IS NOT NULL);

-- No se crea política de escritura para usuarios: service_role bypasa RLS.
-- Esto asegura que solo el backend (cron/sync) puede modificar esta tabla.
