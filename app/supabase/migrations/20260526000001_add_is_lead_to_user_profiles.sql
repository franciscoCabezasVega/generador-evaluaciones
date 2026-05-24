-- Agrega la bandera is_lead a user_profiles para controlar acceso a QA evaluations
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT false;

-- Función helper para usar en políticas RLS
-- SECURITY INVOKER: se ejecuta con los permisos del llamante (más seguro que DEFINER).
-- search_path fijo para evitar search_path hijacking.
CREATE OR REPLACE FUNCTION get_user_is_lead(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT COALESCE(is_lead, false) FROM user_profiles WHERE id = user_id;
$$;

REVOKE EXECUTE ON FUNCTION get_user_is_lead(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION get_user_is_lead(UUID) TO authenticated;

-- Reemplazar políticas múltiples en qa_evaluations por una sola (evita múltiples
-- políticas permisivas para SELECT que penalizan el rendimiento)
DROP POLICY IF EXISTS qa_evaluations_select ON qa_evaluations;
DROP POLICY IF EXISTS qa_evaluations_admin_write ON qa_evaluations;
DROP POLICY IF EXISTS qa_evaluations_lead_select ON qa_evaluations;
DROP POLICY IF EXISTS qa_evaluations_lead_write ON qa_evaluations;

-- Política única: solo leads pueden leer y escribir (una sola para SELECT+write)
CREATE POLICY qa_evaluations_lead_all ON qa_evaluations
  FOR ALL TO authenticated
  USING (get_user_is_lead(auth.uid()))
  WITH CHECK (get_user_is_lead(auth.uid()));

-- Índice para FK created_by (FK sin índice detectado por el advisor)
CREATE INDEX IF NOT EXISTS qa_evaluations_created_by_idx
  ON qa_evaluations (created_by);

-- Eliminar índices redundantes:
-- qa_evaluations_qa_id_idx está cubierto por qa_evaluations_unique_qa_range(qa_id, start_date, end_date)
DROP INDEX IF EXISTS qa_evaluations_qa_id_idx;

-- qa_member_oo_qa_id_idx está cubierto por qa_member_oo_qa_id_daterange_excl (GiST con qa_id como primera columna)
DROP INDEX IF EXISTS qa_member_oo_qa_id_idx;

-- idx_reports_created_at / idx_reports_created_by: 0 scans, no hay queries que filtren por estos campos
DROP INDEX IF EXISTS idx_reports_created_at;
DROP INDEX IF EXISTS idx_reports_created_by;
