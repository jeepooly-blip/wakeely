'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, X, Send, FileText, Scale, ChevronDown, ChevronUp,
  CheckCircle2, ShieldAlert, Clock,
} from 'lucide-react';

export interface NDEFlag {
  id:           string;
  rule_id:      1 | 2 | 3;
  severity:     'low' | 'medium' | 'high' | 'critical';
  triggered_at: string;
  resolved_at:  string | null;
  action_taken: string | null;
  case_id:      string;
  payload?: {
    days_silent?:   number;
    deadline_title?: string;
    message?:        string;
  };
}

interface NDEAlertBannerProps {
  flags:    NDEFlag[];
  caseId:   string;
  onUpdate: () => void;
}

type ResolveAction = 'send_reminder' | 'log_update' | 'start_escalation' | 'dismissed';

const SEVERITY_CONFIG = {
  critical: {
    bg:     'bg-red-50    dark:bg-red-950/30',
    border: 'border-red-300  dark:border-red-800/60',
    icon:   'text-red-600',
    badge:  'bg-red-100   dark:bg-red-900/50 text-red-700 dark:text-red-400',
    bar:    'bg-red-500',
  },
  high: {
    bg:     'bg-orange-50  dark:bg-orange-950/20',
    border: 'border-orange-300 dark:border-orange-800/60',
    icon:   'text-orange-600',
    badge:  'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
    bar:    'bg-orange-500',
  },
  medium: {
    bg:     'bg-amber-50   dark:bg-amber-950/20',
    border: 'border-amber-300  dark:border-amber-800/60',
    icon:   'text-amber-600',
    badge:  'bg-amber-100  dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
    bar:    'bg-amber-500',
  },
  low: {
    bg:     'bg-blue-50    dark:bg-blue-950/20',
    border: 'border-blue-200   dark:border-blue-800/60',
    icon:   'text-blue-600',
    badge:  'bg-blue-100   dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
    bar:    'bg-blue-500',
  },
} as const;

export function NDEAlertBanner({ flags, caseId, onUpdate }: NDEAlertBannerProps) {
  const locale  = useLocale();
  const t       = useTranslations('nde_alerts');
  const router  = useRouter();
  const isRTL   = locale === 'ar';

  const [expanded,   setExpanded]   = useState<string | null>(flags[0]?.id ?? null);
  const [resolving,  setResolving]  = useState<string | null>(null);
  const [dismissed,  setDismissed]  = useState<Set<string>>(new Set());

  const openFlags = flags.filter(
    (f) => !f.resolved_at && !dismissed.has(f.id)
  );

  if (!openFlags.length) return null;

  // Sort: critical → high → medium → low
  const sortOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...openFlags].sort(
    (a, b) => sortOrder[a.severity] - sortOrder[b.severity]
  );

  const handleResolve = async (flagId: string, action: ResolveAction) => {
    setResolving(flagId);
    try {
      const res = await fetch(`/api/nde/flags/${flagId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_taken: action }),
      });
      if (!res.ok) throw new Error('Resolve failed');

      if (action === 'dismissed') {
        setDismissed((prev) => new Set([...prev, flagId]));
      }

      // For non-dismiss actions, also refresh the page
      if (action !== 'dismissed') {
        onUpdate();
        router.refresh();
      }
    } catch (e) {
      console.error('[NDE banner] resolve error:', e);
    } finally {
      setResolving(null);
    }
  };

  const getRuleName = (ruleId: 1 | 2 | 3): string => ({
    1: t('rule1.name'),
    2: t('rule2.name'),
    3: t('rule3.name'),
  })[ruleId];

  const getRuleDesc = (flag: NDEFlag): string => {
    const days = flag.payload?.days_silent ?? 0;
    const map: Record<number, string> = {
      1: t('rule1.description').replace('{days}', String(days)),
      2: t('rule2.description'),
      3: t('rule3.description').replace('{days}', String(days)),
    };
    return map[flag.rule_id] ?? '';
  };

  const getRuleAction = (ruleId: 1 | 2 | 3): string => ({
    1: t('rule1.action'),
    2: t('rule2.action'),
    3: t('rule3.action'),
  })[ruleId];

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  // CTA buttons for each rule
  const getActions = (flag: NDEFlag): { label: string; action: ResolveAction; icon: React.ElementType; variant: 'primary' | 'secondary' | 'ghost' }[] => {
    const base: { label: string; action: ResolveAction; icon: React.ElementType; variant: 'primary' | 'secondary' | 'ghost' }[] = [];

    if (flag.rule_id === 1) {
      base.push(
        { label: t('cta.sendReminder'), action: 'send_reminder', icon: Send,      variant: 'primary'   },
        { label: t('cta.logUpdate'),    action: 'log_update',    icon: FileText,   variant: 'secondary' },
        { label: t('cta.dismiss'),      action: 'dismissed',     icon: X,          variant: 'ghost'     },
      );
    } else if (flag.rule_id === 2) {
      base.push(
        { label: t('cta.escalate'),     action: 'start_escalation', icon: Scale,  variant: 'primary'   },
        { label: t('cta.logUpdate'),    action: 'log_update',    icon: FileText,   variant: 'secondary' },
        { label: t('cta.dismiss'),      action: 'dismissed',     icon: X,          variant: 'ghost'     },
      );
    } else if (flag.rule_id === 3) {
      base.push(
        { label: t('cta.escalate'),     action: 'start_escalation', icon: Scale,  variant: 'primary'   },
        { label: t('cta.sendReminder'), action: 'send_reminder', icon: Send,       variant: 'secondary' },
        { label: t('cta.dismiss'),      action: 'dismissed',     icon: X,          variant: 'ghost'     },
      );
    }

    return base;
  };

  return (
    <div className="space-y-3" role="alert" aria-live="polite">
      {/* Header summary if multiple */}
      {sorted.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-2.5">
          <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm font-medium text-foreground">
            {isRTL
              ? `${sorted.length} تنبيهات نشطة تحتاج انتباهك`
              : `${sorted.length} active alerts need your attention`}
          </p>
        </div>
      )}

      {/* Individual flag cards */}
      {sorted.map((flag) => {
        const cfg      = SEVERITY_CONFIG[flag.severity];
        const isOpen   = expanded === flag.id;
        const loading  = resolving === flag.id;
        const actions  = getActions(flag);

        return (
          <div
            key={flag.id}
            className={cn(
              'rounded-2xl border-2 overflow-hidden transition-all duration-200',
              cfg.border, cfg.bg
            )}
          >
            {/* Severity bar */}
            <div className={cn('h-1 w-full', cfg.bar)} />

            {/* Flag header — always visible */}
            <div
              className="flex items-start gap-3 px-5 py-4 cursor-pointer select-none"
              onClick={() => setExpanded(isOpen ? null : flag.id)}
            >
              {/* Icon */}
              <div className={cn('mt-0.5 shrink-0', cfg.icon)}>
                {flag.severity === 'critical'
                  ? <ShieldAlert className="h-5 w-5" />
                  : <AlertTriangle className="h-5 w-5" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold uppercase', cfg.badge)}>
                    {t(`severity.${flag.severity}`)}
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    {getRuleName(flag.rule_id)}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground leading-snug">
                  {getRuleDesc(flag)}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{t('flaggedOn').replace('{date}', fmtDate(flag.triggered_at))}</span>
                </div>
              </div>

              {/* Expand toggle */}
              <div className={cn('shrink-0 mt-1', cfg.icon)}>
                {isOpen
                  ? <ChevronUp   className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>

            {/* Expanded: action suggestion + CTA buttons */}
            {isOpen && (
              <div className="border-t border-current/10 px-5 pb-5 pt-4 animate-fade-in">

                {/* Action recommendation */}
                <div className="flex items-start gap-2 mb-4 rounded-xl bg-background/60 border border-current/10 px-4 py-3">
                  <CheckCircle2 className={cn('h-4 w-4 shrink-0 mt-0.5', cfg.icon)} />
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">
                      {isRTL ? 'الإجراء المقترح: ' : 'Suggested action: '}
                    </span>
                    {getRuleAction(flag.rule_id)}
                  </p>
                </div>

                {/* Deadline detail for Rule 2 */}
                {flag.rule_id === 2 && flag.payload?.deadline_title && (
                  <div className="mb-4 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-2.5">
                    <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
                      {isRTL ? 'الموعد الفائت: ' : 'Missed deadline: '}
                      <span className="font-bold">{flag.payload.deadline_title}</span>
                    </p>
                  </div>
                )}

                {/* CTA Buttons */}
                <div className="flex flex-wrap gap-2">
                  {actions.map(({ label, action, icon: Icon, variant }) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => handleResolve(flag.id, action)}
                      disabled={loading}
                      className={cn(
                        'flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50',
                        variant === 'primary'
                          ? 'bg-[#1A3557] text-white hover:bg-[#1e4a7a] shadow-sm'
                          : variant === 'secondary'
                          ? 'bg-background border border-border text-foreground hover:bg-muted'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                      )}
                    >
                      {loading
                        ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        : <Icon className="h-3.5 w-3.5" />}
                      {loading && action === actions[0].action
                        ? (isRTL ? 'جارٍ المعالجة…' : 'Processing…')
                        : label}
                    </button>
                  ))}
                </div>

                {/* Legal disclaimer */}
                <p className="mt-4 text-[10px] text-muted-foreground/60 leading-relaxed">
                  {t('disclaimer')}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
