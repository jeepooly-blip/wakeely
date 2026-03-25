'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { X, Calendar, CheckSquare, Square, Mail, MessageCircle, AlertTriangle } from 'lucide-react';

interface Case { id: string; title: string }

interface DeadlineFormData {
  case_id:      string;
  title:        string;
  due_date:     string;
  type:         'court' | 'submission' | 'internal';
  reminder_days: number[];
  notify_email: boolean;
  notify_wa:    boolean;
}

interface AddDeadlineModalProps {
  open:       boolean;
  onClose:    () => void;
  onSaved:    () => void;
  cases:      Case[];
  editData?:  { id: string } & Partial<DeadlineFormData>;
  defaultCaseId?: string;
}

const REMINDER_OPTIONS = [
  { days: 7, labelKey: 'remind7' },
  { days: 3, labelKey: 'remind3' },
  { days: 1, labelKey: 'remind1' },
  { days: 0, labelKey: 'remind0' },
] as const;

export function AddDeadlineModal({
  open, onClose, onSaved, cases, editData, defaultCaseId,
}: AddDeadlineModalProps) {
  const t       = useTranslations('tracker');
  const tForm   = useTranslations('tracker.addForm');
  const locale  = useLocale();
  const isRTL   = locale === 'ar';

  const [form, setForm] = useState<DeadlineFormData>({
    case_id:       defaultCaseId ?? cases[0]?.id ?? '',
    title:         '',
    due_date:      '',
    type:          'court',
    reminder_days: [7, 3, 1],
    notify_email:  true,
    notify_wa:     false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Populate form when editing
  useEffect(() => {
    if (editData) {
      setForm((f) => ({
        ...f,
        case_id:       editData.case_id      ?? f.case_id,
        title:         editData.title        ?? '',
        due_date:      editData.due_date
          ? editData.due_date.split('T')[0]
          : '',
        type:          editData.type         ?? 'court',
        reminder_days: editData.reminder_days ?? [7, 3, 1],
        notify_email:  editData.notify_email  ?? true,
        notify_wa:     editData.notify_wa     ?? false,
      }));
    } else {
      setForm((f) => ({
        ...f,
        case_id:  defaultCaseId ?? cases[0]?.id ?? '',
        title:    '',
        due_date: '',
        type:     'court',
        reminder_days: [7, 3, 1],
        notify_email: true,
        notify_wa:    false,
      }));
    }
    setError('');
  }, [editData, open, defaultCaseId, cases]);

  if (!open) return null;

  const update = <K extends keyof DeadlineFormData>(k: K, v: DeadlineFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleReminderDay = (day: number) => {
    setForm((f) => ({
      ...f,
      reminder_days: f.reminder_days.includes(day)
        ? f.reminder_days.filter((d) => d !== day)
        : [...f.reminder_days, day].sort((a, b) => b - a),
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.due_date || !form.case_id) {
      setError(isRTL
        ? 'يرجى ملء الحقول المطلوبة: العنوان، التاريخ، والقضية'
        : 'Please fill in: title, date, and case');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url    = editData ? `/api/deadlines/${editData.id}` : '/api/deadlines';
      const method = editData ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id:      form.case_id,
          title:        form.title.trim(),
          due_date:     form.due_date,
          type:         form.type,
          reminder_days: form.reminder_days,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Save failed');
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={editData ? t('editDeadline') : t('addDeadline')}
      >
        <div className="w-full max-w-lg rounded-2xl bg-background border border-border shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-base font-bold text-foreground">
              {editData ? t('editDeadline') : t('addDeadline')}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Case selector */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {tForm('caseLabel')} <span className="text-destructive">*</span>
              </label>
              <select
                value={form.case_id}
                onChange={(e) => update('case_id', e.target.value)}
                className={cn(inputCls, 'cursor-pointer')}
              >
                {cases.length === 0 ? (
                  <option value="">{isRTL ? 'لا توجد قضايا' : 'No cases found'}</option>
                ) : (
                  cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))
                )}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {tForm('title')} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder={tForm('titlePlaceholder')}
                maxLength={120}
                className={inputCls}
              />
            </div>

            {/* Date + Type row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {tForm('dateLabel')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={form.due_date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => update('due_date', e.target.value)}
                  className={cn(inputCls, 'cursor-pointer')}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {tForm('typeLabel')}
                </label>
                <div className="flex flex-col gap-1.5">
                  {(['court', 'submission', 'internal'] as const).map((tp) => {
                    const labels = {
                      court:      tForm('typeCourt'),
                      submission: tForm('typeSubmission'),
                      internal:   tForm('typeInternal'),
                    };
                    return (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => update('type', tp)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium text-start transition-all',
                          form.type === tp
                            ? 'border-[#1A3557] bg-[#1A3557] text-white'
                            : 'border-border hover:border-[#1A3557]/40 text-foreground'
                        )}
                      >
                        {labels[tp]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Reminder days */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {tForm('remindersLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {REMINDER_OPTIONS.map(({ days, labelKey }) => {
                  const active = form.reminder_days.includes(days);
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => toggleReminderDay(days)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all',
                        active
                          ? 'border-[#1A3557] bg-[#1A3557]/5 dark:bg-[#1A3557]/20 text-[#1A3557]'
                          : 'border-border text-muted-foreground hover:border-[#1A3557]/30'
                      )}
                    >
                      {active
                        ? <CheckSquare className="h-4 w-4 shrink-0" />
                        : <Square className="h-4 w-4 shrink-0" />}
                      {tForm(labelKey as Parameters<typeof tForm>[0])}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notification channels */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isRTL ? 'قنوات الإشعارات' : 'Notification channels'}
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => update('notify_email', !form.notify_email)}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    form.notify_email
                      ? 'border-[#1A3557] bg-[#1A3557]/5 text-[#1A3557] dark:bg-[#1A3557]/20'
                      : 'border-border text-muted-foreground'
                  )}
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  {tForm('channelEmail')}
                </button>
                <button
                  type="button"
                  onClick={() => update('notify_wa', !form.notify_wa)}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    form.notify_wa
                      ? 'border-green-600 bg-green-50 text-green-700 dark:bg-green-950/30'
                      : 'border-border text-muted-foreground'
                  )}
                >
                  <MessageCircle className="h-4 w-4 shrink-0" />
                  {tForm('channelWhatsApp')}
                </button>
              </div>
              {form.notify_wa && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {tForm('channelNote')}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-muted/30">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition"
            >
              {tForm('cancelButton')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[#1A3557] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] disabled:opacity-50 transition shadow-sm"
            >
              {saving
                ? tForm('saving')
                : tForm('saveButton')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
