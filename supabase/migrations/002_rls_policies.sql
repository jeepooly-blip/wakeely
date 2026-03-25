-- ============================================================
-- Wakeela · Migration 002 · Row Level Security Policies
-- Run AFTER migration 001
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_lawyers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadlines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nde_flags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;

-- ── Helper: is this user an active lawyer on a case? ─────────
CREATE OR REPLACE FUNCTION public.is_active_lawyer(p_case_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_lawyers
    WHERE case_id     = p_case_id
      AND lawyer_id   = auth.uid()
      AND accepted_at IS NOT NULL
      AND revoked_at  IS NULL
  );
$$;

-- Helper: is this user the client who owns a case?
CREATE OR REPLACE FUNCTION public.is_case_client(p_case_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = p_case_id AND client_id = auth.uid()
  );
$$;

-- ── USERS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select_own"  ON public.users;
DROP POLICY IF EXISTS "users_insert_own"  ON public.users;
DROP POLICY IF EXISTS "users_update_own"  ON public.users;

-- Users can only see and edit their own row
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Lawyers can see basic info of other users in shared cases (for display)
CREATE POLICY "users_select_case_participant" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.case_lawyers cl
      JOIN public.cases c ON c.id = cl.case_id
      WHERE (c.client_id = auth.uid() OR cl.lawyer_id = auth.uid())
        AND (cl.lawyer_id = users.id OR c.client_id = users.id)
        AND cl.accepted_at IS NOT NULL
        AND cl.revoked_at  IS NULL
    )
  );

-- ── CASES ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cases_select_client"  ON public.cases;
DROP POLICY IF EXISTS "cases_select_lawyer"  ON public.cases;
DROP POLICY IF EXISTS "cases_insert_client"  ON public.cases;
DROP POLICY IF EXISTS "cases_update_client"  ON public.cases;

CREATE POLICY "cases_select_client" ON public.cases
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "cases_select_lawyer" ON public.cases
  FOR SELECT USING (public.is_active_lawyer(id));

CREATE POLICY "cases_insert_client" ON public.cases
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "cases_update_client" ON public.cases
  FOR UPDATE USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Clients can soft-delete (archive) their own cases
CREATE POLICY "cases_delete_client" ON public.cases
  FOR DELETE USING (auth.uid() = client_id);

-- ── CASE_LAWYERS ─────────────────────────────────────────────
DROP POLICY IF EXISTS "case_lawyers_select" ON public.case_lawyers;
DROP POLICY IF EXISTS "case_lawyers_insert" ON public.case_lawyers;
DROP POLICY IF EXISTS "case_lawyers_update" ON public.case_lawyers;

-- Participants can see who is on the case
CREATE POLICY "case_lawyers_select" ON public.case_lawyers
  FOR SELECT USING (
    public.is_case_client(case_id) OR lawyer_id = auth.uid()
  );

-- Only the client can invite a lawyer
CREATE POLICY "case_lawyers_insert" ON public.case_lawyers
  FOR INSERT WITH CHECK (public.is_case_client(case_id));

-- Lawyer can accept (set accepted_at). Client can revoke (set revoked_at).
CREATE POLICY "case_lawyers_update" ON public.case_lawyers
  FOR UPDATE USING (
    public.is_case_client(case_id) OR lawyer_id = auth.uid()
  );

-- ── TIMELINE_EVENTS — SELECT + INSERT ONLY, NO UPDATE/DELETE ─
DROP POLICY IF EXISTS "timeline_select_client" ON public.timeline_events;
DROP POLICY IF EXISTS "timeline_select_lawyer" ON public.timeline_events;
DROP POLICY IF EXISTS "timeline_insert"        ON public.timeline_events;

CREATE POLICY "timeline_select_client" ON public.timeline_events
  FOR SELECT USING (public.is_case_client(case_id));

CREATE POLICY "timeline_select_lawyer" ON public.timeline_events
  FOR SELECT USING (public.is_active_lawyer(case_id));

CREATE POLICY "timeline_insert" ON public.timeline_events
  FOR INSERT WITH CHECK (
    public.is_case_client(case_id)
    OR (
      public.is_active_lawyer(case_id)
      AND EXISTS (
        SELECT 1 FROM public.case_lawyers
        WHERE case_id   = timeline_events.case_id
          AND lawyer_id = auth.uid()
          AND permissions = 'write'
          AND accepted_at IS NOT NULL
          AND revoked_at  IS NULL
      )
    )
  );
-- INTENTIONALLY NO UPDATE or DELETE policies on timeline_events

-- ── DOCUMENTS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "docs_select" ON public.documents;
DROP POLICY IF EXISTS "docs_insert" ON public.documents;

CREATE POLICY "docs_select" ON public.documents
  FOR SELECT USING (
    public.is_case_client(case_id) OR public.is_active_lawyer(case_id)
  );

CREATE POLICY "docs_insert" ON public.documents
  FOR INSERT WITH CHECK (
    auth.uid() = uploader_id
    AND (
      public.is_case_client(case_id)
      OR (
        public.is_active_lawyer(case_id)
        AND EXISTS (
          SELECT 1 FROM public.case_lawyers
          WHERE case_id     = documents.case_id
            AND lawyer_id   = auth.uid()
            AND permissions = 'write'
            AND accepted_at IS NOT NULL
            AND revoked_at  IS NULL
        )
      )
    )
  );

-- ── DEADLINES ────────────────────────────────────────────────
DROP POLICY IF EXISTS "deadlines_client_all"    ON public.deadlines;
DROP POLICY IF EXISTS "deadlines_lawyer_select" ON public.deadlines;

CREATE POLICY "deadlines_client_all" ON public.deadlines
  FOR ALL USING (public.is_case_client(case_id))
  WITH CHECK (public.is_case_client(case_id));

CREATE POLICY "deadlines_lawyer_select" ON public.deadlines
  FOR SELECT USING (public.is_active_lawyer(case_id));

-- ── MESSAGES ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_participant" ON public.messages;

CREATE POLICY "messages_participant" ON public.messages
  FOR ALL USING (
    public.is_case_client(case_id) OR public.is_active_lawyer(case_id)
  )
  WITH CHECK (
    auth.uid() = sender_id
    AND (public.is_case_client(case_id) OR public.is_active_lawyer(case_id))
  );

-- ── NDE_FLAGS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "nde_select_client" ON public.nde_flags;
DROP POLICY IF EXISTS "nde_update_client" ON public.nde_flags;

-- Clients can see alerts on their own cases
CREATE POLICY "nde_select_client" ON public.nde_flags
  FOR SELECT USING (public.is_case_client(case_id));

-- Clients can resolve (mark action_taken) their alerts
CREATE POLICY "nde_update_client" ON public.nde_flags
  FOR UPDATE USING (public.is_case_client(case_id));

-- ── SUBSCRIPTIONS ────────────────────────────────────────────
DROP POLICY IF EXISTS "subscriptions_own" ON public.subscriptions;

CREATE POLICY "subscriptions_own" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── CONSENT_LOGS ─────────────────────────────────────────────
DROP POLICY IF EXISTS "consent_insert_own" ON public.consent_logs;
DROP POLICY IF EXISTS "consent_select_own" ON public.consent_logs;

CREATE POLICY "consent_insert_own" ON public.consent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "consent_select_own" ON public.consent_logs
  FOR SELECT USING (auth.uid() = user_id);
-- No UPDATE/DELETE on consent_logs — immutable

-- ── AUDIT_LOGS ───────────────────────────────────────────────
-- Only service_role can insert audit logs (done server-side)
-- Users can see their own audit entries
DROP POLICY IF EXISTS "audit_select_own" ON public.audit_logs;

CREATE POLICY "audit_select_own" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);
