CREATE TABLE qa_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_id UUID NOT NULL REFERENCES qa_members(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  excelencia NUMERIC(3,2) CHECK (excelencia IS NULL OR (excelencia >= 0 AND excelencia <= 5)),
  soft_skills NUMERIC(3,2) CHECK (soft_skills IS NULL OR (soft_skills >= 0 AND soft_skills <= 5)),
  comentarios TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT qa_evaluations_range_valid CHECK (start_date <= end_date),
  CONSTRAINT qa_evaluations_unique_qa_range UNIQUE (qa_id, start_date, end_date)
);

-- qa_evaluations_qa_id_idx omitido aquí: está cubierto por
-- qa_evaluations_unique_qa_range (qa_id, start_date, end_date)
CREATE INDEX qa_evaluations_dates_idx ON qa_evaluations(start_date, end_date);

ALTER TABLE qa_evaluations ENABLE ROW LEVEL SECURITY;
-- Las políticas de acceso se crean en la migración siguiente (000001)
-- donde existe get_user_is_lead. Con RLS habilitado sin policies = DENY por defecto,
-- lo que evita una ventana de exposición amplia entre migraciones.

CREATE TRIGGER qa_evaluations_set_updated_at
  BEFORE UPDATE ON qa_evaluations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
