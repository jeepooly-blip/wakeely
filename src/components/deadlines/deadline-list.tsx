'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatDateSmart } from '@/lib/utils';
import {
  Calendar, CheckCircle2, Circle, AlertTriangle,
  MoreVertical, Pencil, Trash2, Send, Clock,
  ChevronDown, Mail, MessageCircle,
} from 'lucide-react';
import { CalendarSyncButton } from '@/components/deadlines/calendar-sync-button';
import type { CalendarDeadline } from '@/lib/calendar';

export interface DeadlineRowFull {
  id:           string;
  title:        string;
  due_date:     string;
  type:         'court' | 'submission' | 'internal';
  status:       'pending' | 'completed' | 'missed';
  reminder_days: number[];
  case_id:      string;
  case_title:   string;
}

interface DeadlineListProps {
  deadlines:       DeadlineRowFull[];
  filterDate?:     string;
  onEdit:          (dl: DeadlineRowFull) => void;
  onRefresh:       () => void;
  hijriCalendar?:  boolean;
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'missed';

export function DeadlineList({ deadlines, filterDate, onEdit, onRefresh, hijriCalendar = false }: DeadlineListProps) {
  const locale  = useLocale();
  const t       = useTranslations('tracker');
  const isRTL   = locale === 'ar';

  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [actionId,     setActionId]       = useState<string | null>(null);
  const [remindingId,  setRemindingId]    = useState<string | null>(null);
  const [deletingId,   setDeletingId]     = useState<string | null>(null);
  const [confirmId,    setConfirmId]      = useState<string | null>(null);
  const [reminderFeedback, setReminderFeedback] = useState<Record<string, 'sent' | 'error'>>({});

  const today  = new Date();
  today.setHours(0, 0, 0, 0);

  const daysUntil = (ds: string) => {
    const d = new Date(ds);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
  };

  const fmtDate = (ds: string, isCourt = false) =>
    formatDateSmart(ds, locale, hijriCalendar, isCourt);

  // Apply filters
  let filtered = deadlines;
  if (filterDate) {
    filtered = filtered.filter((d) => d.due_date.startsWith(filterDate));
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter((d) => d.status === statusFilter);
  }

  // Sort: pending first by due_date, then completed, then missed
  filtered = [...filtered].sort((a, b) => {
    const order = { pending: 0, missed: 1, completed: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const handleComplete = async (id: string) => {
    await fetch(`/api/deadlines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    });
    onRefresh();
    setActionId(null);
  };

  const handleReopen = async (id: string) => {
    await fetch(`/api/deadlines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reopen' }),
    });
    onRefresh();
    setActionId(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await fetch(`/api/deadlines/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    setConfirmId(null);
    setActionId(null);
    onRefresh();
  };

  const handleRemind = async (id: string) => {
    setRemindingId(id);
    try {
      const res = await fetch(`/api/deadlines/${id}/remind`, { method: 'POST' });
      if (res.ok) {
        setReminderFeedback((f) => ({ ...f, [id]: 'sent' }));
        setTimeout(() => setReminderFeedback((f) => { const n = { ...f }; delete n[id]; return n; }), 3000);
      } else {
        setReminderFeedback((f) => ({ ...f, [id]: 'error' }));
      }
    } catch {
      setReminderFeedback((f) => ({ ...f, [id]: 'error' }));
    } finally {
      setRemindingId(null);
      setActionId(null);
    }
  };

  const typeLabel: Record<string, string> = {
    court:      isRTL ? 'جلسة' : 'Court',
    submission: isRTL ? 'تقديم' : 'Submission',
    internal:   isRTL ? 'تذكير' : 'Reminder',
  };

  const typeColor: Record<string, string> = {
    court:      'bg-[#1A3557]/10 text-[#1A3557] dark:bg-[#1A3557]/30',
    submission: 'bg-[#0E7490]/10 text-[#0E7490] dark:bg-[#0E7490]/30',
    internal:   'bg-[#C89B3C]/10 text-[#C89B3C] dark:bg-[#C89B3C]/30',
  };

  const statusCounts = {
    all:       deadlines.length,
    pending:   deadlines.filter((d) => d.status === 'pending').length,
    completed: deadlines.filter((d) => d.status === 'completed').length,
    missed:    deadlines.filter((d) => d.status === 'missed').length,
  };

  return (
    <div className="space-y-4">

      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {(['all', 'pending', 'completed', 'missed'] as StatusFilter[]).map((f) => {
          const labels: Record<StatusFilter, string> = {
            all:       t('filterAll'),
            pending:   t('filterPending'),
            completed: t('filterCompleted'),
            missed:    t('filterMissed'),
          };
          return (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                statusFilter === f
                  ? 'bg-[#1A3557] text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {labels[f]}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                statusFilter === f ? 'bg-white/20' : 'bg-background'
              )}>
                {statusCounts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="font-semibold text-foreground">{t('noDeadlines')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('noDeadlinesDesc')}</p>
        </div>
      )}

      {/* Deadline rows */}
      <div className="space-y-2">
        {filtered.map((dl) => {
          const days    = daysUntil(dl.due_date);
          const isPast  = days < 0;
          const isToday = days === 0;
          const isSoon  = days > 0 && days <= 3;
          const isOpen  = actionId === dl.id;

          const urgency = dl.status === 'completed'
            ? 'completed'
            : dl.status === 'missed' || (isPast && dl.status === 'pending')
            ? 'missed'
            : isToday ? 'today'
            : isSoon  ? 'soon'
            : 'normal';

          const urgencyConfig = {
            completed: { border: 'border-border',          icon: 'text-emerald-600', bg: '',                           days: null },
            missed:    { border: 'border-red-200 dark:border-red-900/40', icon: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/10', days: 'text-red-600' },
            today:     { border: 'border-amber-300 dark:border-amber-900/40', icon: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/10', days: 'text-amber-600' },
            soon:      { border: 'border-orange-200 dark:border-orange-900/40', icon: 'text-orange-500', bg: '', days: 'text-orange-600' },
            normal:    { border: 'border-border',           icon: 'text-[#1A3557]',  bg: '',                            days: 'text-muted-foreground' },
          }[urgency];

          const daysLabel = dl.status === 'completed'
            ? (isRTL ? 'مكتمل' : 'Completed')
            : dl.status === 'missed'
            ? (isRTL ? 'فائت' : 'Missed')
            : isToday ? t('dueToday')
            : days === 1 ? t('dueTomorrow')
            : days > 1
            ? t('daysLeft', { n: days })
            : t('daysOverdue', { n: Math.abs(days) });

          const feedback = reminderFeedback[dl.id];

          return (
            <div
              key={dl.id}
              className={cn(
                'relative rounded-2xl border bg-card p-4 transition-all',
                urgencyConfig.border,
                urgencyConfig.bg
              )}
            >
              <div className="flex items-start gap-3">

                {/* Complete toggle */}
                <button
                  type="button"
                  onClick={() => dl.status === 'completed' ? handleReopen(dl.id) : handleComplete(dl.id)}
                  className={cn(
                    'mt-0.5 shrink-0 transition-colors',
                    dl.status === 'completed'
                      ? 'text-emerald-500 hover:text-emerald-600'
                      : 'text-muted-foreground/30 hover:text-[#1A3557]'
                  )}
                  title={dl.status === 'completed' ? t('markPending') : t('markComplete')}
                >
                  {dl.status === 'completed'
                    ? <CheckCircle2 className="h-5 w-5" />
                    : <Circle className="h-5 w-5" />}
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className={cn(
                      'font-semibold text-foreground leading-snug',
                      dl.status === 'completed' && 'line-through text-muted-foreground'
                    )}>
                      {dl.title}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-xs font-bold', urgencyConfig.days ?? '')}>
                        {daysLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', typeColor[dl.type])}>
                      {typeLabel[dl.type]}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmtDate(dl.due_date, dl.type === 'court')}
                    </span>
                    <span className="truncate max-w-[150px]">
                      {dl.case_title}
                    </span>
                  </div>

                  {/* Reminder badges */}
                  {dl.reminder_days.length > 0 && dl.status === 'pending' && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Mail className="h-3 w-3 text-muted-foreground/50" />
                      <div className="flex gap-1">
                        {dl.reminder_days.sort((a, b) => b - a).map((d) => (
                          <span key={d} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {d === 0 ? (isRTL ? 'يوم الموعد' : 'Day of') : isRTL ? `${d}ي` : `${d}d`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reminder sent feedback */}
                  {feedback && (
                    <p className={cn(
                      'mt-1.5 text-xs font-medium',
                      feedback === 'sent' ? 'text-emerald-600' : 'text-destructive'
                    )}>
                      {feedback === 'sent'
                        ? (isRTL ? '✓ تم إرسال التذكير' : '✓ Reminder sent')
                        : (isRTL ? '✗ فشل الإرسال' : '✗ Send failed')}
                    </p>
                  )}
                </div>

                {/* Actions dropdown */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setActionId(isOpen ? null : dl.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    aria-label="Actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {isOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setActionId(null)}
                        aria-hidden
                      />
                      <div className={cn(
                        'absolute z-20 mt-1 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden',
                        isRTL ? 'left-0' : 'right-0'
                      )}>
                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => { onEdit(dl); setActionId(null); }}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {isRTL ? 'تعديل' : 'Edit'}
                        </button>

                        {/* Send reminder (pending only) */}
                        {dl.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleRemind(dl.id)}
                            disabled={remindingId === dl.id}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition disabled:opacity-50"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {remindingId === dl.id
                              ? (isRTL ? 'جارٍ الإرسال…' : 'Sending…')
                              : (isRTL ? 'إرسال تذكير' : 'Send reminder')}
                          </button>
                        )}

                        {/* Add to Calendar (pending only) */}
                        {dl.status === 'pending' && (
                          <div className="px-3 py-1.5">
                            <CalendarSyncButton
                              deadline={{
                                id:         dl.id,
                                title:      dl.title,
                                due_date:   dl.due_date,
                                type:       dl.type,
                                case_id:    dl.case_id,
                                case_title: dl.case_title,
                              } satisfies CalendarDeadline}
                              locale={locale}
                              variant="row"
                            />
                          </div>
                        )}

                        {/* Complete / reopen */}
                        <button
                          type="button"
                          onClick={() => dl.status === 'completed' ? handleReopen(dl.id) : handleComplete(dl.id)}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition"
                        >
                          {dl.status === 'completed'
                            ? <><Clock className="h-3.5 w-3.5" />{isRTL ? 'إعادة فتح' : 'Reopen'}</>
                            : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{isRTL ? 'تحديد كمكتمل' : 'Mark complete'}</>}
                        </button>

                        <div className="border-t border-border" />

                        {/* Delete */}
                        {confirmId === dl.id ? (
                          <div className="px-4 py-2.5 space-y-2">
                            <p className="text-xs font-medium text-destructive">{t('confirmDelete')}</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleDelete(dl.id)}
                                disabled={deletingId === dl.id}
                                className="flex-1 rounded-lg bg-destructive py-1 text-xs font-semibold text-white hover:bg-destructive/90 disabled:opacity-50"
                              >
                                {deletingId === dl.id ? '…' : (isRTL ? 'نعم' : 'Yes')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setConfirmId(null); setActionId(null); }}
                                className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold"
                              >
                                {isRTL ? 'لا' : 'No'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmId(dl.id)}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isRTL ? 'حذف' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
