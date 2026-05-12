-- I4: Reset ALTER ROLE timeout settings applied by migration db_timeouts.
-- Those settings affected ALL authenticated queries including reports and
-- batch AI, which can legitimately run longer than 10s.
-- Timeouts are now enforced per-RPC with SET LOCAL inside the function body.
alter role authenticated reset statement_timeout;
alter role authenticated reset idle_in_transaction_session_timeout;
