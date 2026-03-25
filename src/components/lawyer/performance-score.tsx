'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Activity, Clock, CheckSquare, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LawyerPerformanceScore } from '@/types';

interface PerformanceScoreProps {
  caseId: string;
  locale: string;
}

function ScoreRing({ value, size = 80 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 75 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor"
        strokeWidth={8} className="text-muted" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={8} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
    </svg>
  );
}

function ScoreBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const color = value >= 75 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3 w-3" />{label}
        </span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function LawyerPerformanceScoreWidget({ caseId, locale }: PerformanceScoreProps) {
  const isRTL = locale === 'ar';
  const [score,   setScore]   = useState<LawyerPerformanceScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/cases/${caseId}/lawyer-score`)
      .then((r) => r.json())
      .then((d) => { setScore(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [caseId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!score) return null;

  const label = score.total >= 75
    ? (isRTL ? 'أداء ممتاز' : 'Excellent')
    : score.total >= 50
    ? (isRTL ? 'أداء مقبول' : 'Fair')
    : (isRTL ? 'يحتاج تحسيناً' : 'Needs Improvement');

  const labelColor = score.total >= 75 ? 'text-emerald-600' : score.total >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5" />
        {isRTL ? 'أداء المحامي' : 'Lawyer Performance'}
        <span className="ms-auto text-[10px] rounded-full bg-muted px-2 py-0.5 normal-case">
          {isRTL ? 'للموكّل فقط' : 'Client only'}
        </span>
      </h3>

      <div className="flex items-center gap-5 mb-5">
        <div className="relative shrink-0">
          <ScoreRing value={score.total} size={80} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-foreground">{score.total}</span>
          </div>
        </div>
        <div>
          <p className={cn('text-base font-bold', labelColor)}>{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isRTL
              ? `${score.logs_count} إجراء مسجّل`
              : `${score.logs_count} action${score.logs_count !== 1 ? 's' : ''} logged`}
          </p>
          {score.last_activity && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isRTL ? 'آخر نشاط: ' : 'Last: '}
              {new Date(score.last_activity).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
                day: 'numeric', month: 'short',
              })}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <ScoreBar label={isRTL ? 'النشاط'       : 'Activity'}         value={score.activity}         icon={Activity}     />
        <ScoreBar label={isRTL ? 'الحداثة'      : 'Recency'}          value={score.recency}          icon={Clock}        />
        <ScoreBar label={isRTL ? 'المواعيد'     : 'Deadline Respect'} value={score.deadline_respect} icon={CheckSquare}  />
        <ScoreBar label={isRTL ? 'الاستجابة'    : 'Responsiveness'}   value={score.responsiveness}   icon={Zap}          />
      </div>

      <p className="mt-4 text-[10px] text-muted-foreground/50 leading-relaxed">
        {isRTL
          ? 'هذا المؤشر استرشادي بناءً على الإجراءات المسجّلة في وكيلا. لا يُعدّ حكماً قانونياً.'
          : 'Score is based on logged activity in Wakeela. Not a legal assessment.'}
      </p>
    </div>
  );
}
