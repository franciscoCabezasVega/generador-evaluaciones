-- ─── Plantilla para nuevas tablas en public ──────────────────────────────────
--
-- INSTRUCCIONES:
--   Copia este bloque cuando crees una nueva tabla. Reemplaza <nombre_tabla>
--   con el nombre real y ajusta el conjunto de permisos según el caso de uso.
--
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Habilitar RLS (obligatorio antes de aplicar GRANTs útiles)
ALTER TABLE public.<nombre_tabla> ENABLE ROW LEVEL SECURITY;

-- 2a. Para tablas de escritura normal (la mayoría de los casos):
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<nombre_tabla> TO authenticated;
REVOKE ALL ON public.<nombre_tabla> FROM anon;

-- 2b. Para tablas de solo lectura / catálogo:
-- GRANT SELECT ON public.<nombre_tabla> TO authenticated;
-- REVOKE ALL ON public.<nombre_tabla> FROM anon;

-- 2c. Para tablas sensibles (solo service_role puede escribir):
-- GRANT SELECT ON public.<nombre_tabla> TO authenticated;
-- REVOKE INSERT, UPDATE, DELETE ON public.<nombre_tabla> FROM authenticated;
-- REVOKE ALL ON public.<nombre_tabla> FROM anon;

-- 3. Políticas RLS (adaptar según lógica de negocio):
--
-- CREATE POLICY "authenticated puede ver sus filas"
--   ON public.<nombre_tabla>
--   FOR SELECT
--   TO authenticated
--   USING (auth.uid() = user_id);  -- ajustar columna de referencia
--
-- CREATE POLICY "authenticated puede insertar sus filas"
--   ON public.<nombre_tabla>
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);

-- 4. Si la tabla usa secuencias (SERIAL/BIGSERIAL), otorgar uso:
-- GRANT USAGE ON SEQUENCE public.<nombre_tabla>_id_seq TO authenticated;
