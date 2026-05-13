-- ============================================================
-- Migration: revert_tqch_select_to_authenticated
-- Date: 2026-05-13
-- Author: GitHub Copilot (Agente de evaluación)
-- ============================================================
--
-- DECISIÓN DE ARQUITECTURA — por qué esta política es permisiva para lectura
-- -------------------------------------------------------------------------
-- La migración anterior (fix_timing_qa_category_hours_rls) introdujo la
-- política tqch_select_owner, que restringía el SELECT de
-- timing_qa_category_hours exigiendo que task_timings.user_id = auth.uid().
--
-- Esto rompió la visibilidad de horas en tres escenarios reales:
--   1. El admin necesita ver todos los timings de forma transversal
--      (panel de administración, métricas globales de equipo).
--   2. Los miembros QA no podían leer sus propias horas si no eran
--      quienes crearon el task_timing.
--   3. Cualquier escenario multi-usuario donde el timing fue creado
--      por el usuario A y visualizado por el usuario B (ej: TimingForm
--      con initialData cargado desde la lista paginada del admin).
--
-- JUSTIFICACIÓN de la permisividad:
--   timing_qa_category_hours almacena métricas de horas agregadas por
--   categoría (effective_testing, qa_on_hold, etc.). No contiene PII,
--   datos financieros ni información sensible que justifique aislamiento
--   por fila en lectura. El control de acceso en escritura (INSERT /
--   UPDATE / DELETE) permanece owner-based para preservar integridad.
--
-- FUTURO: Si se requiere aislamiento por usuario en lectura, el patrón
-- correcto es:  is_admin_user() OR (owner check)
-- Nunca solo (owner check) porque rompe la visibilidad transversal del admin.
-- ============================================================

-- Eliminar la política restrictiva anterior
DROP POLICY IF EXISTS tqch_select_owner ON timing_qa_category_hours;

-- Crear política permisiva: cualquier usuario autenticado puede leer
CREATE POLICY tqch_select_authenticated
  ON timing_qa_category_hours
  FOR SELECT
  TO authenticated
  USING (true);
