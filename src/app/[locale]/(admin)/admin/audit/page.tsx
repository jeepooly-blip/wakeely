import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100    text-red-700    dark:bg-red-900/30',
  error:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  warn:     'bg-amber-100  text-amber-700  dark:bg-amber-900/30',
  info:     'bg-blue-50    text-blue-700   dark:bg-blue-900/20',
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; action?: string; page?: string }>;
}) {
  const locale = await getLocale();
  await requireAdmin(locale);

  const sp       = await searchParams;
  const page     = Math.max(1, parseInt(sp.page ?? '1', 10));
  const limit    = 50;
  const severity = sp.severity ?? '';
  const action   = sp.action?.trim().slice(0, 100) ?? '';
  const from     = (page - 1) * limit;

  const supabase = createAdminClient();
  let query = supabase
    .from('audit_logs')
    .select('id,user_id,user_email,action,resource,resource_id,severity,ip_address,metadata,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (severity) query = query.eq('severity', severity);
  if (action)   query = query.ilike('action', `%${action}%`);

  const { data: logs, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-[#0E7490]" />
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{count ?? 0} total events · immutable record</p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-2">
        <input name="action" defaultValue={action} placeholder="Filter by action…"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7490]/30" />
        <select name="severity" defaultValue={severity}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
        </select>
        <button type="submit" className="rounded-xl bg-[#0E7490] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0c6578] transition">
          Filter
        </button>
      </form>

      {/* Log table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Severity', 'Action', 'User', 'Resource', 'IP', 'Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition">
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', SEVERITY_COLORS[log.severity] ?? SEVERITY_COLORS.info)}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-foreground">{log.action}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate">
                    {log.user_email ?? log.user_id?.slice(0, 8) ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{log.resource ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground" dir="ltr">{log.ip_address ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap" dir="ltr">
                    {new Date(log.created_at).toLocaleString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(logs ?? []).length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No audit events match your filters.</p>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <a key={p} href={`?page=${p}&severity=${severity}&action=${action}`}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition',
                p === page ? 'bg-[#0E7490] text-white' : 'border border-border text-muted-foreground hover:bg-muted')}>
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
