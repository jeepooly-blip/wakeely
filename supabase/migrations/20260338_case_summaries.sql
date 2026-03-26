-- ================================================================
-- AI Case Summary (PRD §3.3 Phase 3 — Gap Analysis Task 12)
--
-- Caches Claude-generated structured case summaries.
-- Gated to Premium tier.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.case_summaries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID        NOT NULL UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  language        TEXT        NOT NULL DEFAULT 'en',  -- 'en' | 'ar'
  summary_json    JSONB       NOT NULL DEFAULT '{}',
  -- summary_json shape:
  --   overview:          string
  --   milestones:        [{date, event, significance}]
  --   pending_actions:   string[]
  --   risks:             string[]
  --   recommendations:   string[]
  exported_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_summaries_case_id ON public.case_summaries(case_id);
CREATE INDEX IF NOT EXISTS idx_case_summaries_user_id ON public.case_summaries(user_id);

ALTER TABLE public.case_summaries ENABLE ROW LEVEL SECURITY;

-- Only the case owner can read/write their summaries
CREATE POLICY "case_summaries_owner"
  ON public.case_summaries FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_id AND c.client_id = auth.uid()
    )
  )
  WITH CHECK (user_id = auth.uid());
