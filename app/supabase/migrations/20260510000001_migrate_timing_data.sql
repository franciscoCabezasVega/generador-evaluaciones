-- ============================================================
-- PR1 — Backfill: migrar horas existentes → timing_qa_category_hours
-- Idempotente: ON CONFLICT DO NOTHING + filtro > 0
-- ============================================================

-- Testing efectivo
INSERT INTO timing_qa_category_hours (timing_qa_entry_id, category_id, hours)
SELECT e.id,
       (SELECT id FROM timing_categories WHERE slug = 'effective_testing'),
       e.effective_testing_hours::INTEGER
FROM timing_qa_entries e
WHERE COALESCE(e.effective_testing_hours, 0) > 0
ON CONFLICT (timing_qa_entry_id, category_id) DO NOTHING;

-- Espera ambiente
INSERT INTO timing_qa_category_hours (timing_qa_entry_id, category_id, hours)
SELECT e.id,
       (SELECT id FROM timing_categories WHERE slug = 'waiting_environment'),
       e.waiting_environment_hours::INTEGER
FROM timing_qa_entries e
WHERE COALESCE(e.waiting_environment_hours, 0) > 0
ON CONFLICT (timing_qa_entry_id, category_id) DO NOTHING;

-- Espera fixes
INSERT INTO timing_qa_category_hours (timing_qa_entry_id, category_id, hours)
SELECT e.id,
       (SELECT id FROM timing_categories WHERE slug = 'waiting_development_fixes'),
       e.waiting_development_fixes_hours::INTEGER
FROM timing_qa_entries e
WHERE COALESCE(e.waiting_development_fixes_hours, 0) > 0
ON CONFLICT (timing_qa_entry_id, category_id) DO NOTHING;

-- Re-test
INSERT INTO timing_qa_category_hours (timing_qa_entry_id, category_id, hours)
SELECT e.id,
       (SELECT id FROM timing_categories WHERE slug = 'retest'),
       e.retest_hours::INTEGER
FROM timing_qa_entries e
WHERE COALESCE(e.retest_hours, 0) > 0
ON CONFLICT (timing_qa_entry_id, category_id) DO NOTHING;

-- Clarificaciones
INSERT INTO timing_qa_category_hours (timing_qa_entry_id, category_id, hours)
SELECT e.id,
       (SELECT id FROM timing_categories WHERE slug = 'clarification'),
       e.clarification_hours::INTEGER
FROM timing_qa_entries e
WHERE COALESCE(e.clarification_hours, 0) > 0
ON CONFLICT (timing_qa_entry_id, category_id) DO NOTHING;

-- Verificación post-migración (no crítica, informativa)
-- SELECT tc.slug, COUNT(*) AS filas
-- FROM timing_qa_category_hours tqch
-- JOIN timing_categories tc ON tc.id = tqch.category_id
-- GROUP BY tc.slug ORDER BY tc.slug;
