-- Capa 4: DB timeouts + covering index para user_profiles
-- Evita queries largas del rol authenticated y acelera el lookup de auth
--
-- NOTE: The ALTER ROLE timeout settings applied here were later reset by
-- migration 20260513000100_reset_role_timeouts.sql because they affected ALL
-- authenticated queries (reports, batch AI, etc.).
-- Timeouts are now enforced per-RPC with SET LOCAL inside each function body.

alter role authenticated set statement_timeout = '10s';
alter role authenticated set idle_in_transaction_session_timeout = '5s';

-- Este índice forma parte de la migración normal y no usa CONCURRENTLY.
-- Puede ejecutarse dentro de la transacción gestionada por el tooling de migraciones.
-- Covering index para SELECT role_id FROM user_profiles WHERE id = ?
-- Habilita index-only scan; reduce 1 heap fetch por llamada de auth.
-- Trade-off: 1 índice extra a mantener en writes (poco frecuentes en esta tabla).
create index if not exists user_profiles_id_role_idx
  on user_profiles (id) include (role_id);

analyze user_profiles;
analyze tasks;
analyze task_squad;
