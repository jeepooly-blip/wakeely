-- ================================================================
-- Phase 2A: Enhanced Secure Chat
-- Reconciles chat_messages with original 'messages' table spec
-- Adds: attachment, encryption flag, message_type, delivery status
-- ================================================================

-- 1. Upgrade chat_messages to match PRD 'messages' spec
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS content_encrypted  TEXT,          -- E2E encrypted copy (placeholder)
  ADD COLUMN IF NOT EXISTS is_encrypted       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_type       TEXT    NOT NULL DEFAULT 'text'
                                                  CHECK (message_type IN ('text','attachment','system')),
  ADD COLUMN IF NOT EXISTS attachment_doc_id  UUID    REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_name    TEXT,          -- cached filename for display
  ADD COLUMN IF NOT EXISTS attachment_size    BIGINT,        -- cached size in bytes
  ADD COLUMN IF NOT EXISTS edited_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;   -- soft delete

-- 2. Create a view that mirrors the original 'messages' interface
CREATE OR REPLACE VIEW public.v_chat_messages AS
SELECT
  cm.id,
  cm.case_id,
  cm.sender_id,
  COALESCE(cm.content_encrypted, cm.content) AS content_encrypted,
  cm.content,
  cm.read_at,
  cm.message_type,
  cm.attachment_doc_id,
  cm.attachment_name,
  cm.attachment_size,
  cm.is_encrypted,
  cm.deleted_at,
  cm.created_at,
  u.full_name AS sender_name,
  u.role      AS sender_role
FROM   public.chat_messages cm
JOIN   public.users u ON u.id = cm.sender_id
WHERE  cm.deleted_at IS NULL;

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_attachment ON public.chat_messages(attachment_doc_id)
  WHERE attachment_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_type       ON public.chat_messages(case_id, message_type);
CREATE INDEX IF NOT EXISTS idx_chat_unread     ON public.chat_messages(case_id, sender_id)
  WHERE read_at IS NULL;

-- 4. Function: mark all messages in a case as read for a user
CREATE OR REPLACE FUNCTION public.mark_chat_read(p_case_id UUID, p_user_id UUID)
RETURNS VOID SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_messages
  SET    read_at = now()
  WHERE  case_id   = p_case_id
    AND  sender_id <> p_user_id
    AND  read_at   IS NULL
    AND  deleted_at IS NULL;
END; $$;

-- 5. Function: get unread count per case for a user
CREATE OR REPLACE FUNCTION public.get_chat_unread_counts(p_user_id UUID)
RETURNS TABLE(case_id UUID, unread_count BIGINT)
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT cm.case_id, COUNT(*) AS unread_count
  FROM   public.chat_messages cm
  WHERE  cm.sender_id  <> p_user_id
    AND  cm.read_at    IS NULL
    AND  cm.deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.cases  c  WHERE c.id  = cm.case_id AND c.client_id  = p_user_id)
      OR
      EXISTS (SELECT 1 FROM public.case_lawyers cl WHERE cl.case_id = cm.case_id AND cl.lawyer_id = p_user_id AND cl.status = 'active')
    )
  GROUP BY cm.case_id;
$$;

-- 6. Ensure realtime is enabled
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
