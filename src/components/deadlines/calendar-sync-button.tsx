'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarPlus, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { googleCalendarUrl } from '@/lib/calendar';
import type { CalendarDeadline } from '@/lib/calendar';

interface CalendarSyncButtonProps {
  deadline: CalendarDeadline;
  locale:   string;
  /** 'row' = compact inline button for deadline list rows
   *  'bulk' = full-width button for the tracker header */
  variant?: 'row' | 'bulk';
}

export function CalendarSyncButton({
  deadline,
  locale,
  variant = 'row',
}: CalendarSyncButtonProps) {
  const isRTL        = locale === 'ar';
  const [open,  setOpen]  = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Download the .ics file from the API route
  const downloadICS = async () => {
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/deadlines/${deadline.id}/calendar`);
      if (!res.ok) throw new Error('Failed to generate calendar file');
      const blob     = await res.blob();
      const blobUrl  = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = blobUrl;
      a.download     = `wakeela-deadline.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  };

  // Open Google Calendar in a new tab (no download)
  const openGoogleCalendar = () => {
    const appUrl = window.location.origin;
    const url    = googleCalendarUrl(deadline, appUrl);
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const btnBase = variant === 'row'
    ? 'flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-[#1A3557] hover:border-[#1A3557]/40 hover:bg-[#1A3557]/5 transition whitespace-nowrap'
    : 'flex items-center gap-2 rounded-xl border border-[#1A3557]/20 bg-[#1A3557]/5 px-4 py-2.5 text-sm font-semibold text-[#1A3557] hover:bg-[#1A3557]/10 transition';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className={btnBase}
        title={isRTL ? 'إضافة إلى التقويم' : 'Add to Calendar'}
      >
        {loading
          ? <Loader2 className={cn('animate-spin', variant === 'row' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          : <CalendarPlus className={cn(variant === 'row' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        }
        {variant === 'row'
          ? (isRTL ? 'تقويم' : 'Calendar')
          : (isRTL ? 'إضافة إلى التقويم' : 'Add to Calendar')
        }
        <ChevronDown className={cn(
          'transition-transform duration-150',
          variant === 'row' ? 'h-3 w-3' : 'h-3.5 w-3.5',
          open && 'rotate-180'
        )} />
      </button>

      {open && (
        <div className={cn(
          'absolute z-30 mt-1 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden',
          isRTL ? 'left-0' : 'right-0'
        )}>
          {/* iOS / macOS / Outlook — downloads .ics */}
          <button
            type="button"
            onClick={downloadICS}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition"
          >
            <span className="text-base leading-none">📅</span>
            <div className="text-start">
              <p className="font-semibold text-xs">
                {isRTL ? 'تنزيل ملف .ics' : 'Download .ics file'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isRTL ? 'iOS · macOS · Outlook' : 'iOS · macOS · Outlook'}
              </p>
            </div>
          </button>

          <div className="border-t border-border" />

          {/* Google Calendar — opens web link */}
          <button
            type="button"
            onClick={openGoogleCalendar}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition"
          >
            <span className="text-base leading-none">🗓️</span>
            <div className="text-start">
              <p className="font-semibold text-xs">Google Calendar</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isRTL ? 'يفتح في المتصفح' : 'Opens in browser'}
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
