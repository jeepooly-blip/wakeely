-- ================================================================
-- Phase 2: Lawyer Layer — safe drop & recreate
-- ================================================================

-- Drop in reverse dependency order
DROP TABLE IF EXISTS chat_messages   CASCADE;
DROP TABLE IF EXISTS action_logs     CASCADE;
DROP TABLE IF EXISTS case_lawyers    CASCADE;
DROP TABLE IF EXISTS lawyer_invites  CASCADE;

-- 1. Lawyer invite tokens
CREATE TABLE lawyer_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES users(id),
  token        TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  lawyer_email TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  accepted_by  UUID        REFERENCES users(id),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Case ↔ Lawyer junction
CREATE TABLE case_lawyers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  lawyer_id  UUID        NOT NULL REFERENCES users(id),
  invited_by UUID        NOT NULL REFERENCES users(id),
  status     TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, lawyer_id)
);

-- 3. Lawyer action logs
CREATE TABLE action_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  lawyer_id   UUID        NOT NULL REFERENCES users(id),
  action_type TEXT        NOT NULL
                              CHECK (action_type IN (
                                'court_hearing','document_filed','client_contacted',
                                'research','negotiation','correspondence','other'
                              )),
  description TEXT        NOT NULL,
  action_date DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Secure chat messages
CREATE TABLE chat_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES users(id),
  content    TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX idx_lawyer_invites_token   ON lawyer_invites(token);
CREATE INDEX idx_lawyer_invites_case    ON lawyer_invites(case_id);
CREATE INDEX idx_case_lawyers_case      ON case_lawyers(case_id);
CREATE INDEX idx_case_lawyers_lawyer    ON case_lawyers(lawyer_id);
CREATE INDEX idx_action_logs_case       ON action_logs(case_id);
CREATE INDEX idx_action_logs_lawyer     ON action_logs(lawyer_id);
CREATE INDEX idx_chat_messages_case     ON chat_messages(case_id);
CREATE INDEX idx_chat_messages_created  ON chat_messages(case_id, created_at);

-- ── Row-Level Security ─────────────────────────────────────────
ALTER TABLE lawyer_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_lawyers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages  ENABLE ROW LEVEL SECURITY;

-- lawyer_invites
CREATE POLICY "Invite owner can manage"
  ON lawyer_invites FOR ALL
  USING  (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Anyone can read invite by token"
  ON lawyer_invites FOR SELECT
  USING (true);

-- case_lawyers
CREATE POLICY "Case participants can see case_lawyers"
  ON case_lawyers FOR SELECT
  USING (
    case_lawyers.lawyer_id  = auth.uid()
    OR case_lawyers.invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cases
       WHERE cases.id = case_lawyers.case_id
         AND cases.client_id = auth.uid()
    )
  );

CREATE POLICY "Client can manage case_lawyers"
  ON case_lawyers FOR ALL
  USING  (case_lawyers.invited_by = auth.uid())
  WITH CHECK (case_lawyers.invited_by = auth.uid());

-- action_logs
CREATE POLICY "Lawyer can manage own action_logs"
  ON action_logs FOR ALL
  USING  (action_logs.lawyer_id = auth.uid())
  WITH CHECK (action_logs.lawyer_id = auth.uid());

CREATE POLICY "Client can read action_logs for their cases"
  ON action_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cases
       WHERE cases.id = action_logs.case_id
         AND cases.client_id = auth.uid()
    )
  );

-- chat_messages
CREATE POLICY "Case participants can chat"
  ON chat_messages FOR ALL
  USING (
    chat_messages.sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cases
       WHERE cases.id = chat_messages.case_id
         AND cases.client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM case_lawyers
       WHERE case_lawyers.case_id  = chat_messages.case_id
         AND case_lawyers.lawyer_id = auth.uid()
         AND case_lawyers.status    = 'active'
    )
  )
  WITH CHECK (chat_messages.sender_id = auth.uid());

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
