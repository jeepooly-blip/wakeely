-- ================================================================
-- NDE Rules 4–7 prerequisite: extend action_logs action_type
-- Adds 'document_request' as a valid action_type so Rule 5
-- (Document Request Ignored) can be triggered by lawyers via
-- the Action Log form.
--
-- PRD §5.2 — Phase 2 full 7-rule NDE set
-- ================================================================

-- Drop and recreate the CHECK constraint to include the new value.
-- PostgreSQL does not support ALTER CHECK directly — we must drop
-- and re-add, or use a DO block to test if the value is needed.

ALTER TABLE public.action_logs
  DROP CONSTRAINT IF EXISTS action_logs_action_type_check;

ALTER TABLE public.action_logs
  ADD CONSTRAINT action_logs_action_type_check
  CHECK (action_type IN (
    'court_hearing',
    'document_filed',
    'client_contacted',
    'research',
    'negotiation',
    'correspondence',
    'document_request',   -- NEW: Rule 5 trigger
    'other'
  ));

-- Index to make Rule 5 query fast
CREATE INDEX IF NOT EXISTS idx_action_logs_type
  ON public.action_logs(case_id, action_type, created_at);

-- Index to make Rule 4 query fast (client messages without reply)
CREATE INDEX IF NOT EXISTS idx_chat_case_sender
  ON public.chat_messages(case_id, sender_id, created_at);

-- Index to make Rule 6 query fast (court deadlines by due_date)
CREATE INDEX IF NOT EXISTS idx_deadlines_court_due
  ON public.deadlines(due_date, type, status)
  WHERE type = 'court' AND status = 'pending';
