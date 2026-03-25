'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Activity, Clock, CheckSquare, Zap, Loader2, RefreshCw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { healthConfig } from './health-badge';
import type { LawyerPerformanceScore } from '@/types';

interface LawyerScorePanelProps {
  caseId: string;
  locale: string;
  compact?: boolean;
}

interface ScoreDimension {
  key:     keyof LawyerPerformanceScore;
  icon:    React.ElementType;
  label_en: string;
  label_ar: string;
  tip_en:  string;
  tip_ar:  string;
  weight:  string;
}

const DIMENSIONS: ScoreDimension[] = [
  { key: 'activity',         icon: Activity,     label_en: 'Activity',          label_ar: 'النشاط',        tip_en: 'Logs per week',           tip_ar: 'الإجراءات أسبوعياً',    weight: '30%' },
  { key: 'recency',          icon: Clock,        label_en: 'Recency',           label_ar: 'الحداثة',       tip_en: 'Days since last update',  tip_ar: 'أيام منذ آخر تحديث',   weight: '30%' },
  { key: 'deadline_respect', icon: CheckSquare,  label_en: 'Deadline Respect',  label_ar: 'الالتزام بالمواعيد', tip_en: '% deadlines met',    tip_ar: 'نسبة المواعيد المستوفاة', weight: '25%' },
  { key: 'responsiveness',   icon: Zap,          label_en: 'Responsiveness',    label_ar: 'الاستجابة',     tip_en: 'Time to first action',    tip_ar: 'وقت أول إجراء',         weight: '15%' },
];

function ScoreBar({ dim, value, isRTL }: { dim: ScoreDimension; value: number; isRTL: boolean }) {
  const Icon  = dim.icon;
  const color = value >= 75 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const text  = value >= 75 ? 'text-emerald-600 dark:text-emerald-400' : value >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-1.5" title={isRTL ? dim.tip_ar : dim.tip_en}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          <Icon className="h-3 w-3" />
          {isRTL ? dim.label_ar : dim.label_en}
          <span className="text-muted-foreground/50">({dim.weight})</span>
        </span>
        <span className={cn('font-bold tabular-nums', text)}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700 ease-out', color)}
          style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ScoreRing({ value, size = 88 }: { value: number; size?: number }) {
  const r    = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const cfg  = healthConfig(value);
  const offset = circ - (value / 100) * circ;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor"
          strokeWidth={9} className="text-muted" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cfg.ring}
          strokeWidth={9} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-xl font-black tabular-nums', cfg.color)}>{value}</span>
      </div>
    </div>
  );
}

export function LawyerScorePanel({ caseId, locale, compact = false }: LawyerScorePanelProps) {
  const isRTL = locale === 'ar';
  const [score,     setScore]     = useState<LawyerPerformanceScore | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTip,   setShowTip]   = useState(false);

  const fetchScore = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/lawyer-score${refresh ? '?refresh=1' : ''}`);
      if (res.ok) setScore(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => { fetchScore(); }, [fetchScore]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!score) return null;

  const cfg       = healthConfig(score.total);
  const label     = isRTL ? cfg.label_ar : cfg.label_en;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', cfg.bg, cfg.border)}>
        <ScoreRing value={score.total} size={52} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            {isRTL ? 'أداء المحامي' : 'Lawyer Performance'}
          </p>
          <p className={cn('text-sm font-bold', cfg.color)}>{label}</p>
          <p className="text-[10px] text-muted-foreground">
            {isRTL ? `${score.logs_count} إجراء` : `${score.logs_count} action${score.logs_count !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'أداء المحامي' : 'Lawyer Performance Score'}
          <span className="text-[10px] rounded-full bg-[#1A3557]/10 text-[#1A3557] px-2 py-0.5 font-bold normal-case">
            {isRTL ? 'للموكّل فقط' : 'Client only'}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTip(v => !v)}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition">
            <Info className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => fetchScore(true)} disabled={refreshing}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Tip tooltip */}
      {showTip && (
        <div className="px-5 py-3 bg-[#1A3557]/5 border-b border-border animate-fade-in">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isRTL
              ? 'يحسب المؤشر بناءً على: النشاط (30%) + الحداثة (30%) + الالتزام بالمواعيد (25%) + سرعة الاستجابة (15%). استرشادي فقط وليس حكماً قانونياً.'
              : 'Score = Activity 30% + Recency 30% + Deadline Respect 25% + Responsiveness 15%. Informational only — not a legal finding.'}
          </p>
        </div>
      )}

      <div className="p-5 space-y-5">
        {/* Ring + summary */}
        <div className="flex items-center gap-5">
          <ScoreRing value={score.total} />
          <div className="flex-1 min-w-0">
            <p className={cn('text-lg font-black', cfg.color)}>{label}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isRTL
                ? `${score.logs_count} إجراء قانوني مسجّل`
                : `${score.logs_count} legal action${score.logs_count !== 1 ? 's' : ''} logged`}
            </p>
            {score.last_activity && (
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {isRTL ? 'آخر نشاط: ' : 'Last activity: '}
                {new Date(score.last_activity).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>

        {/* 4 dimension bars */}
        <div className="space-y-3 border-t border-border pt-4">
          {DIMENSIONS.map((dim) => (
            <ScoreBar
              key={dim.key}
              dim={dim}
              value={(score[dim.key] as number) ?? 0}
              isRTL={isRTL}
            />
          ))}
        </div>

        {/* Score breakdown mini-legend */}
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
          {[
            { range: '75–100', label_en: 'Excellent', label_ar: 'ممتاز', color: 'bg-emerald-500' },
            { range: '50–74',  label_en: 'Fair',      label_ar: 'مقبول', color: 'bg-amber-500'   },
            { range: '0–49',   label_en: 'Concern',   label_ar: 'مقلق',  color: 'bg-red-500'     },
          ].map((item) => (
            <div key={item.range} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full shrink-0', item.color)} />
              <span className="text-[9px] text-muted-foreground font-medium">
                {item.range} {isRTL ? item.label_ar : item.label_en}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-4">
        <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
          {isRTL
            ? 'هذا المؤشر استرشادي بناءً على الإجراءات المسجّلة في وكيلا. لا يُعدّ حكماً قانونياً أو تقييماً رسمياً.'
            : 'Score is informational, based on logged activity in Wakeela. Not a legal assessment or formal evaluation.'}
        </p>
      </div>
    </div>
  );
}
