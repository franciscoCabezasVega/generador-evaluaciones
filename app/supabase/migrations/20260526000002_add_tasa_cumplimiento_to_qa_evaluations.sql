-- Agrega columnas para almacenar tasa_aceptacion y cumplimiento en períodos cerrados.
-- Cuando son NULL el servicio las calcula en tiempo real; cuando tienen valor se usan directamente.
ALTER TABLE public.qa_evaluations
  ADD COLUMN IF NOT EXISTS tasa_aceptacion NUMERIC(3,2)
    CHECK (tasa_aceptacion IS NULL OR (tasa_aceptacion >= 0 AND tasa_aceptacion <= 5)),
  ADD COLUMN IF NOT EXISTS cumplimiento    NUMERIC(3,2)
    CHECK (cumplimiento    IS NULL OR (cumplimiento    >= 0 AND cumplimiento    <= 5));
