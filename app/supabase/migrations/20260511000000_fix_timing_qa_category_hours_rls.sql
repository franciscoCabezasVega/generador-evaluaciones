-- ============================================================
-- Fix: Reemplazar políticas RLS permisivas en timing_qa_category_hours
-- por políticas que verifican propiedad vía timing_qa_entries → task_timings.user_id
-- ============================================================

-- 1. Drop políticas permisivas existentes
DROP POLICY IF EXISTS tqch_insert_authenticated ON timing_qa_category_hours;
DROP POLICY IF EXISTS tqch_update_authenticated ON timing_qa_category_hours;
DROP POLICY IF EXISTS tqch_delete_authenticated ON timing_qa_category_hours;

-- 2. INSERT: solo si el usuario es dueño del timing_qa_entry referenciado
CREATE POLICY tqch_insert_owner ON timing_qa_category_hours
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  );

-- 3. UPDATE: solo si el usuario es dueño del registro
CREATE POLICY tqch_update_owner ON timing_qa_category_hours
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  );

-- 4. DELETE: solo si el usuario es dueño del registro
CREATE POLICY tqch_delete_owner ON timing_qa_category_hours
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM timing_qa_entries e
      JOIN task_timings t ON t.id = e.timing_id
      WHERE e.id = timing_qa_entry_id
        AND t.user_id = ( SELECT auth.uid() AS uid)
    )
  );
