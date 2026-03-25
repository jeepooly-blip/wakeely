-- ================================================================
-- AI Onboarding System
-- ================================================================

-- Track onboarding state per user
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step       SMALLINT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_case_type  TEXT,
  ADD COLUMN IF NOT EXISTS first_case_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_phone        TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_wa_sent_at TIMESTAMPTZ;

-- Onboarding chat sessions (for AI assistant history)
CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  messages     JSONB       NOT NULL DEFAULT '[]',
  completed    BOOLEAN     NOT NULL DEFAULT false,
  case_type    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_sessions_user
  ON public.onboarding_sessions(user_id);

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_own" ON public.onboarding_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Tooltip seen tracker (so we show each tooltip once)
CREATE TABLE IF NOT EXISTS public.onboarding_tooltips_seen (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tooltip_id TEXT NOT NULL,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tooltip_id)
);

ALTER TABLE public.onboarding_tooltips_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tooltips_own" ON public.onboarding_tooltips_seen
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
