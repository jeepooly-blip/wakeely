-- ================================================================
-- Wakeela Witness Mode (PRD §3.3 — Gap Analysis Task 11)
--
-- A read-only, time-limited, access-capped case view that the
-- client can share with a trusted third party or mediator.
-- No auth required for the recipient.
-- Gated to Pro/Premium tier.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.witness_links (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID          NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_by    UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token         UUID          UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  label         TEXT,           -- optional description e.g. "For mediator Ahmed"
  expires_at    TIMESTAMPTZ   NOT NULL DEFAULT now() + interval '72 hours',
  max_views     INTEGER       NOT NULL DEFAULT 10,
  view_count    INTEGER       NOT NULL DEFAULT 0,
  is_revoked    BOOLEAN       NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_witness_links_token     ON public.witness_links(token);
CREATE INDEX IF NOT EXISTS idx_witness_links_case_id   ON public.witness_links(case_id);
CREATE INDEX IF NOT EXISTS idx_witness_links_created_by ON public.witness_links(created_by);

-- RLS: only the case owner can create / revoke / list their witness links
ALTER TABLE public.witness_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "witness_links_owner_all"
  ON public.witness_links FOR ALL
  USING  (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Public token resolution uses createAdminClient() (service_role bypasses RLS)
