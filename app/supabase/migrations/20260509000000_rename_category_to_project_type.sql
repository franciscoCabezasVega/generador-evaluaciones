-- Renombrar tabla categories → project_types
-- Las políticas RLS (catalog_select_authenticated, catalog_insert_admin,
-- catalog_update_admin, catalog_delete_admin) se transfieren automáticamente.
ALTER TABLE categories RENAME TO project_types;

-- Renombrar columna category → project_type en la tabla tasks
-- El índice idx_tasks_category se actualiza automáticamente para apuntar
-- a la nueva columna, pero el nombre del índice queda desactualizado.
ALTER TABLE tasks RENAME COLUMN category TO project_type;

-- Renombrar el índice para coherencia con el nuevo nombre de columna
-- IF EXISTS evita fallo si el índice no existe en el entorno destino
ALTER INDEX IF EXISTS idx_tasks_category RENAME TO idx_tasks_project_type;
