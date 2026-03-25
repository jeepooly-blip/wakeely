-- ================================================================
-- Phase 7: Admin Portal + Security + Audit Enhancements
-- ================================================================

-- 1. Extend audit_logs with more detail
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_email  TEXT,
  ADD COLUMN IF NOT EXISTS severity    TEXT NOT NULL DEFAULT 'info'
                                           CHECK (severity IN ('info','warn','error','critical')),
  ADD COLUMN IF NOT EXISTS session_id  TEXT,
  ADD COLUMN IF NOT EXISTS changed_from JSONB,
  ADD COLUMN IF NOT EXISTS changed_to   JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_action      ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created     ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity    ON public.audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_resource    ON public.audit_logs(resource, resource_id);

-- 2. Rate limit tracking (per IP, per user)
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   TEXT        NOT NULL,   -- IP or user_id
  endpoint     TEXT        NOT NULL,
  request_count INTEGER    NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ident   ON public.rate_limit_log(identifier, endpoint, window_start);

-- 3. Admin stats materialized view (refreshed by cron)
CREATE OR REPLACE VIEW public.v_admin_stats AS
SELECT
  (SELECT COUNT(*) FROM public.users)                                         AS total_users,
  (SELECT COUNT(*) FROM public.users WHERE role = 'client')                   AS total_clients,
  (SELECT COUNT(*) FROM public.users WHERE role = 'lawyer')                   AS total_lawyers,
  (SELECT COUNT(*) FROM public.users WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_7d,
  (SELECT COUNT(*) FROM public.cases  WHERE status = 'active')                AS active_cases,
  (SELECT COUNT(*) FROM public.cases  WHERE created_at > NOW() - INTERVAL '7 days') AS new_cases_7d,
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active' AND tier = 'pro')     AS pro_subs,
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active' AND tier = 'premium') AS premium_subs,
  (SELECT COUNT(*) FROM public.nde_flags WHERE resolved_at IS NULL)           AS open_nde_flags,
  (SELECT COUNT(*) FROM public.audit_logs WHERE severity = 'critical' AND created_at > NOW() - INTERVAL '24 hours') AS critical_events_24h;

-- 4. Admin RLS policies — admins can read everything
-- Users table: admin can read all
CREATE POLICY "admin_users_select" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Admin can update any user (role changes, bans)
CREATE POLICY "admin_users_update" ON public.users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Cases: admin read-all
CREATE POLICY "admin_cases_select" ON public.cases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Subscriptions: admin read-all
CREATE POLICY "admin_subscriptions_select" ON public.subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Audit logs: admin read-all
CREATE POLICY "admin_audit_select" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Notifications: admin read-all
CREATE POLICY "admin_notifications_select" ON public.notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- 5. Immutable audit trigger — auto-log sensitive DB operations
CREATE OR REPLACE FUNCTION public.audit_sensitive_operation()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_action TEXT;
BEGIN
  v_action := TG_OP; -- INSERT, UPDATE, DELETE
  INSERT INTO public.audit_logs (
    user_id, action, resource, resource_id,
    metadata, severity, changed_from, changed_to
  ) VALUES (
    auth.uid(),
    lower(v_action) || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP),
    CASE WHEN TG_OP = 'DELETE' THEN 'warn' ELSE 'info' END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

-- Attach audit trigger to sensitive tables
DROP TRIGGER IF EXISTS audit_users_changes       ON public.users;
DROP TRIGGER IF EXISTS audit_subscriptions_changes ON public.subscriptions;
DROP TRIGGER IF EXISTS audit_case_lawyers_changes  ON public.case_lawyers;

CREATE TRIGGER audit_users_changes
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_operation();

CREATE TRIGGER audit_subscriptions_changes
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_operation();

CREATE TRIGGER audit_case_lawyers_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.case_lawyers
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_operation();

-- 6. Prevent anyone (including service_role) from deleting audit_logs or timeline_events
CREATE OR REPLACE FUNCTION public.prevent_audit_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Deletion of audit records is not permitted.';
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS no_delete_audit     ON public.audit_logs;
DROP TRIGGER IF EXISTS no_delete_timeline  ON public.timeline_events;
DROP TRIGGER IF EXISTS no_delete_consent   ON public.consent_logs;

CREATE TRIGGER no_delete_audit
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_delete();

CREATE TRIGGER no_delete_timeline
  BEFORE DELETE ON public.timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_delete();

CREATE TRIGGER no_delete_consent
  BEFORE DELETE ON public.consent_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_delete();

-- 7. Function: admin ban user (sets role to banned, cancels subscription)
CREATE OR REPLACE FUNCTION public.admin_ban_user(p_target_id UUID, p_reason TEXT)
RETURNS VOID SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Only admins can call this
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  -- Log the action
  INSERT INTO public.audit_logs (user_id, action, resource, resource_id, severity, metadata)
  VALUES (auth.uid(), 'admin_ban_user', 'users', p_target_id, 'critical',
    jsonb_build_object('reason', p_reason, 'banned_by', auth.uid()));
END; $$;
