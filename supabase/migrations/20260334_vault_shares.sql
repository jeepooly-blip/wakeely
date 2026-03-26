-- ================================================================
-- Vault Share Links (PRD Screen 6 — Gap Analysis Task 4)
--
-- Allows document owners to generate time-limited, access-capped
-- share links for vault documents without requiring authentication
-- from the recipient.
--
-- Flow:
--   1. Owner POSTs to /api/vault/share → row inserted here
--   2. Recipient visits /share/[token] → validated here, then
--      redirected to a Supabase signed URL for the file
-- ================================================================

CREATE TABLE IF NOT EXISTS public.vault_shares (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID         NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_by     UUID         NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  token          UUID         UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at     TIMESTAMPTZ  NOT NULL DEFAULT now() + interval '24 hours',
  accessed_count INTEGER      NOT NULL DEFAULT 0,
  max_accesses   INTEGER      NOT NULL DEFAULT 5,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vault_shares_token       ON public.vault_shares(token);
CREATE INDEX IF NOT EXISTS idx_vault_shares_document    ON public.vault_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_vault_shares_created_by  ON public.vault_shares(created_by);
CREATE INDEX IF NOT EXISTS idx_vault_shares_expires_at  ON public.vault_shares(expires_at);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.vault_shares ENABLE ROW LEVEL SECURITY;

-- Owner can create and view their own share links
CREATE POLICY "vault_shares_owner_all"
  ON public.vault_shares
  FOR ALL
  USING  (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Public token lookup is handled via service_role in the share
-- resolution API — no anon/authenticated RLS needed for that path.
-- (The /share/[token] route uses createAdminClient to bypass RLS.)
