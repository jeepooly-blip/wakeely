'use client';

import { useState, useCallback, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  ShieldAlert, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, ChevronRight, ChevronLeft, Play, Shield,
  Send, FileText, Scale, X,
} from 'lucide-react';

interface FlagWithCase {
  id:           string;
  rule_id:      1 | 2 | 3;
  severity:     'low' | 'medium' | 'high' | 'critical';
  triggered_at: string;
  resolved_at:  string | null;
  action_taken: string | null;
  case_id:      string;
  case_title:   string;
  payload:      Record<string, unknown>;
}

interface AlertsPageClientProps {
  initialFlags: FlagWithCase[];
}

type FilterMode = 'open' | 'resolved' | 'all';

const SEVERITY_CFG = {
  critical: { bar: 'bg-red-500',    badge: 'bg-red-100   dark:bg-red-900/40   text-red-700 dark:text-red-400',    ring: 'ring-red-200   dark:ring-red-900/40'    },
  high:     { bar: 'bg-orange-500', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400', ring: 'ring-orange-200 dark:ring-orange-900/40' },
  medium:   { bar: 'bg-amber-500',  badge: 'bg-amber-100  dark:bg-amber-900/40  text-amber-700 dark:text-amber-400',  ring: 'ring-amber-200  dark:ring-amber-900/40'  },
  low:      { bar: 'bg-blue-400',   badge: 'bg-blue-100   dark:bg-blue-900/40   text-blue-700 dark:text-blue-400',    ring: 'ring-blue-200   dark:ring-blue-900/40'   },
} as const;

export function AlertsPageClient({ initialFlags }: AlertsPageClientProps) {
  const locale  = useLocale();
  const t       = useTranslations('nde_alerts');
  const isRTL   = locale === 'ar';
  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  const [flags,      setFlags]      = useState<FlagWithCase[]>(initialFlags);
  const [filter,     setFilter]     = useState<FilterMode>('open');
  const [resolving,  setResolving]  = useState<string | null>(null);
  const [running,    setRunning]    = useState(false);
  const [lastRun,    setLastRun]    = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res  = await fetch('/api/nde/flags');
      const json = await res.json();
      if (json.data) setFlags(json.data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleResolve = async (flagId: string, action: string) => {
    setResolving(flagId);
    try {
      await fetch(`/api/nde/flags/${flagId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_taken: action }),
      });
      await refresh();
    } finally {
      setResolving(null);
    }
  };

  const runNDE = async () => {
    setRunning(true);
    try {
      await fetch('/api/cron/nde', {
        headers: { authorization: `Bearer ${process.env.NEXT_PUBLIC_NDE_TRIGGER_TOKEN ?? ''}` },
      });
      setLastRun(new Date());
      await refresh();
    } finally {
      setRunning(false);
    }
  };

  const sortOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const filtered  = flags
    .filter((f) =>
      filter === 'all'      ? true :
      filter === 'open'     ? !f.resolved_at :
      filter === 'resolved' ? !!f.resolved_at : true
    )
    .sort((a, b) => {
      if (!a.resolved_at && b.resolved_at) return -1;
      if (a.resolved_at && !b.resolved_at) return 1;
      return sortOrder[a.severity] - sortOrder[b.severity];
    });

  const openCount     = flags.filter((f) => !f.resolved_at).length;
  const resolvedCount = flags.filter((f) =>  f.resolved_at).length;

  const getRuleName = (ruleId: 1 | 2 | 3) => ({
    1: t('rule1.name'),
    2: t('rule2.name'),
    3: t('rule3.name'),
  })[ruleId];

  const getRuleDesc = (f: FlagWithCase) => {
    const days = (f.payload?.days_silent as number) ?? 0;
    return ({
      1: t('rule1.description').replace('{days}', String(days)),
      2: t('rule2.description'),
      3: t('rule3.description').replace('{days}', String(days)),
    })[f.rule_id];
  };

  const getActions = (ruleId: 1 | 2 | 3) => ({
    1: [
      { label: t('cta.sendReminder'), action: 'send_reminder',    icon: Send    },
      { label: t('cta.logUpdate'),    action: 'log_update',        icon: FileText},
      { label: t('cta.dismiss'),      action: 'dismissed',         icon: X       },
    ],
    2: [
      { label: t('cta.escalate'),     action: 'start_escalation',  icon: Scale   },
      { label: t('cta.logUpdate'),    action: 'log_update',        icon: FileText},
      { label: t('cta.dismiss'),      action: 'dismissed',         icon: X       },
    ],
    3: [
      { label: t('cta.escalate'),     action: 'start_escalation',  icon: Scale   },
      { label: t('cta.sendReminder'), action: 'send_reminder',    icon: Send    },
      { label: t('cta.dismiss'),      action: 'dismissed',         icon: X       },
    ],
  })[ruleId];

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-6 pb-10">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('openAlerts'),     value: openCount,     color: 'text-red-600',     bg: 'bg-red-50 dark:bg-red-950/20' },
          { label: t('resolvedAlerts'), value: resolvedCount, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
          { label: isRTL ? 'الإجمالي' : 'Total', value: flags.length, color: 'text-[#1A3557]', bg: 'bg-[#1A3557]/5 dark:bg-[#1A3557]/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center">
            <p className={cn('text-3xl font-black', color)}>{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* NDE info card */}
      <div className="rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/[0.03] dark:bg-[#1A3557]/10 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-[#1A3557] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">
              {isRTL ? 'محرك كشف الإهمال (NDE)' : 'Negligence Detection Engine'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('nextRun')}
            </p>
            {lastRun && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('lastRun')}: {fmtDate(lastRun.toISOString())}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {([
          { key: 'open',     label: t('filterOpen'),     count: openCount     },
          { key: 'resolved', label: t('filterResolved'), count: resolvedCount },
          { key: 'all',      label: t('filterAll'),      count: flags.length  },
        ] as { key: FilterMode; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all',
              filter === key
                ? 'bg-[#1A3557] text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {label}
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              filter === key ? 'bg-white/20' : 'bg-background'
            )}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500/30 mb-4" />
          <p className="font-semibold text-foreground text-lg">
            {filter === 'open' ? t('noAlerts') : t('allResolved')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter === 'open' ? t('noAlertsDesc') : ''}
          </p>
        </div>
      )}

      {/* Flag cards */}
      <div className="space-y-3">
        {filtered.map((flag) => {
          const cfg      = SEVERITY_CFG[flag.severity];
          const isResolved = !!flag.resolved_at;
          const loading  = resolving === flag.id;
          const actions  = getActions(flag.rule_id);

          return (
            <div
              key={flag.id}
              className={cn(
                'rounded-2xl border bg-card overflow-hidden transition-all',
                isResolved
                  ? 'border-border opacity-60'
                  : cn('ring-2', cfg.ring, 'border-transparent')
              )}
            >
              {/* Severity bar */}
              {!isResolved && <div className={cn('h-1 w-full', cfg.bar)} />}

              <div className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3">
                    {isResolved
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                      : <AlertTriangle className={cn('h-5 w-5 shrink-0 mt-0.5',
                          flag.severity === 'critical' ? 'text-red-600'
                          : flag.severity === 'high'   ? 'text-orange-600'
                          : 'text-amber-600'
                        )} />}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase', cfg.badge)}>
                          {t(`severity.${flag.severity}`)}
                        </span>
                        <h3 className={cn('text-sm font-bold', isResolved ? 'text-muted-foreground' : 'text-foreground')}>
                          {getRuleName(flag.rule_id)}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {getRuleDesc(flag)}
                      </p>
                    </div>
                  </div>

                  {/* Case link */}
                  <Link
                    href={`/cases/${flag.case_id}`}
                    className="shrink-0 flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
                  >
                    {isRTL ? 'عرض' : 'View'}
                    <Chevron className="h-3 w-3" />
                  </Link>
                </div>

                {/* Case name + timestamp */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium">
                    {t('case')}: {flag.case_title}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDate(flag.triggered_at)}
                  </span>
                  {isResolved && flag.resolved_at && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('resolvedAt').replace('{date}', fmtDate(flag.resolved_at))}
                      {flag.action_taken && ` · ${t(`actions.${flag.action_taken}` as Parameters<typeof t>[0])}`}
                    </span>
                  )}
                </div>

                {/* Action buttons — open flags only */}
                {!isResolved && (
                  <div className="flex flex-wrap gap-2">
                    {actions.map(({ label, action, icon: Icon }, idx) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => handleResolve(flag.id, action)}
                        disabled={loading}
                        className={cn(
                          'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50',
                          idx === 0
                            ? 'bg-[#1A3557] text-white hover:bg-[#1e4a7a] shadow-sm'
                            : idx === actions.length - 1
                            ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            : 'border border-border text-foreground hover:bg-muted'
                        )}
                      >
                        {loading
                          ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          : <Icon className="h-3 w-3" />}
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legal disclaimer */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed text-center">
          {t('disclaimer')}
        </p>
      </div>
    </div>
  );
}
