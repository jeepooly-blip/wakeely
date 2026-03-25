'use client';

import { useState, useCallback, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Plus, Calendar, List, RefreshCw } from 'lucide-react';
import { CalendarView } from './calendar-view';
import { DeadlineList, type DeadlineRowFull } from './deadline-list';
import { AddDeadlineModal } from './add-deadline-modal';

interface Case { id: string; title: string }

interface DeadlineTrackerProps {
  initialDeadlines: DeadlineRowFull[];
  cases:            Case[];
}

export function DeadlineTracker({ initialDeadlines, cases }: DeadlineTrackerProps) {
  const locale  = useLocale();
  const t       = useTranslations('tracker');
  const isRTL   = locale === 'ar';

  const [deadlines,     setDeadlines]     = useState<DeadlineRowFull[]>(initialDeadlines);
  const [view,          setView]          = useState<'calendar' | 'list'>('list');
  const [selectedDate,  setSelectedDate]  = useState<string>('');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editData,      setEditData]      = useState<(DeadlineRowFull & { id: string }) | undefined>();
  const [caseFilter,    setCaseFilter]    = useState<string>('all');
  const [refreshing,    setRefreshing]    = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/deadlines');
      if (res.ok) {
        const json = await res.json();
        // Normalize: add case_title from joined cases data
        const normalized: DeadlineRowFull[] = (json.data ?? []).map((d: Record<string, unknown>) => ({
          id:            d.id,
          title:         d.title,
          due_date:      d.due_date,
          type:          d.type,
          status:        d.status,
          reminder_days: d.reminder_days,
          case_id:       d.case_id,
          case_title:    (d.cases as { title?: string } | null)?.title ?? '',
        }));
        setDeadlines(normalized);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Filter by case
  const filteredDeadlines = caseFilter === 'all'
    ? deadlines
    : deadlines.filter((d) => d.case_id === caseFilter);

  // Stats
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const pending = filteredDeadlines.filter((d) => d.status === 'pending');
  const overdue = pending.filter((d) => new Date(d.due_date) < today);
  const upcoming7 = pending.filter((d) => {
    const days = Math.ceil((new Date(d.due_date).getTime() - today.getTime()) / 86_400_000);
    return days >= 0 && days <= 7;
  });

  const handleEdit = (dl: DeadlineRowFull) => {
    setEditData(dl);
    setModalOpen(true);
  };

  const handleAddNew = () => {
    setEditData(undefined);
    setModalOpen(true);
  };

  const handleDaySelect = (date: string) => {
    setSelectedDate(date === selectedDate ? '' : date);
    if (date) setView('list');
  };

  // Calendar needs due_date as date string
  const calendarDeadlines = filteredDeadlines.map((d) => ({
    id:         d.id,
    title:      d.title,
    due_date:   d.due_date,
    type:       d.type,
    status:     d.status,
    case_title: d.case_title,
  }));

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
          <button
            type="button"
            onClick={handleAddNew}
            className="flex items-center gap-2 rounded-xl bg-[#1A3557] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition shadow-sm"
          >
            <Plus className="h-4 w-4" />
            {t('addDeadline')}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label:  isRTL ? 'قادمة' : 'Pending',
            value:  pending.length,
            color:  'text-[#1A3557]',
            bg:     'bg-[#1A3557]/8 dark:bg-[#1A3557]/20',
          },
          {
            label:  isRTL ? 'خلال 7 أيام' : 'Next 7 days',
            value:  upcoming7.length,
            color:  'text-amber-600',
            bg:     'bg-amber-50 dark:bg-amber-900/20',
          },
          {
            label:  isRTL ? 'متأخرة' : 'Overdue',
            value:  overdue.length,
            color:  'text-red-600',
            bg:     'bg-red-50 dark:bg-red-900/20',
          },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center">
            <p className={cn('text-3xl font-black', color)}>{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Case filter + View toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Case filter */}
        <div className="flex-1 min-w-[160px]">
          <select
            value={caseFilter}
            onChange={(e) => { setCaseFilter(e.target.value); setSelectedDate(''); }}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition cursor-pointer"
          >
            <option value="all">{t('allCases')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        {/* View toggle */}
        <div className="flex rounded-xl border border-border bg-muted p-1 gap-1">
          {([
            { key: 'list',     icon: List,     label: t('listView')     },
            { key: 'calendar', icon: Calendar, label: t('calendarView') },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                view === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected date banner */}
      {selectedDate && (
        <div className="flex items-center justify-between rounded-xl border border-[#1A3557]/20 bg-[#1A3557]/5 dark:bg-[#1A3557]/10 px-4 py-2.5">
          <span className="text-sm font-medium text-[#1A3557]">
            {isRTL ? `عرض مواعيد:` : 'Showing deadlines for:'}{' '}
            <span className="font-bold">
              {new Date(selectedDate).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate('')}
            className="text-xs text-[#1A3557] hover:underline"
          >
            {isRTL ? 'عرض الكل' : 'Clear filter'}
          </button>
        </div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <CalendarView
          deadlines={calendarDeadlines}
          onSelectDay={handleDaySelect}
          selectedDate={selectedDate}
        />
      )}

      {/* List view */}
      <DeadlineList
        deadlines={filteredDeadlines}
        filterDate={selectedDate || undefined}
        onEdit={handleEdit}
        onRefresh={refresh}
      />

      {/* Add/Edit Modal */}
      <AddDeadlineModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditData(undefined); }}
        onSaved={refresh}
        cases={cases}
        editData={editData ? {
          id:            editData.id,
          case_id:       editData.case_id,
          title:         editData.title,
          due_date:      editData.due_date,
          type:          editData.type,
          reminder_days: editData.reminder_days,
        } : undefined}
      />
    </div>
  );
}
