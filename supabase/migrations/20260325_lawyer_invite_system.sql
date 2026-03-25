-- ================================================================
-- Lawyer Invite System — PRD Section 3.2 & 4.2
-- Reconciles original schema with Phase 2, adds missing features
-- SAFE TO RUN: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ================================================================

-- 1. Ensure lawyer_invites exists with full schema
CREATE TABLE IF NOT EXISTS public.lawyer_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES public.users(id),
  token        TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  lawyer_email TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_by  UUID        REFERENCES public.users(id),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Reconcile case_lawyers — support BOTH schema versions safely
--    Original: (invited_at, accepted_at, revoked_at, permissions)
--    Phase 2:  (invited_by, status)
--    Target:   unified schema with all fields
ALTER TABLE public.case_lawyers
  ADD COLUMN IF NOT EXISTS invited_by  UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active'
                                           CHECK (status IN ('active','revoked')),
  ADD COLUMN IF NOT EXISTS revoked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by  UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT 'write'
                                           CHECK (permissions IN ('read','write'));

-- Backfill: set invited_by from join on lawyer_invites where possible
UPDATE public.case_lawyers cl
SET    invited_by = li.created_by
FROM   public.lawyer_invites li
WHERE  li.case_id     = cl.case_id
  AND  li.accepted_by = cl.lawyer_id
  AND  cl.invited_by  IS NULL;

-- Backfill: mark revoked rows (from original schema) as status = 'revoked'
UPDATE public.case_lawyers
SET    status = 'revoked'
WHERE  revoked_at IS NOT NULL AND status = 'active';

-- 3. Ensure action_logs exists
CREATE TABLE IF NOT EXISTS public.action_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  lawyer_id    UUID NOT NULL REFERENCES public.users(id),
  action_type  TEXT NOT NULL CHECK (action_type IN (
                  'court_hearing','document_filed','client_contacted',
                  'research','negotiation','correspondence','other'
               )),
  description  TEXT NOT NULL,
  action_date  DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Ensure chat_messages exists with realtime
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES public.users(id),
  content    TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Add lawyer bar number field to users if missing
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bar_number   TEXT,
  ADD COLUMN IF NOT EXISTS jurisdiction TEXT;

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lawyer_invites_token   ON public.lawyer_invites(token);
CREATE INDEX IF NOT EXISTS idx_lawyer_invites_case    ON public.lawyer_invites(case_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_invites_status  ON public.lawyer_invites(status);
CREATE INDEX IF NOT EXISTS idx_case_lawyers_case      ON public.case_lawyers(case_id);
CREATE INDEX IF NOT EXISTS idx_case_lawyers_lawyer    ON public.case_lawyers(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_case_lawyers_status    ON public.case_lawyers(status);
CREATE INDEX IF NOT EXISTS idx_action_logs_case       ON public.action_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_lawyer     ON public.action_logs(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_case     ON public.chat_messages(case_id);

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE public.lawyer_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_lawyers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;

-- Drop and recreate all policies cleanly
DROP POLICY IF EXISTS "Invite owner can manage"          ON public.lawyer_invites;
DROP POLICY IF EXISTS "Anyone can read invite by token"  ON public.lawyer_invites;
DROP POLICY IF EXISTS "Case participants can see case_lawyers" ON public.case_lawyers;
DROP POLICY IF EXISTS "Client can manage case_lawyers"   ON public.case_lawyers;
DROP POLICY IF EXISTS "Lawyer can manage own action_logs" ON public.action_logs;
DROP POLICY IF EXISTS "Client can read action_logs for their cases" ON public.action_logs;
DROP POLICY IF EXISTS "Case participants can chat"       ON public.chat_messages;

-- lawyer_invites: client manages; anyone reads by token
CREATE POLICY "invite_owner_manage" ON public.lawyer_invites
  FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "invite_public_read" ON public.lawyer_invites
  FOR SELECT USING (true);

-- case_lawyers: participants can read; client can insert/update (invite/revoke)
CREATE POLICY "case_lawyers_read" ON public.case_lawyers
  FOR SELECT USING (
    lawyer_id   = auth.uid()
    OR invited_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.cases WHERE id = case_lawyers.case_id AND client_id = auth.uid())
  );

CREATE POLICY "case_lawyers_client_write" ON public.case_lawyers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE id = case_lawyers.case_id AND client_id = auth.uid())
  );

CREATE POLICY "case_lawyers_client_update" ON public.case_lawyers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE id = case_lawyers.case_id AND client_id = auth.uid())
    OR lawyer_id = auth.uid()
  );

-- action_logs: lawyer writes own; client reads all for their cases
CREATE POLICY "action_logs_lawyer_write" ON public.action_logs
  FOR ALL USING  (lawyer_id = auth.uid()) WITH CHECK (lawyer_id = auth.uid());

CREATE POLICY "action_logs_client_read" ON public.action_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE id = action_logs.case_id AND client_id = auth.uid())
  );

-- chat_messages: client + active lawyer can read/write
CREATE POLICY "chat_participants" ON public.chat_messages
  FOR ALL USING (
    sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.cases WHERE id = chat_messages.case_id AND client_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.case_lawyers
      WHERE case_id  = chat_messages.case_id
        AND lawyer_id = auth.uid()
        AND status    = 'active'
    )
  )
  WITH CHECK (sender_id = auth.uid());

-- Storage: lawyers can upload to evidence-vault for assigned cases
DROP POLICY IF EXISTS "lawyer_vault_upload" ON storage.objects;
CREATE POLICY "lawyer_vault_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence-vault'
    AND EXISTS (
      SELECT 1 FROM public.case_lawyers
      WHERE case_id::text   = (string_to_array(name, '/'))[1]
        AND lawyer_id       = auth.uid()
        AND status          = 'active'
        AND permissions     = 'write'
    )
  );

-- Enable realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
