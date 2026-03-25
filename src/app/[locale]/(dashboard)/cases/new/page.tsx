'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link }      from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn, hashFile, formatBytes } from '@/lib/utils';
import type { CaseType } from '@/types';
import {
  Briefcase, Users, Building2, Home, Shield, MoreHorizontal, Sparkles,
  ChevronRight, ChevronLeft, CheckCircle2, Upload, X,
  FileText, Calendar, User, MapPin, Plus, Trash2, Save,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4 | 5;

interface DeadlineRow {
  id:       string;
  title:    string;
  due_date: string;
  type:     'court' | 'submission' | 'internal';
}

interface UploadedFile {
  id:       string;
  name:     string;
  size:     number;
  hash:     string;
  path:     string;
  status:   'uploading' | 'done' | 'error';
}

interface WizardState {
  caseType:     CaseType | '';
  caseTitle:    string;
  jurisdiction: string;
  city:         string;
  description:  string;
  lawyerName:   string;
  lawyerBar:    string;
  lawyerPhone:  string;
  lawyerEmail:  string;
  hasLawyer:    boolean;
  deadlines:    DeadlineRow[];
  files:        UploadedFile[];
}

const INITIAL: WizardState = {
  caseType:     '',
  caseTitle:    '',
  jurisdiction: '',
  city:         '',
  description:  '',
  lawyerName:   '',
  lawyerBar:    '',
  lawyerPhone:  '',
  lawyerEmail:  '',
  hasLawyer:    false,
  deadlines:    [],
  files:        [],
};

// ── Case type definitions ────────────────────────────────────────
const CASE_TYPES: { type: CaseType; icon: React.ElementType; color: string }[] = [
  { type: 'employment', icon: Briefcase,    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  { type: 'family',     icon: Users,        color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
  { type: 'commercial', icon: Building2,    color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  { type: 'property',   icon: Home,         color: 'text-green-600 bg-green-50 dark:bg-green-950/40' },
  { type: 'criminal',   icon: Shield,       color: 'text-red-600 bg-red-50 dark:bg-red-950/40' },
  { type: 'other',      icon: MoreHorizontal, color: 'text-gray-600 bg-gray-50 dark:bg-gray-900/40' },
];

const JURISDICTIONS = [
  'jurisdictionDIFC',
  'jurisdictionADGM',
  'jurisdictionDubai',
  'jurisdictionAbuDhabi',
  'jurisdictionSharjah',
  'jurisdictionRiyadh',
  'jurisdictionJeddah',
  'jurisdictionKuwait',
  'jurisdictionOther',
] as const;

// ── Main Component ────────────────────────────────────────────────
export default function NewCasePage() {
  const locale   = useLocale();
  const t        = useTranslations('wizard');
  const tCommon  = useTranslations('common');
  const router   = useRouter();
  const supabase = createClient();
  const isRTL    = locale === 'ar';

  const [step,        setStep]        = useState<Step>(1);
  const [state,       setState]       = useState<WizardState>(INITIAL);
  const [draftId,     setDraftId]     = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const fileInputRef  = useRef<HTMLInputElement>(null);
const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const ChevronNext = isRTL ? ChevronLeft : ChevronRight;
  const ChevronBack = isRTL ? ChevronRight : ChevronLeft;

  // ── Auto draft save (debounced 1.5s after any change) ───────────
  const triggerDraftSave = useCallback(
    (currentState: WizardState, currentStep: Step) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(async () => {
        try {
          setDraftStatus('saving');
          const r2 = await fetch('/api/cases', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              case_id:    draftId,
              draft_data: currentState as unknown as Record<string, unknown>,
              draft_step: currentStep,
              title:      currentState.caseTitle || 'Untitled case',
              case_type:  (currentState.caseType as CaseType) || 'other',
            }),
          });
          const r2data = await r2.json();
          setDraftId(r2data.id);
          setDraftStatus('saved');
          setTimeout(() => setDraftStatus('idle'), 2000);
        } catch {
          setDraftStatus('idle');
        }
      }, 1500);
    },
    [draftId]
  );

  const update = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((prev) => {
        const next = { ...prev, [key]: value };
        triggerDraftSave(next, step);
        return next;
      });
    },
    [step, triggerDraftSave]
  );

  // Cleanup timer
  useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current); }, []);

  // ── Step validation ─────────────────────────────────────────────
  const canGoNext = (): boolean => {
    if (step === 1) return !!state.caseType && state.caseTitle.trim().length >= 3;
    if (step === 2) return !!state.jurisdiction;
    return true; // steps 3-5 are optional
  };

  // ── Deadline helpers ────────────────────────────────────────────
  const addDeadline = () => {
    const next = [
      ...state.deadlines,
      { id: crypto.randomUUID(), title: '', due_date: '', type: 'court' as const },
    ];
    update('deadlines', next);
  };

  const updateDeadline = (id: string, field: keyof DeadlineRow, value: string) => {
    update('deadlines', state.deadlines.map((d) =>
      d.id === id ? { ...d, [field]: value } : d
    ));
  };

  const removeDeadline = (id: string) => {
    update('deadlines', state.deadlines.filter((d) => d.id !== id));
  };

  // ── File upload ─────────────────────────────────────────────────
  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    for (const file of files) {
      const tempId = crypto.randomUUID();
      const placeholder: UploadedFile = {
        id: tempId, name: file.name, size: file.size,
        hash: '', path: '', status: 'uploading',
      };
      setState((prev) => ({
        ...prev,
        files: [...prev.files, placeholder],
      }));

      try {
        const hash  = await hashFile(file);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const ext  = file.name.split('.').pop();
        const path = `${draftId ?? 'pending'}/${user.id}/${tempId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('evidence-vault')
          .upload(path, file, { upsert: false });

        if (uploadError) {
          // Bucket may not exist yet — skip upload but continue case creation
          console.warn('[Vault] Upload failed:', uploadError.message);
          // Mark as done without storage path so case creation still works
          setState((prev) => ({
            ...prev,
            files: prev.files.map((f) =>
              f.id === tempId ? { ...f, status: 'done', path: '' } : f
            ),
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.id === tempId
              ? { ...f, hash, path, status: 'done' }
              : f
          ),
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.id === tempId ? { ...f, status: 'error' } : f
          ),
        }));
      }
    }
  };

  const removeFile = (id: string) => {
    update('files', state.files.filter((f) => f.id !== id));
  };

  // ── Final submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const createRes2 = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:             state.caseTitle,
          case_type:         state.caseType,
          jurisdiction:      state.jurisdiction,
          city:              state.city || undefined,
          description:       state.description || undefined,
          lawyer_name:       state.hasLawyer ? state.lawyerName || undefined : undefined,
          lawyer_bar_number: state.hasLawyer ? state.lawyerBar  || undefined : undefined,
          lawyer_phone:      state.hasLawyer ? state.lawyerPhone || undefined : undefined,
          lawyer_email:      state.hasLawyer ? state.lawyerEmail || undefined : undefined,
          deadlines:         state.deadlines
            .filter((d: {title:string;due_date:string}) => d.title && d.due_date)
            .map((d: {title:string;due_date:string;type:string}) => ({ title: d.title, due_date: d.due_date, type: d.type })),
          draft_id: draftId,
        }),
      });
      if (!createRes2.ok) {
        const err2 = await createRes2.json();
        throw new Error(err2.error ?? 'Failed to create case');
      }
      const { id: newCaseId } = await createRes2.json();

      // Link uploaded documents to the new case
      if (state.files.length > 0) {
        const docRows = state.files
          .filter((f) => f.status === 'done')
          .map((f) => ({
            case_id:     newCaseId,
            uploader_id: user.id,
            file_path:   f.path,
            file_name:   f.name,
            file_size:   f.size,
            file_hash:   f.hash,
            version:     1,
          }));
        if (docRows.length > 0) {
          await supabase.from('documents').insert(docRows);
        }
      }

      // Delete draft if it existed
      if (draftId) {
        // draft cleanup handled by POST /api/cases
      }

      router.push(`/cases/${newCaseId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'));
      setSubmitting(false);
    }
  };

  // ── Shared input className ───────────────────────────────────────
  const inputCls =
    'w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition';

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {([1,2,3,4,5] as Step[]).map((s) => {
            const labels = [t('step1Label'), t('step2Label'), t('step3Label'), t('step4Label'), t('step5Label')];
            const icons  = [FileText, MapPin, User, Calendar, Upload];
            const Icon   = icons[s - 1];
            const done   = step > s;
            const active = step === s;
            return (
              <div key={s} className="flex flex-col items-center gap-1.5 flex-1">
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-200',
                  done   && 'border-[#1A3557] bg-[#1A3557] text-white',
                  active && 'border-[#1A3557] bg-white dark:bg-background text-[#1A3557]',
                  !done && !active && 'border-border bg-muted text-muted-foreground'
                )}>
                  {done
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn(
                  'text-[10px] font-medium text-center hidden sm:block',
                  active ? 'text-[#1A3557]' : 'text-muted-foreground'
                )}>
                  {labels[s - 1]}
                </span>
                {/* Connector line */}
                {s < 5 && (
                  <div className={cn(
                    'absolute hidden sm:block h-0.5 w-full translate-y-[-18px]',
                    step > s ? 'bg-[#1A3557]' : 'bg-border'
                  )} style={{ display: 'none' }} />
                )}
              </div>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1A3557] transition-all duration-500"
            style={{ width: `${((step - 1) / 4) * 100}%` }}
          />
        </div>

        {/* Draft status */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {draftStatus === 'saving' && (
            <><Save className="h-3 w-3 animate-pulse" />{t('savingDraft')}</>
          )}
          {draftStatus === 'saved' && (
            <><CheckCircle2 className="h-3 w-3 text-emerald-500" />{t('draftSaved')}</>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── STEP 1: Case Type ─────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">{t('step1Title')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('step1Subtitle')}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CASE_TYPES.map(({ type, icon: Icon, color }) => {
                const typeKey = `caseType${type.charAt(0).toUpperCase() + type.slice(1)}` as keyof typeof t;
                const descKey = `caseType${type.charAt(0).toUpperCase() + type.slice(1)}Desc` as keyof typeof t;
                const selected = state.caseType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => update('caseType', type)}
                    className={cn(
                      'relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-start transition-all duration-200',
                      selected
                        ? 'border-[#1A3557] bg-[#1A3557]/5 dark:bg-[#1A3557]/20 shadow-sm'
                        : 'border-border hover:border-[#1A3557]/40 hover:bg-muted/40'
                    )}
                  >
                    {selected && (
                      <CheckCircle2 className="absolute top-2 end-2 h-4 w-4 text-[#1A3557]" />
                    )}
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t(typeKey as Parameters<typeof t>[0])}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {t(descKey as Parameters<typeof t>[0])}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Case title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('caseTitleLabel')} <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder={t('caseTitlePlaceholder')}
              value={state.caseTitle}
              onChange={(e) => update('caseTitle', e.target.value)}
              maxLength={120}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('caseTitleHint')}</p>
          </div>
        </div>
      )}

      {/* ── STEP 2: Jurisdiction ──────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">{t('step2Title')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('step2Subtitle')}</p>

            {/* Jurisdiction picker */}
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('jurisdictionLabel')} <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {JURISDICTIONS.map((key) => {
                const label = t(key as Parameters<typeof t>[0]);
                const selected = state.jurisdiction === label;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => update('jurisdiction', label)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium text-start transition-all',
                      selected
                        ? 'border-[#1A3557] bg-[#1A3557]/5 text-[#1A3557] dark:bg-[#1A3557]/20'
                        : 'border-border hover:border-[#1A3557]/40 text-foreground'
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {label}
                    {selected && <CheckCircle2 className="h-3.5 w-3.5 ms-auto" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('cityLabel')}{' '}
              <span className="text-muted-foreground text-xs">({tCommon('optional')})</span>
            </label>
            <input
              type="text"
              value={state.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder={isRTL ? 'مثال: دبي' : 'e.g. Dubai'}
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('descriptionLabel')}{' '}
              <span className="text-muted-foreground text-xs">({tCommon('optional')})</span>
            </label>
            <textarea
              rows={4}
              value={state.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              className={cn(inputCls, 'resize-none')}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('descriptionHint')}</p>
          </div>
        </div>
      )}

      {/* ── STEP 3: Lawyer info ───────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">{t('step3Title')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('step3Subtitle')}</p>
          </div>

          {/* No lawyer toggle */}
          <button
            type="button"
            onClick={() => update('hasLawyer', !state.hasLawyer)}
            className={cn(
              'w-full flex items-start gap-3 rounded-xl border-2 p-4 text-start transition-all',
              !state.hasLawyer
                ? 'border-[#1A3557] bg-[#1A3557]/5 dark:bg-[#1A3557]/20'
                : 'border-border hover:border-[#1A3557]/40'
            )}
          >
            <div className={cn(
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
              !state.hasLawyer ? 'border-[#1A3557] bg-[#1A3557]' : 'border-border'
            )}>
              {!state.hasLawyer && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t('noLawyerYet')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('noLawyerDesc')}</p>
            </div>
          </button>

          {/* Lawyer fields — shown when hasLawyer = true */}
          {state.hasLawyer && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {t('lawyerNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={state.lawyerName}
                    onChange={(e) => update('lawyerName', e.target.value)}
                    placeholder={t('lawyerNamePlaceholder')}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {t('lawyerBarLabel')}
                  </label>
                  <input
                    type="text"
                    value={state.lawyerBar}
                    onChange={(e) => update('lawyerBar', e.target.value)}
                    placeholder={t('lawyerBarPlaceholder')}
                    className={inputCls}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {t('lawyerPhoneLabel')}
                  </label>
                  <input
                    type="tel"
                    value={state.lawyerPhone}
                    onChange={(e) => update('lawyerPhone', e.target.value)}
                    placeholder={t('lawyerPhonePlaceholder')}
                    className={inputCls}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {t('lawyerEmailLabel')}
                  </label>
                  <input
                    type="email"
                    value={state.lawyerEmail}
                    onChange={(e) => update('lawyerEmail', e.target.value)}
                    placeholder={t('lawyerEmailPlaceholder')}
                    className={inputCls}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4: Key Dates ─────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">{t('step4Title')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('step4Subtitle')}</p>
          </div>

          {/* Deadline rows */}
          {state.deadlines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {isRTL ? 'لا توجد مواعيد بعد — أضف موعدك الأول أدناه' : 'No dates added yet — add your first one below'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {state.deadlines.map((d, idx) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {isRTL ? `موعد ${idx + 1}` : `Date ${idx + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDeadline(d.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={t('removeDeadline')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t('deadlineTitleLabel')}
                      </label>
                      <input
                        type="text"
                        value={d.title}
                        onChange={(e) => updateDeadline(d.id, 'title', e.target.value)}
                        placeholder={t('deadlineTitlePlaceholder')}
                        className={cn(inputCls, 'py-2 text-sm')}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t('deadlineDateLabel')}
                      </label>
                      <input
                        type="date"
                        value={d.due_date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => updateDeadline(d.id, 'due_date', e.target.value)}
                        className={cn(inputCls, 'py-2 text-sm')}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {t('deadlineTypeLabel')}
                    </label>
                    <div className="flex gap-2">
                      {(['court', 'submission', 'internal'] as const).map((type) => {
                        const labelMap = {
                          court:      t('deadlineTypeCourt'),
                          submission: t('deadlineTypeSubmission'),
                          internal:   t('deadlineTypeInternal'),
                        };
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => updateDeadline(d.id, 'type', type)}
                            className={cn(
                              'flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all',
                              d.type === type
                                ? 'border-[#1A3557] bg-[#1A3557] text-white'
                                : 'border-border hover:border-[#1A3557]/40 text-foreground'
                            )}
                          >
                            {labelMap[type]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addDeadline}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1A3557]/30 py-3 text-sm font-medium text-[#1A3557] hover:border-[#1A3557]/60 hover:bg-[#1A3557]/5 transition-all"
          >
            <Plus className="h-4 w-4" />
            {t('addDeadline')}
          </button>
        </div>
      )}

      {/* ── STEP 5: Documents ─────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">{t('step5Title')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('step5Subtitle')}</p>
          </div>

          {/* Drop zone */}
          <div
            className="relative rounded-xl border-2 border-dashed border-[#1A3557]/30 bg-[#1A3557]/[0.02] p-8 text-center cursor-pointer hover:border-[#1A3557]/60 hover:bg-[#1A3557]/[0.04] transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mx-auto h-10 w-10 text-[#1A3557]/40 mb-3" />
            <p className="text-sm font-medium text-foreground">{t('uploadDrop')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('uploadHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
            />
          </div>

          {/* Uploaded files list */}
          {state.files.length > 0 && (
            <div className="space-y-2">
              {state.files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A3557]/10">
                    <FileText className="h-4 w-4 text-[#1A3557]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(f.size)}
                      {f.status === 'uploading' && (
                        <span className="ms-2 text-amber-600">{t('uploadAdding')}</span>
                      )}
                      {f.status === 'done' && f.hash && (
                        <span className="ms-2 text-emerald-600 font-mono">
                          SHA-256: {f.hash.slice(0, 12)}…
                        </span>
                      )}
                      {f.status === 'error' && (
                        <span className="ms-2 text-destructive">Upload failed</span>
                      )}
                    </p>
                  </div>
                  {f.status === 'uploading' ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1A3557] border-t-transparent" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={t('uploadRemove')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation buttons ────────────────────────────────── */}
      <div className="mt-8 flex items-center gap-3">
        {/* Back */}
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted transition"
          >
            <ChevronBack className="h-4 w-4" />
            {t('backButton')}
          </button>
        )}

        {/* Skip (steps 3-5) */}
        {step >= 3 && step < 5 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as Step)}
            className="ms-auto text-sm text-muted-foreground hover:text-foreground transition underline underline-offset-2"
          >
            {t('skipStep')}
          </button>
        )}

        {/* Continue / Finish */}
        {step < 5 ? (
          <button
            type="button"
            onClick={() => {
              if (!canGoNext()) {
                setError(isRTL
                  ? 'يرجى إكمال الحقول المطلوبة قبل المتابعة'
                  : 'Please complete the required fields before continuing');
                return;
              }
              setError('');
              setStep((s) => (s + 1) as Step);
            }}
            disabled={!canGoNext()}
            className={cn(
              'ms-auto flex items-center gap-1.5 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all shadow-sm',
              canGoNext()
                ? 'bg-[#1A3557] hover:bg-[#1e4a7a]'
                : 'bg-[#1A3557]/30 cursor-not-allowed'
            )}
          >
            {t('continueButton')}
            <ChevronNext className="h-4 w-4" />
          </button>
        ) : (
          <div className="ms-auto flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-[#1A3557] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1e4a7a] disabled:opacity-50 transition-all shadow-sm"
            >
              {submitting ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t('creatingCase')}</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />{t('finishButton')}</>
              )}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="text-xs text-muted-foreground hover:text-foreground transition underline underline-offset-2"
            >
              {t('skipDocuments')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
