'use client';

import { cn } from '@/lib/utils';
import type { DataRegion } from '@/types';
import { REGION_CONFIG } from '@/types';
import { CheckCircle2 } from 'lucide-react';

interface RegionSelectorProps {
  value: DataRegion | null;
  onChange: (region: DataRegion) => void;
  locale: string;
  className?: string;
}

export function RegionSelector({ value, onChange, locale, className }: RegionSelectorProps) {
  const isArabic = locale === 'ar';

  return (
    <div
      className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)}
      role="radiogroup"
      aria-label={isArabic ? '\u0645\u0646\u0637\u0642\u0629 \u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a' : 'Data storage region'}
    >
      {(Object.entries(REGION_CONFIG) as [DataRegion, typeof REGION_CONFIG[DataRegion]][]).map(
        ([region, config]) => {
          const isSelected = value === region;
          return (
            <button
              key={region}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(region)}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center',
                'transition-all duration-200 cursor-pointer',
                'hover:border-navy-700/50 hover:bg-navy-50 dark:hover:bg-navy-900/20',
                isSelected
                  ? 'border-[#1A3557] bg-[#1A3557]/5 dark:bg-[#1A3557]/20 shadow-md'
                  : 'border-border bg-card'
              )}
            >
              {isSelected && (
                <CheckCircle2
                  className="absolute top-2 end-2 h-4 w-4 text-[#1A3557]"
                  aria-hidden
                />
              )}
              <span className="text-3xl" role="img" aria-label={config.label}>
                {config.flag}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {isArabic ? config.labelAr : config.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {isArabic ? config.descriptionAr : config.description}
              </span>
            </button>
          );
        }
      )}
    </div>
  );
}
