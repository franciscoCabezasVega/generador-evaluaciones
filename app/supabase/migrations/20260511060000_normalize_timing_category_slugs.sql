-- ============================================================
-- Normalizar slugs de timing_categories a nombres semánticos
-- para alinear con los cálculos de métricas en el código.
--
-- Mapa de renombrado:
--   qa_testing            → effective_testing
--   qa_ready_for_testing  → retest
--   qa_returned_to_dev    → waiting_development_fixes
--   qa_en_espera_ambiente → waiting_environment
--   qa_clarificaciones    → clarification
-- ============================================================

UPDATE timing_categories
SET slug = 'effective_testing', updated_at = NOW()
WHERE slug = 'qa_testing';

UPDATE timing_categories
SET slug = 'retest', updated_at = NOW()
WHERE slug = 'qa_ready_for_testing';

UPDATE timing_categories
SET slug = 'waiting_development_fixes', updated_at = NOW()
WHERE slug = 'qa_returned_to_dev';

UPDATE timing_categories
SET slug = 'waiting_environment', updated_at = NOW()
WHERE slug = 'qa_en_espera_ambiente';

UPDATE timing_categories
SET slug = 'clarification', updated_at = NOW()
WHERE slug = 'qa_clarificaciones';
