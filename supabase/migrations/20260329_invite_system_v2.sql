-- ================================================================
-- Lawyer Invite System v2 — PRD Section 3.2 & 4.2
-- Adds: `invites` table, is_user_case_lawyer() helper, RLS updates
-- SAFE: all IF NOT EXISTS / DROP + CREATE for policies
-- ================================================================

-- ── 1. `invites` table (PRD-spec UUID token) ────────────────────
CREATE TABLE IF NOT EXISTS public.invites (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  token          UUID        UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  invited_email  TEXT,
  created_by     UUID        NOT NULL REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at    TIMESTAMPTZ,
  accepted_by    UUID        REFERENCES public.users(id),
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_token      ON public.invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_case_id    ON public.invites(case_id);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON public.invites(created_by);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_owner_all"   ON public.invites;
DROP POLICY IF EXISTS "invites_public_read" ON public.invites;

CREATE POLICY "invites_owner_all" ON public.invites
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "invites_public_read" ON public.invites
  FOR SELECT
  USING (true);

-- ── 2. Ensure case_lawyers has needed columns ───────────────────
ALTER TABLE public.case_lawyers
  ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT 'read_write'
    CHECK (permissions IN ('read', 'write', 'read_write')),
  ADD COLUMN IF NOT EXISTS invited_by  UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked'));

-- ── 3. is_user_case_lawyer() — single RLS helper ────────────────
CREATE OR REPLACE FUNCTION public.is_user_case_lawyer(
  p_case_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.case_lawyers cl
    WHERE  cl.case_id   = p_case_id
      AND  cl.lawyer_id = p_user_id
      AND  cl.status    = 'active'
  );
$$;

-- Backward-compatible wrapper (uses auth.uid())
CREATE OR REPLACE FUNCTION public.is_active_lawyer(p_case_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_user_case_lawyer(p_case_id, auth.uid());
$$;

-- Write permission helper
CREATE OR REPLACE FUNCTION public.lawyer_has_write(p_case_id UUID, p_user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.case_lawyers cl
    WHERE  cl.case_id   = p_case_id
      AND  cl.lawyer_id = p_user_id
      AND  cl.status    = 'active'
      AND  cl.permissions IN ('write', 'read_write')
  );
$$;

-- ── 4. timeline_events RLS ───────────────────────────────────────
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timeline_select_client" ON public.timeline_events;
DROP POLICY IF EXISTS "timeline_select_lawyer"  ON public.timeline_events;
DROP POLICY IF EXISTS "timeline_insert"         ON public.timeline_events;

CREATE POLICY "timeline_select_client" ON public.timeline_events
  FOR SELECT
  USING (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = timeline_events.case_id)
  );

CREATE POLICY "timeline_select_lawyer" ON public.timeline_events
  FOR SELECT
  USING (
    public.is_user_case_lawyer(timeline_events.case_id, auth.uid())
  );

CREATE POLICY "timeline_insert" ON public.timeline_events
  FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = timeline_events.case_id)
    OR public.lawyer_has_write(timeline_events.case_id, auth.uid())
  );

-- ── 5. documents RLS ────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs_select" ON public.documents;
DROP POLICY IF EXISTS "docs_insert" ON public.documents;

CREATE POLICY "docs_select" ON public.documents
  FOR SELECT
  USING (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = documents.case_id)
    OR public.is_user_case_lawyer(documents.case_id, auth.uid())
  );

CREATE POLICY "docs_insert" ON public.documents
  FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id
    AND (
      auth.uid() = (SELECT client_id FROM public.cases WHERE id = documents.case_id)
      OR public.lawyer_has_write(documents.case_id, auth.uid())
    )
  );

-- ── 6. deadlines RLS ────────────────────────────────────────────
ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deadlines_client_all"    ON public.deadlines;
DROP POLICY IF EXISTS "deadlines_lawyer_select" ON public.deadlines;
DROP POLICY IF EXISTS "deadlines_lawyer_write"  ON public.deadlines;

CREATE POLICY "deadlines_client_all" ON public.deadlines
  FOR ALL
  USING (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = deadlines.case_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = deadlines.case_id)
  );

CREATE POLICY "deadlines_lawyer_select" ON public.deadlines
  FOR SELECT
  USING (
    public.is_user_case_lawyer(deadlines.case_id, auth.uid())
  );

CREATE POLICY "deadlines_lawyer_write" ON public.deadlines
  FOR INSERT
  WITH CHECK (
    public.lawyer_has_write(deadlines.case_id, auth.uid())
  );

-- ── 7. case_lawyers RLS ─────────────────────────────────────────
ALTER TABLE public.case_lawyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_lawyers_read"          ON public.case_lawyers;
DROP POLICY IF EXISTS "case_lawyers_client_write"  ON public.case_lawyers;
DROP POLICY IF EXISTS "case_lawyers_client_update" ON public.case_lawyers;

CREATE POLICY "case_lawyers_read" ON public.case_lawyers
  FOR SELECT
  USING (
    lawyer_id   = auth.uid()
    OR invited_by = auth.uid()
    OR auth.uid() = (SELECT client_id FROM public.cases WHERE id = case_lawyers.case_id)
  );

CREATE POLICY "case_lawyers_client_write" ON public.case_lawyers
  FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = case_lawyers.case_id)
    OR lawyer_id = auth.uid()
  );

CREATE POLICY "case_lawyers_client_update" ON public.case_lawyers
  FOR UPDATE
  USING (
    auth.uid() = (SELECT client_id FROM public.cases WHERE id = case_lawyers.case_id)
    OR lawyer_id = auth.uid()
  );
