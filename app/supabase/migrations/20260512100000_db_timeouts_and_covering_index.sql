-- Capa 4: DB timeouts + covering index para user_profiles
-- Evita queries largas del rol authenticated y acelera el lookup de auth

alter role authenticated set statement_timeout = '10s';
alter role authenticated set idle_in_transaction_session_timeout = '5s';

-- NOTA: CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de una transacción.
-- Esta migración fue aplicada manualmente via execute_sql (fuera de transacción).
-- Se documenta aquí únicamente como registro histórico.
create index if not exists user_profiles_id_role_idx
  on user_profiles (id) include (role_id);

analyze user_profiles;
analyze tasks;
analyze task_squad;
