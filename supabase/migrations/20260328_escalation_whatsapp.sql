-- ================================================================
-- Escalation Toolkit v2 + WhatsApp Two-Way Bot
-- ================================================================

-- 1. Extend escalation_drafts with country + export tracking
ALTER TABLE public.escalation_drafts
  ADD COLUMN IF NOT EXISTS country         TEXT DEFAULT 'uae'
                                               CHECK (country IN ('uae','ksa','kuwait','other')),
  ADD COLUMN IF NOT EXISTS language        TEXT DEFAULT 'ar'
                                               CHECK (language IN ('en','ar')),
  ADD COLUMN IF NOT EXISTS pdf_exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS word_exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name  TEXT;

-- 2. WhatsApp conversation state (for two-way bot)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  case_id         UUID        REFERENCES public.cases(id) ON DELETE SET NULL,
  phone           TEXT        NOT NULL,
  state           TEXT        NOT NULL DEFAULT 'idle'
                                  CHECK (state IN (
                                    'idle','awaiting_reply','awaiting_case_select',
                                    'awaiting_confirm_escalate'
                                  )),
  last_message_id TEXT,
  last_wamid      TEXT,                   -- WhatsApp message ID
  context_data    JSONB       DEFAULT '{}',
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sessions_phone ON public.whatsapp_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_user ON public.whatsapp_sessions(user_id);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_session_own" ON public.whatsapp_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. WhatsApp inbound messages log (audit + replay)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid        TEXT        UNIQUE NOT NULL,   -- WhatsApp message ID
  from_phone   TEXT        NOT NULL,
  to_phone     TEXT        NOT NULL,
  direction    TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type TEXT        NOT NULL DEFAULT 'text',
  body         TEXT,
  user_id      UUID        REFERENCES public.users(id),
  case_id      UUID        REFERENCES public.cases(id),
  action_log_id UUID       REFERENCES public.action_logs(id),
  processed    BOOLEAN     NOT NULL DEFAULT false,
  raw_payload  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON public.whatsapp_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_wa_messages_case  ON public.whatsapp_messages(case_id);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_messages_admin" ON public.whatsapp_messages
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "wa_messages_own" ON public.whatsapp_messages
  FOR SELECT USING (user_id = auth.uid());

-- 4. Add whatsapp_phone to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
