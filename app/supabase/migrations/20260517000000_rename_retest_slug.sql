-- Rename timing_categories slug from 'retest' to 'qa_ready_for_testing'
-- to accurately reflect the semantic meaning of the "QA - Ready for Testing"
-- status (task is queued for QA, not being retested).
-- The slug 'qa_retesting' already exists for the actual retest workflow.
UPDATE timing_categories
SET slug = 'qa_ready_for_testing'
WHERE slug = 'retest';
