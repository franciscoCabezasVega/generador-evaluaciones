-- ============================================================
-- Calendario laboral por QA member
-- Extiende qa_members con campos de horario, país, OOO flag.
-- Todos los campos tienen DEFAULT seguros → filas existentes no se rompen.
-- ============================================================

ALTER TABLE qa_members
  ADD COLUMN IF NOT EXISTS country_code CHAR(2)         DEFAULT 'CO',
  ADD COLUMN IF NOT EXISTS city         TEXT             DEFAULT 'Bogotá',
  ADD COLUMN IF NOT EXISTS timezone     TEXT             DEFAULT 'America/Bogota',
  ADD COLUMN IF NOT EXISTS work_start_time TIME          DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end_time   TIME          DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS lunch_hours     NUMERIC(3,2)  DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS work_days       INT[]         DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS is_ooo          BOOLEAN       DEFAULT FALSE;

-- CHECK: formato ISO 3166-1 alpha-2
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qa_members_country_code_check'
  ) THEN
    ALTER TABLE qa_members
      ADD CONSTRAINT qa_members_country_code_check
      CHECK (country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

-- CHECK: fin de jornada posterior al inicio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qa_members_work_hours_check'
  ) THEN
    ALTER TABLE qa_members
      ADD CONSTRAINT qa_members_work_hours_check
      CHECK (work_end_time > work_start_time);
  END IF;
END $$;

-- CHECK: almuerzo entre 0 y 4 horas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qa_members_lunch_hours_check'
  ) THEN
    ALTER TABLE qa_members
      ADD CONSTRAINT qa_members_lunch_hours_check
      CHECK (lunch_hours BETWEEN 0 AND 4);
  END IF;
END $$;

-- CHECK: work_days es subconjunto de [1,2,3,4,5,6,7] (ISO: 1=Lun..7=Dom)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qa_members_work_days_check'
  ) THEN
    ALTER TABLE qa_members
      ADD CONSTRAINT qa_members_work_days_check
      CHECK (work_days <@ ARRAY[1,2,3,4,5,6,7]);
  END IF;
END $$;

-- Backfill: asegurar que filas existentes tengan valores por defecto explícitos
UPDATE qa_members
SET
  country_code    = COALESCE(country_code,    'CO'),
  city            = COALESCE(city,            'Bogotá'),
  timezone        = COALESCE(timezone,        'America/Bogota'),
  work_start_time = COALESCE(work_start_time, '09:00'),
  work_end_time   = COALESCE(work_end_time,   '18:00'),
  lunch_hours     = COALESCE(lunch_hours,     1.00),
  work_days       = COALESCE(work_days,       ARRAY[1,2,3,4,5]),
  is_ooo          = COALESCE(is_ooo,          FALSE)
WHERE
  country_code    IS NULL
  OR city            IS NULL
  OR timezone        IS NULL
  OR work_start_time IS NULL
  OR work_end_time   IS NULL
  OR lunch_hours     IS NULL
  OR work_days       IS NULL
  OR is_ooo          IS NULL;
