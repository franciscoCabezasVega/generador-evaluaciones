-- ─── Migración: GRANTs explícitos baseline ───────────────────────────────────
--
-- CONTEXTO:
--   A partir de octubre 2026 Supabase cambia el comportamiento por defecto de la
--   Data API (PostgREST): las tablas del schema "public" ya no quedan expuestas
--   automáticamente al rol "authenticated" ni "anon" — se requieren GRANTs
--   explícitos. Esta migración los crea para todas las tablas existentes.
--
-- PRINCIPIO:
--   Los GRANTs aquí son necesarios para que PostgREST pueda ver las tablas.
--   El control real de acceso a filas/columnas sigue siendo responsabilidad
--   de las políticas RLS en cada tabla. Los GRANTs habilitan el canal;
--   RLS controla qué datos fluyen por él.
--
-- REGLA PARA FUTURAS TABLAS:
--   Toda migración que cree una tabla en "public" debe incluir:
--     1. ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
--     2. Los GRANTs correspondientes (ver plantilla _TEMPLATE_new_table.sql)
--     3. Las políticas RLS necesarias
-- ─────────────────────────────────────────────────────────────────────────────

-- ── tasks ──────────────────────────────────────────────────────────────────
-- Acceso completo para usuarios autenticados (RLS filtra por rol/squad)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
-- anon: sin acceso (requiere login)
REVOKE ALL ON public.tasks FROM anon;

-- ── task_squad ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_squad TO authenticated;
REVOKE ALL ON public.task_squad FROM anon;

-- ── reports ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
REVOKE ALL ON public.reports FROM anon;

-- ── roles ──────────────────────────────────────────────────────────────────
-- Solo lectura para authenticated (tabla de catálogo)
GRANT SELECT ON public.roles TO authenticated;
REVOKE ALL ON public.roles FROM anon;

-- ── user_profiles ──────────────────────────────────────────────────────────
-- RLS garantiza que cada usuario solo ve/modifica su propio perfil
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
REVOKE ALL ON public.user_profiles FROM anon;

-- ── audit_logs ─────────────────────────────────────────────────────────────
-- INSERT via SECURITY DEFINER function; SELECT para usuarios autenticados
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
REVOKE ALL ON public.audit_logs FROM anon;

-- ── feedback_reports ───────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_reports TO authenticated;
REVOKE ALL ON public.feedback_reports FROM anon;

-- ── task_timings ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_timings TO authenticated;
REVOKE ALL ON public.task_timings FROM anon;

-- ── timing_qa_entries ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timing_qa_entries TO authenticated;
REVOKE ALL ON public.timing_qa_entries FROM anon;

-- ── task_qa ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_qa TO authenticated;
REVOKE ALL ON public.task_qa FROM anon;

-- ── products ───────────────────────────────────────────────────────────────
-- Catálogo de productos (lectura para authenticated)
GRANT SELECT ON public.products TO authenticated;
REVOKE ALL ON public.products FROM anon;

-- ── project_types ──────────────────────────────────────────────────────────
GRANT SELECT ON public.project_types TO authenticated;
REVOKE ALL ON public.project_types FROM anon;

-- ── complexities ───────────────────────────────────────────────────────────
GRANT SELECT ON public.complexities TO authenticated;
REVOKE ALL ON public.complexities FROM anon;

-- ── squads ─────────────────────────────────────────────────────────────────
GRANT SELECT ON public.squads TO authenticated;
REVOKE ALL ON public.squads FROM anon;

-- ── qa_members ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_members TO authenticated;
REVOKE ALL ON public.qa_members FROM anon;

-- ── timing_categories ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timing_categories TO authenticated;
REVOKE ALL ON public.timing_categories FROM anon;

-- ── timing_qa_category_hours ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timing_qa_category_hours TO authenticated;
REVOKE ALL ON public.timing_qa_category_hours FROM anon;

-- ── clickup_settings ───────────────────────────────────────────────────────
-- IMPORTANTE: Solo service_role puede modificar. authenticated SOLO puede leer
-- las columnas no-sensibles expuestas por las políticas RLS existentes.
-- El token de ClickUp está cifrado y NUNCA se expone por PostgREST.
GRANT SELECT ON public.clickup_settings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.clickup_settings FROM authenticated;
REVOKE ALL ON public.clickup_settings FROM anon;

-- ── clickup_task_sync ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clickup_task_sync TO authenticated;
REVOKE ALL ON public.clickup_task_sync FROM anon;

-- ── qa_member_oo ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_member_oo TO authenticated;
REVOKE ALL ON public.qa_member_oo FROM anon;

-- ── holidays ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
REVOKE ALL ON public.holidays FROM anon;

-- ── qa_evaluations ─────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_evaluations TO authenticated;
REVOKE ALL ON public.qa_evaluations FROM anon;
