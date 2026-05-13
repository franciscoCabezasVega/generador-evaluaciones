-- Migration: change timing_qa_category_hours.hours from INTEGER to NUMERIC(10,2)
--
-- Reason: the ClickUp sync service (clickupService.ts) writes decimal values
-- such as 20.88 or 9.41 to this column (hours-in-status divided equally
-- among QA members). The previous INTEGER type silently truncated those values
-- in Postgres or raised a type-mismatch error depending on the driver,
-- making all ClickUp-synced hours incorrect after sync.
-- NUMERIC(10,2) stores up to 10 digits with 2 decimal places — sufficient
-- precision for time-in-status hours from the ClickUp API.

ALTER TABLE timing_qa_category_hours
  ALTER COLUMN hours TYPE NUMERIC(10, 2)
    USING hours::NUMERIC(10, 2);

-- Keep the non-negative constraint consistent with the original CHECK.
ALTER TABLE timing_qa_category_hours
  DROP CONSTRAINT IF EXISTS timing_qa_category_hours_hours_check;

ALTER TABLE timing_qa_category_hours
  ADD CONSTRAINT timing_qa_category_hours_hours_check CHECK (hours >= 0);
