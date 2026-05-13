-- ============================================================
-- Fix: Agregar is_admin_user() a las políticas de escritura
-- de timing_qa_category_hours para que los admins puedan
-- editar manualmente timings sincronizados de otros usuarios.
--
-- Causa del bug: las políticas tqch_insert/update/delete_owner
-- solo verificaban t.user_id = auth.uid(), bloqueando a admins
-- que intentaran editar un timing creado por otro usuario.
-- ============================================================

-- INSERT
DROP POLICY IF EXISTS tqch_insert_owner ON timing_qa_category_hours;
CREATE POLICY tqch_insert_owner ON timing_qa_category_hours
  FOR INSERT WITH CHECK (
    is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_category_hours.timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  );

-- UPDATE
DROP POLICY IF EXISTS tqch_update_owner ON timing_qa_category_hours;
CREATE POLICY tqch_update_owner ON timing_qa_category_hours
  FOR UPDATE
  USING (
    is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_category_hours.timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  )
  WITH CHECK (
    is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_category_hours.timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  );

-- DELETE
DROP POLICY IF EXISTS tqch_delete_owner ON timing_qa_category_hours;
CREATE POLICY tqch_delete_owner ON timing_qa_category_hours
  FOR DELETE USING (
    is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_category_hours.timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  );
