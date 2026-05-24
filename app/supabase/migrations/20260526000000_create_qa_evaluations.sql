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

CREATE INDEX qa_evaluations_qa_id_idx ON qa_evaluations(qa_id);
CREATE INDEX qa_evaluations_dates_idx ON qa_evaluations(start_date, end_date);

ALTER TABLE qa_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY qa_evaluations_select ON qa_evaluations
  FOR SELECT TO authenticated USING (true);

-- Sólo admin puede crear/editar/borrar evaluaciones
CREATE POLICY qa_evaluations_admin_write ON qa_evaluations
  FOR ALL TO authenticated
  USING (get_user_role(( SELECT auth.uid() AS uid)) = 'admin')
  WITH CHECK (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');

CREATE TRIGGER qa_evaluations_set_updated_at
  BEFORE UPDATE ON qa_evaluations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
