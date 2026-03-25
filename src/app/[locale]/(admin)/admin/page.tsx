import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { Users, FolderOpen, TrendingUp, AlertTriangle, Activity, MessageCircle, FileText, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-black text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const locale  = await getLocale();
  await requireAdmin(locale);
  const supabase = createAdminClient();
  const ago7d   = new Date(Date.now() - 7*86400000).toISOString();
  const ago24h  = new Date(Date.now() - 86400000).toISOString();

  const [
    { count: totalUsers }, { count: newUsers7d }, { count: lawyers },
    { count: activeCases }, { count: proSubs }, { count: premiumSubs },
    { count: openFlags }, { count: critical24h }, { count: chatMsgs7d },
    { data: recentAudit },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'lawyer'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('tier', 'pro').eq('status', 'active'),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('tier', 'premium').eq('status', 'active'),
    supabase.from('nde_flags').select('*', { count: 'exact', head: true }).is('resolved_at', null),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('severity', 'critical').gte('created_at', ago24h),
    supabase.from('chat_messages').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('audit_logs').select('id,action,severity,ip_address,created_at').order('created_at', { ascending: false }).limit(8),
  ]);

  const mrrUsd = ((proSubs ?? 0) * 29) + ((premiumSubs ?? 0) * 79);

  const severityColor: Record<string, string> = {
    critical: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    warn:     'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    error:    'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    info:     'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-foreground">Admin Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time platform metrics · {new Date().toLocaleString('en-AE')}
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users"       value={totalUsers ?? 0}  sub={`+${newUsers7d ?? 0} this week`} icon={Users}         color="bg-[#1A3557]/10 text-[#1A3557]" />
        <StatCard label="Active Cases"      value={activeCases ?? 0} sub={`${lawyers ?? 0} lawyers`}       icon={FolderOpen}    color="bg-[#0E7490]/10 text-[#0E7490]" />
        <StatCard label="MRR (USD)"         value={`$${mrrUsd}`}     sub={`Pro: ${proSubs ?? 0} · Premium: ${premiumSubs ?? 0}`} icon={CreditCard} color="bg-emerald-100 text-emerald-600" />
        <StatCard label="Open NDE Flags"    value={openFlags ?? 0}   sub={`${critical24h ?? 0} critical in 24h`} icon={AlertTriangle} color="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Chat (7d)"         value={chatMsgs7d ?? 0}  icon={MessageCircle} color="bg-purple-100 text-purple-600" />
        <StatCard label="Critical Events"   value={critical24h ?? 0} sub="last 24h"       icon={Activity}     color="bg-red-100 text-red-600" />
        <StatCard label="Pro Subs"          value={proSubs ?? 0}     icon={TrendingUp}    color="bg-blue-100 text-blue-600" />
        <StatCard label="Premium Subs"      value={premiumSubs ?? 0} icon={CreditCard}    color="bg-amber-100 text-[#C89B3C]" />
      </div>

      {/* Recent audit trail */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#0E7490]" />
            Recent Audit Events
          </h2>
          <a href={`/${locale}/admin/audit`} className="text-xs text-[#0E7490] hover:underline font-medium">
            View all →
          </a>
        </div>

        {(recentAudit ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No audit events yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {(recentAudit ?? []).map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-2.5">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0', severityColor[log.severity] ?? severityColor.info)}>
                  {log.severity}
                </span>
                <p className="text-xs font-mono text-foreground flex-1">{log.action}</p>
                <p className="text-[10px] text-muted-foreground shrink-0" dir="ltr">
                  {new Date(log.created_at).toLocaleString('en-AE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: `/${locale}/admin/users`,  label: 'Manage Users',    icon: Users        },
          { href: `/${locale}/admin/cases`,  label: 'Browse Cases',    icon: FolderOpen   },
          { href: `/${locale}/admin/audit`,  label: 'Audit Log',       icon: Activity     },
          { href: `/${locale}/admin/system`, label: 'System & Security', icon: FileText   },
        ].map(({ href, label, icon: Icon }) => (
          <a key={href} href={href}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-[#0E7490]/50 hover:bg-[#0E7490]/5 transition">
            <Icon className="h-4 w-4 text-[#0E7490]" />
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
