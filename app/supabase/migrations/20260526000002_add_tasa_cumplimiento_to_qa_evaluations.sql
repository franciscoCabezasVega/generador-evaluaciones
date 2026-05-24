-- Agrega columnas para almacenar tasa_aceptacion y cumplimiento en períodos cerrados.
-- Cuando son NULL el servicio las calcula en tiempo real; cuando tienen valor se usan directamente.
ALTER TABLE public.qa_evaluations
  ADD COLUMN IF NOT EXISTS tasa_aceptacion numeric,
  ADD COLUMN IF NOT EXISTS cumplimiento    numeric;
