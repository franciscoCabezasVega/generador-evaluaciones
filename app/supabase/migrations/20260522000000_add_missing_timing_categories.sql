-- Migration: add missing timing_categories rows for ClickUp sync
--
-- The STATUS_CATEGORY_MAP in clickupService.ts maps several ClickUp statuses
-- to these slugs. Without rows in timing_categories the sync silently skips
-- those hours (categoryMap.has(slug) returns false → the row is filtered out).
--
-- Slugs added here:
--   qa_retesting     ← "QA - Retesting" / "retesting"
--   qa_on_hold       ← "QA - On Hold"   / "on hold"
--   qa_fixed         ← "QA - Fixed"     / "fixed"
--   qa_sin_asignar   ← "QA - Sin Asignar"
--   qa_review_client ← "QA - Review Client" / "review client"
--
-- Colors/labels mirror the palette used for existing QA categories.

INSERT INTO timing_categories
  (slug, name, color, text_color, hex_color, display_order, is_system)
VALUES
  ('qa_retesting',     'QA - Retesting',     'bg-red-500/15',    'text-red-300',    '#EF4444', 6,  TRUE),
  ('qa_on_hold',       'QA - On Hold',       'bg-amber-500/15',  'text-amber-300',  '#F59E0B', 7,  TRUE),
  ('qa_fixed',         'QA - Fixed',         'bg-green-500/15',  'text-green-300',  '#22C55E', 8,  TRUE),
  ('qa_sin_asignar',   'QA - Sin Asignar',   'bg-gray-500/15',   'text-gray-400',   '#9CA3AF', 9,  TRUE),
  ('qa_review_client', 'QA - Review Client', 'bg-indigo-500/15', 'text-indigo-300', '#6366F1', 10, TRUE)
ON CONFLICT (slug) DO NOTHING;
