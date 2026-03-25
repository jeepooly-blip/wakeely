'use client';

import { useState } from 'react';
import { ClipboardList, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionType } from '@/types';

interface ActionLogFormProps {
  caseId:   string;
  locale:   string;
  onSaved?: () => void;
}

const ACTION_TYPES: { value: ActionType; en: string; ar: string }[] = [
  { value: 'court_hearing',     en: 'Court Hearing',      ar: 'جلسة استماع' },
  { value: 'document_filed',    en: 'Document Filed',     ar: 'إيداع مستند' },
  { value: 'client_contacted',  en: 'Client Contacted',   ar: 'تواصل مع الموكّل' },
  { value: 'research',          en: 'Research',           ar: 'بحث قانوني' },
  { value: 'negotiation',       en: 'Negotiation',        ar: 'مفاوضات' },
  { value: 'correspondence',    en: 'Correspondence',     ar: 'مراسلة' },
  { value: 'other',             en: 'Other',              ar: 'أخرى' },
];

export function ActionLogForm({ caseId, locale, onSaved }: ActionLogFormProps) {
  const isRTL = locale === 'ar';
  const today = new Date().toISOString().split('T')[0];

  const [actionType, setActionType] = useState<ActionType>('court_hearing');
  const [description, setDesc]      = useState('');
  const [actionDate,  setDate]      = useState(today);
  const [loading,     setLoading]   = useState(false);
  const [saved,       setSaved]     = useState(false);
  const [error,       setError]     = useState('');

  const submit = async () => {
    if (!description.trim()) { setError(isRTL ? 'الوصف مطلوب' : 'Description required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/cases/${caseId}/action-logs`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_type: actionType, description: description.trim(), action_date: actionDate }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSaved(true);
      setDesc('');
      setActionType('court_hearing');
      setDate(today);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[#1A3557]" />
        {isRTL ? 'تسجيل إجراء جديد' : 'Log New Action'}
      </h3>

      <div className="space-y-3">
        {/* Action type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'نوع الإجراء' : 'Action Type'}
          </label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30"
          >
            {ACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {isRTL ? t.ar : t.en}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'تاريخ الإجراء' : 'Date of Action'}
          </label>
          <input
            type="date"
            value={actionDate}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30"
            dir="ltr"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'الوصف' : 'Description'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder={isRTL ? 'اكتب تفاصيل الإجراء…' : 'Describe what was done…'}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2">{error}</p>
        )}

        <button
          onClick={submit}
          disabled={loading || !description.trim()}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition',
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-[#1A3557] text-white hover:bg-[#1e4a7a] disabled:opacity-50'
          )}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{isRTL ? 'جارٍ الحفظ…' : 'Saving…'}</>
          ) : saved ? (
            <><Check className="h-4 w-4" />{isRTL ? 'تم الحفظ!' : 'Saved!'}</>
          ) : (
            <><ClipboardList className="h-4 w-4" />{isRTL ? 'تسجيل الإجراء' : 'Log Action'}</>
          )}
        </button>
      </div>
    </div>
  );
}
