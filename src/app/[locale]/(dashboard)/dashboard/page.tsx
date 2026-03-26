import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';    // removed getLocale
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { HealthBadge, HealthDot } from '@/components/scores/health-badge';
import {
  Plus, FolderOpen, AlertTriangle, Calendar, TrendingUp,
  Shield, Scale, FileText, ChevronRight, ChevronLeft, Clock,
  Users, Building2, Home, MoreHorizontal,
} from 'lucide-react';

// ── Case type icon config ──────────────────────────────────────
const CASE_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  employment: { icon: Scale,        color: 'text-blue-600   bg-blue-50   dark:bg-blue-950/40'   },
  family:     { icon: Users,        color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
  commercial: { icon: Building2,    color: 'text-amber-600  bg-amber-50  dark:bg-amber-950/40'  },
  property:   { icon: Home,         color: 'text-green-600  bg-green-50  dark:bg-green-950/40'  },
  criminal:   { icon: Shield,       color: 'text-red-600    bg-red-50    dark:bg-red-950/40'    },
  other:      { icon: MoreHorizontal, color: 'text-gray-600 bg-gray-50   dark:bg-gray-900/40'   },
};

function CaseTypeIcon({ type }: { type: string }) {
  const cfg = CASE_TYPE_CONFIG[type] ?? CASE_TYPE_CONFIG.other;
  const Icon = cfg.icon;
  return (
    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cfg.color)}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-100    text-red-700    dark:bg-red-900/40    dark:text-red-400',
    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    medium:   'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-400',
    low:      'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-400',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', map[severity] ?? 'bg-muted text-muted-foreground')}>
      {severity}
    </span>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;          // ✅ locale from URL
  const supabase = await createClient();
  const t        = await getTranslations({ locale, namespace: 'dashboard' });
  const isRTL    = locale === 'ar';
  const Chevron  = isRTL ? ChevronLeft : ChevronRight;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // ── Parallel data fetching — was 2 serial round-trips ────────
  const [{ data: cases }, { data: profile }] = await Promise.all([
    supabase
      .from('cases')
      .select(`
        id, title, case_type, jurisdiction, status, health_score,
        lawyer_name, created_at, updated_at,
        deadlines(id, title, due_date, status, type),
        nde_flags(id, severity, rule_id, triggered_at, resolved_at),
        documents(id)
      `)
      .eq('client_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false }),
    supabase
      .from('users')
      .select('full_name, subscription_tier')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const activeCases = cases ?? [];

  // Flatten open flags across all cases
  const openFlags = activeCases.flatMap((c) =>
    ((c.nde_flags as Array<{ id: string; severity: string; rule_id: number; resolved_at: string | null }>))
      .filter((f) => !f.resolved_at)
      .map((f) => ({ ...f, caseTitle: c.title, caseId: c.id }))
  );

  // Upcoming deadlines sorted by date
  const upcomingDL = activeCases
    .flatMap((c) =>
      ((c.deadlines as Array<{ id: string; title: string; due_date: string; status: string; type: string }>))
        .filter((d) => d.status === 'pending' && new Date(d.due_date) > new Date())
        .map((d) => ({ ...d, caseTitle: c.title, caseId: c.id }))
    )
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5);

  const avgHealth = activeCases.length
    ? Math.round(activeCases.reduce((s, c) => s + c.health_score, 0) / activeCases.length)
    : 0;

  const firstName = profile?.full_name?.split(' ')[0] ?? '';

  // ── Helpers ────────────────────────────────────────────────
  const daysUntil = (d: string) =>
    Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  const ruleLabel: Record<number, string> = {
    1: isRTL ? 'تقصير المحامي'  : 'Lawyer inactivity',
    2: isRTL ? 'موعد فائت'      : 'Missed deadline',
    3: isRTL ? 'صمت مطوّل'     : 'Extended silence',
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-10">

      {/* Greeting + CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isRTL
              ? `مرحباً${firstName ? `، ${firstName}` : ''} 👋`
              : `Welcome back${firstName ? `, ${firstName}` : ''} 👋`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#1A3557] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition shadow-sm shrink-0"
        >
          <Plus className="h-4 w-4" />
          {t('createCase')}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: t('activeCases'),    value: activeCases.length,          icon: FolderOpen,    color: 'text-[#1A3557]',  bg: 'bg-[#1A3557]/10' },
          { label: t('totalDeadlines'), value: upcomingDL.length,           icon: Calendar,      color: 'text-[#0E7490]',  bg: 'bg-[#0E7490]/10' },
          { label: t('openAlerts'),     value: openFlags.length,            icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-100 dark:bg-amber-900/20' },
          { label: t('avgHealth'),      value: activeCases.length ? `${avgHealth}%` : '—', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
        ] as const).map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground leading-snug">{label}</p>
              <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', bg)}>
                <Icon className={cn('h-4 w-4', color)} />
              </div>
            </div>
            <p className={cn('text-3xl font-black', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Cases + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Cases list (2 cols) ──────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {isRTL ? 'القضايا النشطة' : 'Active Cases'}
          </h2>

          {activeCases.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
              <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="font-semibold text-foreground text-lg mb-1">{t('noCases')}</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">{t('noCasesDesc')}</p>
              <Link
                href="/cases/new"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1A3557] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition"
              >
                <Plus className="h-4 w-4" />
                {t('createCase')}
              </Link>
            </div>
          ) : (
            activeCases.map((c) => {
              const flags     = (c.nde_flags as Array<{ resolved_at: string | null; severity: string }>).filter((f) => !f.resolved_at);
              const deadlines = (c.deadlines as Array<{ due_date: string; status: string; title: string }>);
              const nextDL    = deadlines
                .filter((d) => d.status === 'pending' && new Date(d.due_date) > new Date())
                .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
              const docCount  = (c.documents as unknown[]).length;

              return (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}`}
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 hover:border-[#1A3557]/30 hover:shadow-md transition-all duration-200"
                >
                  <CaseTypeIcon type={c.case_type} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <p className="font-semibold text-foreground group-hover:text-[#1A3557] transition-colors leading-snug">
                        {c.title}
                      </p>
                      <HealthBadge score={c.health_score} isRTL={isRTL} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
                      {c.jurisdiction && (
                        <span className="flex items-center gap-1">
                          <Scale className="h-3 w-3" />{c.jurisdiction}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        {c.lawyer_name
                          ? <><Shield className="h-3 w-3" />{c.lawyer_name}</>
                          : <span className="text-muted-foreground/50">{isRTL ? 'لا يوجد محامٍ' : 'No lawyer'}</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{fmtDate(c.updated_at)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {flags.length > 0 && (
                        <span className="flex items-center gap-1 font-medium text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {flags.length} {isRTL ? 'تنبيه' : 'alert'}
                        </span>
                      )}
                      {nextDL && (
                        <span className={cn('flex items-center gap-1 font-medium', daysUntil(nextDL.due_date) <= 3 ? 'text-red-600' : 'text-muted-foreground')}>
                          <Calendar className="h-3 w-3" />
                          {fmtDate(nextDL.due_date)}
                          {daysUntil(nextDL.due_date) <= 3 && (
                            <span className="font-bold"> ({daysUntil(nextDL.due_date)}d)</span>
                          )}
                        </span>
                      )}
                      {docCount > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <FileText className="h-3 w-3" />{docCount} {isRTL ? 'مستند' : 'doc'}
                        </span>
                      )}
                    </div>
                  </div>

                  <Chevron className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1 group-hover:text-[#1A3557] transition-colors" />
                </Link>
              );
            })
          )}
        </div>

        {/* ── Right sidebar ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Upcoming deadlines widget */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#0E7490]" />
              {t('upcomingDeadlines')}
            </h3>
            {upcomingDL.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('noDeadlines')}</p>
            ) : (
              <ul className="space-y-3">
                {upcomingDL.map((d) => {
                  const days = daysUntil(d.due_date);
                  const urgent = days <= 1;
                  const warn   = days <= 3 && !urgent;
                  return (
                    <li key={d.id} className="flex items-start gap-3">
                      <div className={cn(
                        'shrink-0 rounded-lg px-2 py-1 text-center min-w-[42px]',
                        urgent ? 'bg-red-100    dark:bg-red-900/30'
                          : warn ? 'bg-orange-100 dark:bg-orange-900/30'
                          : 'bg-muted'
                      )}>
                        <p className={cn('text-lg font-black leading-none',
                          urgent ? 'text-red-600' : warn ? 'text-orange-600' : 'text-foreground'
                        )}>
                          {days}
                        </p>
                        <p className="text-[9px] font-medium text-muted-foreground uppercase">
                          {isRTL ? 'يوم' : 'days'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{d.caseTitle}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Active alerts widget */}
          {openFlags.length > 0 && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {t('recentAlerts')}
              </h3>
              <ul className="space-y-2">
                {openFlags.slice(0, 5).map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {ruleLabel[f.rule_id] ?? `Rule ${f.rule_id}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{f.caseTitle}</p>
                    </div>
                    <SeverityBadge severity={f.severity} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick links */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {isRTL ? 'إجراءات سريعة' : 'Quick actions'}
            </h3>
            <div className="space-y-1">
              {[
                { href: '/cases/new', label: isRTL ? 'قضية جديدة'       : 'New case',         icon: Plus     },
                { href: '/vault',     label: isRTL ? 'خزنة المستندات'    : 'Evidence vault',   icon: FileText },
                { href: '/deadlines', label: isRTL ? 'كل المواعيد'       : 'All deadlines',    icon: Calendar },
                { href: '/alerts',    label: isRTL ? 'كل التنبيهات'      : 'All alerts',       icon: AlertTriangle },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground/50 text-center max-w-lg mx-auto leading-relaxed">
        {isRTL
          ? 'وكيلا أداة توثيق فقط. التنبيهات استرشادية وليست أحكاماً قانونية.'
          : 'Wakeela is a documentation tool only. Alerts are informational and do not constitute legal findings.'}
      </p>
    </div>
  );
}
