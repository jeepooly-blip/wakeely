'use client';
import { cn } from '@/lib/utils';

interface HealthBadgeProps {
  score:      number;
  size?:      'sm' | 'md' | 'lg';
  isRTL?:     boolean;
  showLabel?: boolean;
  animate?:   boolean;
}

export function healthConfig(score: number) {
  if (score >= 75) return {
    color:    'text-emerald-700 dark:text-emerald-400',
    bg:       'bg-emerald-100 dark:bg-emerald-900/30',
    border:   'border-emerald-200 dark:border-emerald-800/50',
    bar:      'bg-emerald-500',
    dot:      'bg-emerald-500',
    ring:     '#10b981',
    label_en: 'Healthy',
    label_ar: 'جيدة',
    icon:     '✓',
  };
  if (score >= 50) return {
    color:    'text-amber-700 dark:text-amber-400',
    bg:       'bg-amber-100 dark:bg-amber-900/30',
    border:   'border-amber-200 dark:border-amber-800/50',
    bar:      'bg-amber-500',
    dot:      'bg-amber-500',
    ring:     '#f59e0b',
    label_en: 'Needs Attention',
    label_ar: 'تحتاج متابعة',
    icon:     '⚠',
  };
  return {
    color:    'text-red-700 dark:text-red-400',
    bg:       'bg-red-100 dark:bg-red-900/30',
    border:   'border-red-200 dark:border-red-800/50',
    bar:      'bg-red-500',
    dot:      'bg-red-500',
    ring:     '#ef4444',
    label_en: 'Urgent Action',
    label_ar: 'إجراء عاجل',
    icon:     '✗',
  };
}

export function HealthBadge({ score, size = 'md', isRTL = false, showLabel = true, animate = true }: HealthBadgeProps) {
  const cfg   = healthConfig(score);
  const sizes = { sm: 'text-xs px-2 py-0.5 gap-1', md: 'text-xs px-2.5 py-1 gap-1.5', lg: 'text-sm px-3 py-1.5 gap-2' };
  return (
    <span className={cn('inline-flex items-center rounded-full font-bold border', cfg.color, cfg.bg, cfg.border, sizes[size], animate && 'transition-all duration-300')}>
      <span>{cfg.icon}</span>
      <span className="tabular-nums">{score}%</span>
      {showLabel && <span className="opacity-80">{isRTL ? cfg.label_ar : cfg.label_en}</span>}
    </span>
  );
}

export function HealthRing({ score, size = 100, isRTL = false }: { score: number; size?: number; isRTL?: boolean }) {
  const cfg  = healthConfig(score);
  const r    = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={10} className="text-muted" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cfg.ring} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-black tabular-nums', cfg.color)}>{score}</span>
          <span className="text-[10px] text-muted-foreground font-semibold">/ 100</span>
        </div>
      </div>
      <span className={cn('text-xs font-bold', cfg.color)}>{isRTL ? cfg.label_ar : cfg.label_en}</span>
    </div>
  );
}

export function HealthDot({ score }: { score: number }) {
  const cfg = healthConfig(score);
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', cfg.dot, score < 50 && 'animate-pulse')} />;
}
