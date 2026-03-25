-- ================================================================
-- Phase 3: Escalation Toolkit + Notifications Hub + Billing
-- ================================================================

-- 1. In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id     UUID        REFERENCES cases(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL
                              CHECK (type IN (
                                'nde_flag','deadline_reminder','lawyer_joined',
                                'lawyer_action','chat_message','escalation_sent',
                                'subscription_updated','system'
                              )),
  title       TEXT        NOT NULL,
  body        TEXT,
  read_at     TIMESTAMPTZ,
  action_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Escalation drafts (user-filled templates)
CREATE TABLE IF NOT EXISTS escalation_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id),
  template_key    TEXT        NOT NULL,
  fields          JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','sent','downloaded')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Notification preferences (merged into users table if columns missing)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_email       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_whatsapp    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_in_app      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_start        TIME,
  ADD COLUMN IF NOT EXISTS quiet_hours_end          TIME,
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escalation_drafts_case ON escalation_drafts(case_id);
CREATE INDEX IF NOT EXISTS idx_escalation_drafts_user ON escalation_drafts(user_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_drafts   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
  ON notifications FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own escalation drafts"
  ON escalation_drafts FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for in-app notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
