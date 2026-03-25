'use client';

import { cn } from '@/lib/utils';
import { healthConfig, HealthRing } from './health-badge';
import { AlertTriangle, Calendar, FileText, Shield, TrendingDown, TrendingUp } from 'lucide-react';

interface CaseHealthCardProps {
  score:         number;
  openFlags:     number;
  missedDLs:     number;
  docCount:      number;
  daysIdle:      number;
  hasLawyer:     boolean;
  nextDeadline?: string;
  locale:        string;
  showDetail?:   boolean;
}

interface Factor {
  icon:      React.ElementType;
  label_en:  string;
  label_ar:  string;
  status:    'good' | 'warn' | 'bad';
  value:     string;
}

export function CaseHealthCard({
  score, openFlags, missedDLs, docCount, daysIdle,
  hasLawyer, nextDeadline, locale, showDetail = true,
}: CaseHealthCardProps) {
  const isRTL = locale === 'ar';
  const cfg   = healthConfig(score);

  const daysToNext = nextDeadline
    ? Math.ceil((new Date(nextDeadline).getTime() - Date.now()) / 86_400_000)
    : null;

  const factors: Factor[] = [
    {
      icon:     AlertTriangle,
      label_en: 'NDE Alerts',
      label_ar: 'تنبيهات NDE',
      status:   openFlags === 0 ? 'good' : openFlags <= 1 ? 'warn' : 'bad',
      value:    openFlags === 0
        ? (isRTL ? 'لا تنبيهات' : 'Clear')
        : `${openFlags} ${isRTL ? 'تنبيه' : 'open'}`,
    },
    {
      icon:     Calendar,
      label_en: 'Missed Deadlines',
      label_ar: 'مواعيد فائتة',
      status:   missedDLs === 0 ? 'good' : missedDLs === 1 ? 'warn' : 'bad',
      value:    missedDLs === 0
        ? (isRTL ? 'لا فوائت' : 'None')
        : `${missedDLs} ${isRTL ? 'فائت' : 'missed'}`,
    },
    {
      icon:     FileText,
      label_en: 'Documents',
      label_ar: 'المستندات',
      status:   docCount >= 3 ? 'good' : docCount >= 1 ? 'warn' : 'bad',
      value:    `${docCount} ${isRTL ? 'مستند' : 'doc' + (docCount !== 1 ? 's' : '')}`,
    },
    {
      icon:     daysIdle > 14 ? TrendingDown : TrendingUp,
      label_en: 'Activity',
      label_ar: 'النشاط',
      status:   daysIdle <= 3 ? 'good' : daysIdle <= 7 ? 'warn' : 'bad',
      value:    daysIdle === 0
        ? (isRTL ? 'اليوم' : 'Today')
        : `${daysIdle}d ${isRTL ? 'منذ' : 'idle'}`,
    },
    {
      icon:     Shield,
      label_en: 'Lawyer',
      label_ar: 'المحامي',
      status:   hasLawyer ? 'good' : 'warn',
      value:    hasLawyer
        ? (isRTL ? 'مُعيَّن' : 'Assigned')
        : (isRTL ? 'غير مُعيَّن' : 'Not assigned'),
    },
  ];

  const statusColor = {
    good: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    warn: 'text-amber-600  dark:text-amber-400  bg-amber-50  dark:bg-amber-900/20',
    bad:  'text-red-600    dark:text-red-400    bg-red-50    dark:bg-red-900/20',
  };

  const statusIcon = { good: '✓', warn: '⚠', bad: '✗' };

  return (
    <div className={cn('rounded-2xl border bg-card overflow-hidden', cfg.border)}>

      {/* Header strip */}
      <div className={cn('px-5 py-3 flex items-center justify-between', cfg.bg)}>
        <p className={cn('text-xs font-bold uppercase tracking-wider', cfg.color)}>
          {isRTL ? 'صحة القضية' : 'Case Health'}
        </p>
        <p className={cn('text-xs font-bold', cfg.color)}>
          {isRTL ? cfg.label_ar : cfg.label_en}
        </p>
      </div>

      <div className="p-5">
        {/* Ring + next deadline */}
        <div className="flex items-center gap-5 mb-5">
          <HealthRing score={score} size={90} isRTL={isRTL} />
          <div className="flex-1 space-y-2">
            {daysToNext !== null && (
              <div className={cn(
                'rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2',
                daysToNext < 3 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                : daysToNext < 7 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
              )}>
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {isRTL
                  ? `الموعد التالي خلال ${daysToNext} يوم`
                  : `Next deadline in ${daysToNext} day${daysToNext !== 1 ? 's' : ''}`}
              </div>
            )}
            <div className="rounded-lg px-3 py-2 bg-muted/50 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{isRTL ? 'آخر تحديث: ' : 'Updated: '}</span>
              {isRTL ? 'تلقائي عند كل حدث' : 'Auto on every event'}
            </div>
          </div>
        </div>

        {/* 5 factor rows */}
        {showDetail && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {isRTL ? 'عوامل المؤشر' : 'Score Factors'}
            </p>
            {factors.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label_en} className="flex items-center gap-3">
                  <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs', statusColor[f.status])}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1 text-xs text-foreground font-medium">
                    {isRTL ? f.label_ar : f.label_en}
                  </span>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', statusColor[f.status])}>
                    {statusIcon[f.status]} {f.value}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
