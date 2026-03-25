-- ================================================================
-- Voice AI Legal Advisor
-- ================================================================

-- Voice session log (for history + billing enforcement)
CREATE TABLE IF NOT EXISTS public.voice_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  case_id        UUID        REFERENCES public.cases(id) ON DELETE SET NULL,
  transcript     TEXT        NOT NULL DEFAULT '',
  ai_response    TEXT        NOT NULL DEFAULT '',
  detected_lang  TEXT        NOT NULL DEFAULT 'en' CHECK (detected_lang IN ('en','ar')),
  duration_ms    INTEGER,
  tokens_used    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON public.voice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_case ON public.voice_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_date ON public.voice_sessions(user_id, created_at);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_sessions_own" ON public.voice_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Daily usage helper function (called from API to enforce limits)
CREATE OR REPLACE FUNCTION public.voice_queries_today(p_user_id UUID)
RETURNS INTEGER
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER
  FROM   public.voice_sessions
  WHERE  user_id    = p_user_id
    AND  created_at >= (CURRENT_DATE AT TIME ZONE 'UTC');
$$;

-- Add voice_ai feature to type tracking (informational comment)
-- Tier limits enforced in application code:
--   basic   → 5 queries / day
--   pro     → 50 queries / day
--   premium → unlimited
COMMENT ON TABLE public.voice_sessions IS
  'Voice AI advisor sessions. Daily limits: basic=5, pro=50, premium=unlimited.';
