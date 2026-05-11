-- ============================================================
-- PR1 — Crear tabla timing_categories + tabla puente
-- ============================================================

-- Tabla principal de catálogo
CREATE TABLE timing_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  color         VARCHAR(40) NOT NULL DEFAULT 'bg-gray-100',
  text_color    VARCHAR(40) NOT NULL DEFAULT 'text-gray-600',
  hex_color     VARCHAR(7)  NOT NULL DEFAULT '#6B7280',
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_system     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unicidad de nombre activo (case-insensitive)
CREATE UNIQUE INDEX timing_categories_name_lower_active_uniq
  ON timing_categories (LOWER(name)) WHERE is_active;

-- Índice para orden de consulta habitual
CREATE INDEX timing_categories_active_order_idx
  ON timing_categories (is_active, display_order);

-- Trigger updated_at (reutiliza la función existente)
CREATE TRIGGER set_timing_categories_updated_at
  BEFORE UPDATE ON timing_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ────────────────────────────────────────────────────────────
-- RLS: replicar políticas de products
-- ────────────────────────────────────────────────────────────
ALTER TABLE timing_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_select_authenticated ON timing_categories
  FOR SELECT USING (( SELECT auth.uid() AS uid) IS NOT NULL);

CREATE POLICY catalog_insert_admin ON timing_categories
  FOR INSERT WITH CHECK (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');

CREATE POLICY catalog_update_admin ON timing_categories
  FOR UPDATE USING   (get_user_role(( SELECT auth.uid() AS uid)) = 'admin')
             WITH CHECK (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');

CREATE POLICY catalog_delete_admin ON timing_categories
  FOR DELETE USING   (get_user_role(( SELECT auth.uid() AS uid)) = 'admin');

-- ────────────────────────────────────────────────────────────
-- Seed: 5 categorías del sistema (idempotente)
-- ────────────────────────────────────────────────────────────
INSERT INTO timing_categories
  (slug, name, color, text_color, hex_color, display_order, is_system)
VALUES
  ('effective_testing',         'Testing efectivo', 'bg-blue-100',      'text-blue-600',   '#3B82F6', 1, TRUE),
  ('waiting_environment',       'Espera ambiente',  'bg-purple-500/15', 'text-purple-300', '#A855F7', 2, TRUE),
  ('waiting_development_fixes', 'Espera fixes',     'bg-orange-500/15', 'text-orange-300', '#F97316', 3, TRUE),
  ('retest',                    'Re-test',          'bg-red-500/15',    'text-red-300',    '#EF4444', 4, TRUE),
  ('clarification',             'Clarificaciones',  'bg-yellow-500/15', 'text-yellow-300', '#EAB308', 5, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Tabla puente: horas por QA entry + categoría
-- ============================================================
CREATE TABLE timing_qa_category_hours (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  timing_qa_entry_id UUID       NOT NULL REFERENCES timing_qa_entries(id) ON DELETE CASCADE,
  category_id        UUID       NOT NULL REFERENCES timing_categories(id) ON DELETE RESTRICT,
  hours              INTEGER    NOT NULL DEFAULT 0 CHECK (hours >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (timing_qa_entry_id, category_id)
);

CREATE INDEX timing_qa_category_hours_entry_idx    ON timing_qa_category_hours (timing_qa_entry_id);
CREATE INDEX timing_qa_category_hours_category_idx ON timing_qa_category_hours (category_id);

-- Trigger updated_at
CREATE TRIGGER set_timing_qa_category_hours_updated_at
  BEFORE UPDATE ON timing_qa_category_hours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: mismas políticas que la tabla padre (timing_qa_entries)
ALTER TABLE timing_qa_category_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY tqch_select_authenticated ON timing_qa_category_hours
  FOR SELECT USING (( SELECT auth.uid() AS uid) IS NOT NULL);

CREATE POLICY tqch_insert_authenticated ON timing_qa_category_hours
  FOR INSERT WITH CHECK (( SELECT auth.uid() AS uid) IS NOT NULL);

CREATE POLICY tqch_update_authenticated ON timing_qa_category_hours
  FOR UPDATE USING   (( SELECT auth.uid() AS uid) IS NOT NULL)
             WITH CHECK (( SELECT auth.uid() AS uid) IS NOT NULL);

CREATE POLICY tqch_delete_authenticated ON timing_qa_category_hours
  FOR DELETE USING   (( SELECT auth.uid() AS uid) IS NOT NULL);
