import { createAdminClient } from '@/lib/supabase/server';

export type AuditAction =
  | 'user_login' | 'user_logout' | 'user_register'
  | 'case_create' | 'case_update' | 'case_delete'
  | 'document_upload' | 'document_delete'
  | 'lawyer_invite' | 'lawyer_accept' | 'lawyer_revoke'
  | 'escalation_send' | 'escalation_download'
  | 'subscription_upgrade' | 'subscription_cancel'
  | 'admin_user_view' | 'admin_role_change' | 'admin_tier_change'
  | 'api_rate_limited' | 'unauthorized_access' | 'rls_violation_attempt';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

interface AuditEntry {
  user_id?:      string;
  user_email?:   string;
  action:        AuditAction;
  resource?:     string;
  resource_id?:  string;
  ip_address?:   string;
  session_id?:   string;
  severity?:     AuditSeverity;
  metadata?:     Record<string, unknown>;
  changed_from?: Record<string, unknown>;
  changed_to?:   Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('audit_logs').insert({
      user_id:      entry.user_id     ?? null,
      user_email:   entry.user_email  ?? null,
      action:       entry.action,
      resource:     entry.resource    ?? null,
      resource_id:  entry.resource_id ? entry.resource_id as unknown as string : null,
      ip_address:   entry.ip_address  ?? null,
      session_id:   entry.session_id  ?? null,
      severity:     entry.severity    ?? 'info',
      metadata:     entry.metadata    ?? {},
      changed_from: entry.changed_from ?? null,
      changed_to:   entry.changed_to   ?? null,
    });
  } catch {
    // Audit failures must never crash the main flow — log to console only
    console.error('[AUDIT] Failed to write audit log:', entry.action);
  }
}

/** Extract real IP from request headers (Vercel-aware) */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
