-- ============================================================
-- Proteger categorías del sistema a nivel DB
-- Las políticas catalog_update_admin y catalog_delete_admin de la migración
-- 20260510000000 permiten a cualquier admin modificar o eliminar categorías
-- con is_system = true (p. ej. effective_testing, retest), que son necesarias
-- para el cálculo de métricas. Esta migración reemplaza esas políticas
-- añadiendo la condición NOT is_system en UPDATE y DELETE.
-- ============================================================

-- Reemplazar política de UPDATE: solo categorías no-sistema
DROP POLICY IF EXISTS catalog_update_admin ON timing_categories;
CREATE POLICY catalog_update_admin ON timing_categories
  FOR UPDATE
  USING (
    get_user_role(( SELECT auth.uid() AS uid)) = 'admin'
    AND NOT is_system
  )
  WITH CHECK (
    get_user_role(( SELECT auth.uid() AS uid)) = 'admin'
    AND NOT is_system
  );

-- Reemplazar política de DELETE: solo categorías no-sistema
DROP POLICY IF EXISTS catalog_delete_admin ON timing_categories;
CREATE POLICY catalog_delete_admin ON timing_categories
  FOR DELETE
  USING (
    get_user_role(( SELECT auth.uid() AS uid)) = 'admin'
    AND NOT is_system
  );
