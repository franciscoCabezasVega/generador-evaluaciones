-- Agregar columna requires_squad a project_types
-- Por defecto todos requieren squad (true)
ALTER TABLE project_types
  ADD COLUMN IF NOT EXISTS requires_squad BOOLEAN NOT NULL DEFAULT TRUE;

-- Las únicas excepciones conocidas no requieren squad
UPDATE project_types
  SET requires_squad = FALSE
  WHERE name IN ('Automatización QA', 'Sin evaluaciones de fabrica');
