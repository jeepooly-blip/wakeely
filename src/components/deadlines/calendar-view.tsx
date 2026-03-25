'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DeadlineRow {
  id:       string;
  title:    string;
  due_date: string;
  type:     string;
  status:   string;
  case_title: string;
}

interface CalendarViewProps {
  deadlines:     DeadlineRow[];
  onSelectDay:   (date: string) => void;
  selectedDate?: string;
}

const TYPE_COLORS: Record<string, string> = {
  court:      'bg-[#1A3557]',
  submission: 'bg-[#0E7490]',
  internal:   'bg-[#C89B3C]',
};

export function CalendarView({ deadlines, onSelectDay, selectedDate }: CalendarViewProps) {
  const locale  = useLocale();
  const isRTL   = locale === 'ar';
  const today   = new Date();

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const DAYS_EN   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAYS_AR   = ['أحد','اثن','ثلا','أرب','خمس','جمع','سبت'];

  const months = isRTL ? MONTHS_AR : MONTHS_EN;
  const days   = isRTL ? DAYS_AR   : DAYS_EN;

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // First day of month (0=Sun…6=Sat)
  const firstDay = new Date(year, month, 1).getDay();
  // Days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  // Build a map: dateStr → deadlines[]
  const dlMap = new Map<string, DeadlineRow[]>();
  for (const dl of deadlines) {
    const key = dl.due_date.split('T')[0];
    if (!dlMap.has(key)) dlMap.set(key, []);
    dlMap.get(key)!.push(dl);
  }

  const todayStr = today.toISOString().split('T')[0];

  // Build grid: 6 rows × 7 cols
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const fmtCellDate = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <button
          onClick={isRTL ? nextMonth : prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
          aria-label={isRTL ? 'الشهر التالي' : 'Previous month'}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-foreground">
            {months[month]} {year}
          </span>
          {(viewDate.getMonth() !== today.getMonth() || viewDate.getFullYear() !== today.getFullYear()) && (
            <button
              onClick={goToToday}
              className="rounded-full bg-[#1A3557]/10 px-2.5 py-0.5 text-xs font-medium text-[#1A3557] hover:bg-[#1A3557]/20 transition"
            >
              {isRTL ? 'اليوم' : 'Today'}
            </button>
          )}
        </div>

        <button
          onClick={isRTL ? prevMonth : nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
          aria-label={isRTL ? 'الشهر السابق' : 'Next month'}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-border">
        {days.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="min-h-[72px] border-b border-e border-border/40 bg-muted/20" />;
          }

          const dateStr  = fmtCellDate(day);
          const isToday  = dateStr === todayStr;
          const selected = dateStr === selectedDate;
          const cellDLs  = dlMap.get(dateStr) ?? [];
          const hasDLs   = cellDLs.length > 0;
          const isPast   = new Date(dateStr) < today && !isToday;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(hasDLs ? dateStr : '')}
              className={cn(
                'relative min-h-[72px] p-1.5 text-start border-b border-e border-border/40 transition-colors',
                selected ? 'bg-[#1A3557]/8 dark:bg-[#1A3557]/20' : 'hover:bg-muted/50',
                hasDLs && 'cursor-pointer',
                !hasDLs && 'cursor-default'
              )}
            >
              {/* Day number */}
              <span className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1',
                isToday
                  ? 'bg-[#1A3557] text-white font-bold'
                  : isPast
                  ? 'text-muted-foreground/50'
                  : 'text-foreground'
              )}>
                {isRTL ? day.toLocaleString('ar-SA') : day}
              </span>

              {/* Deadline dots / pills */}
              <div className="flex flex-col gap-0.5">
                {cellDLs.slice(0, 3).map((dl) => (
                  <div
                    key={dl.id}
                    className={cn(
                      'w-full truncate rounded px-1 py-0.5 text-[9px] font-medium text-white leading-tight',
                      dl.status === 'completed'
                        ? 'bg-emerald-500/70'
                        : dl.status === 'missed'
                        ? 'bg-red-400/70'
                        : TYPE_COLORS[dl.type] ?? 'bg-[#1A3557]'
                    )}
                  >
                    {dl.title}
                  </div>
                ))}
                {cellDLs.length > 3 && (
                  <span className="text-[9px] text-muted-foreground ps-1">
                    +{cellDLs.length - 3}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-3 border-t border-border bg-muted/20">
        {[
          { color: 'bg-[#1A3557]',   label: isRTL ? 'جلسة' : 'Court' },
          { color: 'bg-[#0E7490]',   label: isRTL ? 'تقديم' : 'Submission' },
          { color: 'bg-[#C89B3C]',   label: isRTL ? 'تذكير' : 'Reminder' },
          { color: 'bg-emerald-500', label: isRTL ? 'مكتمل' : 'Done' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-sm', color)} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
