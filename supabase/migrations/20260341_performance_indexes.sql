-- ================================================================
-- Performance indexes for high-traffic queries
--
-- These cover the most common query patterns:
--   - Notifications unread count (dashboard layout on EVERY page)
--   - NDE flags by case + open status (dashboard + case detail)
--   - Case lawyers lookup (middleware auth check)
--   - Invoices by client/lawyer (invoice list pages)
--   - Timeline events ordering (case detail)
--   - Audit logs by resource (witness view)
-- ================================================================

-- notifications: most common query is unread count per user
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;

-- nde_flags: open flags per case (dashboard + case detail)
CREATE INDEX IF NOT EXISTS idx_nde_flags_case_open
  ON public.nde_flags(case_id, resolved_at)
  WHERE resolved_at IS NULL;

-- case_lawyers: active assignments per lawyer (middleware auth + lawyer pages)
CREATE INDEX IF NOT EXISTS idx_case_lawyers_active
  ON public.case_lawyers(lawyer_id, status)
  WHERE status = 'active';

-- cases: updated_at ordering for dashboard list
CREATE INDEX IF NOT EXISTS idx_cases_client_updated
  ON public.cases(client_id, updated_at DESC)
  WHERE status = 'active';

-- invoices: lawyer invoice list
CREATE INDEX IF NOT EXISTS idx_invoices_lawyer_created
  ON public.invoices(lawyer_id, created_at DESC);

-- invoices: client invoice list (exclude drafts)
CREATE INDEX IF NOT EXISTS idx_invoices_client_status
  ON public.invoices(client_id, status, created_at DESC)
  WHERE status != 'draft';

-- timeline_events: per-case chronological ordering
CREATE INDEX IF NOT EXISTS idx_timeline_case_asc
  ON public.timeline_events(case_id, created_at ASC);

-- audit_logs: resource lookups (witness view)
CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON public.audit_logs(resource, resource_id);

-- witness_links: token lookup (public witness view)
CREATE INDEX IF NOT EXISTS idx_witness_token
  ON public.witness_links(token)
  WHERE is_revoked = false;

-- case_summaries: per-case lookup
CREATE INDEX IF NOT EXISTS idx_case_summaries_case
  ON public.case_summaries(case_id);

-- vault_shares: token lookup
CREATE INDEX IF NOT EXISTS idx_vault_shares_token
  ON public.vault_shares(token)
  WHERE is_revoked = false;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
