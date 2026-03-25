'use client';

import {
  useState, useCallback, useRef, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, FileText, Loader2, CheckCircle2, AlertTriangle,
  Calendar, Users, Shield, ChevronRight, ChevronLeft,
  Edit3, Trash2, Zap, X, Plus, Eye,
} from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import type { AIAnalysisResult } from '@/app/api/ai/analyze-document/route';

/* ─── Types ─────────────────────────────────────────────────────── */
interface DocFile { file: File; id: string; }

type Step = 'upload' | 'analyzing' | 'results' | 'confirm' | 'creating' | 'done';

interface DocUploaderProps {
  locale:    string;
  onComplete?: (caseId: string) => void;
}

/* ─── Risk badge ─────────────────────────────────────────────────── */
function RiskBadge({ risk, isRTL }: { risk: string; isRTL: boolean }) {
  const cfg = {
    high:   { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',    label_en: 'High Risk',    label_ar: 'خطر عالٍ'   },
    medium: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label_en: 'Medium Risk', label_ar: 'خطر متوسط' },
    low:    { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label_en: 'Low Risk', label_ar: 'خطر منخفض' },
  }[risk] ?? { cls: 'bg-muted text-muted-foreground', label_en: 'Unknown', label_ar: 'غير محدد' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', cfg.cls)}>
      <Shield className="h-3 w-3" />
      {isRTL ? cfg.label_ar : cfg.label_en}
    </span>
  );
}

/* ─── Urgency badge ─────────────────────────────────────────────── */
function UrgencyBadge({ urgency, isRTL }: { urgency: string; isRTL: boolean }) {
  const cfg = {
    immediate: { cls: 'bg-red-100 text-red-700',      icon: '🚨', en: 'Immediate', ar: 'عاجل'   },
    soon:      { cls: 'bg-amber-100 text-amber-700',   icon: '⚠️', en: 'Soon',      ar: 'قريباً' },
    later:     { cls: 'bg-blue-100 text-blue-700',     icon: '📌', en: 'Later',     ar: 'لاحقاً' },
  }[urgency] ?? { cls: 'bg-muted text-muted-foreground', icon: '•', en: urgency, ar: urgency };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', cfg.cls)}>
      <span>{cfg.icon}</span>{isRTL ? cfg.ar : cfg.en}
    </span>
  );
}

/* ─── File drop zone ─────────────────────────────────────────────── */
function DropZone({ files, onAdd, onRemove, isRTL, disabled }: {
  files: DocFile[]; onAdd: (f: File[]) => void;
  onRemove: (id: string) => void; isRTL: boolean; disabled: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    onAdd(Array.from(e.dataTransfer.files));
  }, [onAdd]);

  return (
    <div className="space-y-3">
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200',
          dragOver
            ? 'border-[#1A3557] bg-[#1A3557]/5 scale-[1.01]'
            : 'border-border bg-muted/30 hover:border-[#1A3557]/50 hover:bg-[#1A3557]/3',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1A3557]/10">
          <Upload className="h-7 w-7 text-[#1A3557]" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">
            {isRTL ? 'اسحب الملفات هنا أو اضغط للاختيار' : 'Drag & drop or click to select'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isRTL ? 'PDF، صور، Word — حتى 10 ميجابايت لكل ملف' : 'PDF, images, Word — up to 10MB each'}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => e.target.files && onAdd(Array.from(e.target.files))}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(({ file, id }) => (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1A3557]/8 text-lg">
                {file.type.includes('pdf') ? '📄' : file.type.includes('image') ? '🖼️' : '📝'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {!disabled && (
                <button onClick={() => onRemove(id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Analysis results display ──────────────────────────────────── */
function AnalysisResults({
  result, isRTL, editableTitle, onTitleChange, analysisId,
}: {
  result: AIAnalysisResult & { analysis_id?: string };
  isRTL: boolean;
  editableTitle: string;
  onTitleChange: (v: string) => void;
  analysisId: string | null;
}) {
  const caseTypeLabel: Record<string, { en: string; ar: string }> = {
    employment: { en: 'Employment', ar: 'عمل'              },
    family:     { en: 'Family',     ar: 'أحوال شخصية'      },
    commercial: { en: 'Commercial', ar: 'تجاري'             },
    property:   { en: 'Property',   ar: 'عقاري'             },
    criminal:   { en: 'Criminal',   ar: 'جنائي'             },
    other:      { en: 'Other',      ar: 'أخرى'              },
  };
  const typeLabel = caseTypeLabel[result.case_type] ?? caseTypeLabel.other;

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Summary card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#1A3557]" />
            <span className="text-sm font-bold">{isRTL ? 'ملخص الوثيقة' : 'Document Summary'}</span>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge risk={result.risk_score} isRTL={isRTL} />
            <span className="text-[10px] rounded-full bg-[#0E7490]/10 text-[#0E7490] px-2 py-0.5 font-semibold">
              {isRTL ? typeLabel.ar : typeLabel.en}
            </span>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {/* Editable title */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              {isRTL ? 'عنوان القضية (قابل للتعديل)' : 'Case title (editable)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                value={editableTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                dir={isRTL ? 'rtl' : 'ltr'}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A3557]/20 transition"
              />
              <Edit3 className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </div>
          {/* Summary */}
          <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
          {/* Language indicator */}
          <p className="text-[10px] text-muted-foreground/60">
            {isRTL ? 'اللغة المكتشفة: ' : 'Detected language: '}
            <span className="font-semibold">
              {result.detected_lang === 'ar' ? (isRTL ? 'عربي' : 'Arabic')
               : result.detected_lang === 'mixed' ? (isRTL ? 'مختلط' : 'Mixed')
               : (isRTL ? 'إنجليزي' : 'English')}
            </span>
          </p>
        </div>
      </div>

      {/* Key dates */}
      {result.key_dates?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
            <Calendar className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold">{isRTL ? 'المواعيد الرئيسية' : 'Key Dates'}</span>
            <span className="ms-auto text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
              {isRTL ? 'ستُضاف تلقائياً' : 'Auto-added'}
            </span>
          </div>
          <div className="divide-y divide-border">
            {result.key_dates.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm">
                  {d.type === 'court' ? '⚖️' : d.type === 'payment' ? '💳' : '📅'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{d.label}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{d.type}</p>
                </div>
                <span className="text-xs font-mono font-bold text-foreground" dir="ltr">{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parties */}
      {result.parties?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
            <Users className="h-4 w-4 text-[#1A3557]" />
            <span className="text-sm font-bold">{isRTL ? 'الأطراف المعنية' : 'Parties Involved'}</span>
          </div>
          <div className="flex flex-wrap gap-2 p-5">
            {result.parties.map((p, i) => (
              <div key={i} className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{p.role}</p>
                <p className="text-xs font-bold text-foreground mt-0.5">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {result.risks?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-bold">{isRTL ? 'المخاطر المحتملة' : 'Identified Risks'}</span>
          </div>
          <div className="divide-y divide-border">
            {result.risks.map((r, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className={cn(
                  'mt-0.5 h-2 w-2 rounded-full shrink-0',
                  r.severity === 'high' ? 'bg-red-500' : r.severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                )} />
                <p className="text-xs text-foreground leading-relaxed">{r.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      {result.next_actions?.length > 0 && (
        <div className="rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/5 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1A3557]/15">
            <Zap className="h-4 w-4 text-[#1A3557]" />
            <span className="text-sm font-bold text-[#1A3557] dark:text-blue-300">
              {isRTL ? 'الإجراءات المقترحة' : 'Suggested Next Actions'}
            </span>
          </div>
          <div className="divide-y divide-[#1A3557]/10">
            {result.next_actions.map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className="text-[#1A3557] font-black text-sm shrink-0">{i + 1}.</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground leading-relaxed">{a.action}</p>
                </div>
                <UrgencyBadge urgency={a.urgency} isRTL={isRTL} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function DocUploadAnalyzer({ locale, onComplete }: DocUploaderProps) {
  const isRTL  = locale === 'ar';
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [step,          setStep]         = useState<Step>('upload');
  const [files,         setFiles]        = useState<DocFile[]>([]);
  const [result,        setResult]       = useState<(AIAnalysisResult & { analysis_id?: string }) | null>(null);
  const [analysisId,    setAnalysisId]   = useState<string | null>(null);
  const [editableTitle, setEditableTitle] = useState('');
  const [error,         setError]        = useState('');
  const [progress,      setProgress]     = useState(0);
  const Chev = isRTL ? ChevronLeft : ChevronRight;

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(f => f.size <= 10 * 1024 * 1024);
    setFiles(prev => [
      ...prev,
      ...valid.map(f => ({ file: f, id: crypto.randomUUID() })),
    ].slice(0, 5)); // max 5 files
    setError('');
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const analyze = async () => {
    if (!files.length) return;
    setStep('analyzing');
    setError('');

    // Fake progress animation
    const timer = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 400);

    try {
      const fd = new FormData();
      files.forEach(({ file }) => fd.append('files', file));

      const res  = await fetch('/api/ai/analyze-document', { method: 'POST', body: fd });
      clearInterval(timer);
      setProgress(100);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Analysis failed');
      }

      const data = await res.json();
      setResult(data);
      setAnalysisId(data.analysis_id ?? null);
      setEditableTitle(data.case_title ?? '');
      setTimeout(() => setStep('results'), 300);
    } catch (e) {
      clearInterval(timer);
      setProgress(0);
      setError(e instanceof Error ? e.message : (isRTL ? 'حدث خطأ في التحليل' : 'Analysis failed'));
      setStep('upload');
    }
  };

  const confirmAndCreate = async () => {
    if (!result) return;
    setStep('creating');

    try {
      // 1. Create the case via API
      const caseRes = await fetch('/api/cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       editableTitle || result.case_title,
          case_type:   result.case_type,
          description: result.summary,
          deadlines:   result.key_dates
            .filter(d => d.date && d.date !== 'Unknown' && !isNaN(Date.parse(d.date)))
            .map(d => ({ title: d.label, due_date: d.date, type: d.type === 'court' ? 'court' : 'submission' })),
        }),
      });

      if (!caseRes.ok) throw new Error('Case creation failed');
      const { id: caseId } = await caseRes.json();

      // 2. Link analysis to case
      if (analysisId) {
        await fetch('/api/ai/analyze-document', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis_id: analysisId, case_id: caseId }),
        }).catch(() => {});
      }

      // 3. Mark onboarding complete
      await fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});

      setStep('done');
      onComplete?.(caseId);

      setTimeout(() => {
        startTransition(() => router.push(`/${locale}/cases/${caseId}?from=doc_ai`));
      }, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : (isRTL ? 'فشل إنشاء القضية' : 'Case creation failed'));
      setStep('results');
    }
  };

  /* ─── Step: upload ─── */
  if (step === 'upload') return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <DropZone files={files} onAdd={addFiles} onRemove={removeFile} isRTL={isRTL} disabled={false} />

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <button onClick={analyze} disabled={!files.length}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1A3557] to-[#0E7490] py-3.5 text-sm font-bold text-white disabled:opacity-40 hover:-translate-y-0.5 transition-all shadow-md">
        <Zap className="h-4 w-4" />
        {isRTL ? 'تحليل المستند بالذكاء الاصطناعي' : 'Analyze with AI'}
        <Chev className="h-4 w-4" />
      </button>

      <p className="text-center text-[10px] text-muted-foreground/60">
        {isRTL
          ? 'وكيلا لا تقدم استشارات قانونية. التحليل للأغراض التوثيقية فقط.'
          : 'Wakeela does not provide legal advice. Analysis is for documentation purposes only.'}
      </p>
    </div>
  );

  /* ─── Step: analyzing ─── */
  if (step === 'analyzing') return (
    <div className="flex flex-col items-center gap-6 py-10" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1A3557] to-[#0E7490] shadow-xl">
        <Loader2 className="h-9 w-9 text-white animate-spin" />
        <div className="absolute inset-0 rounded-2xl ring-4 ring-[#1A3557]/20 animate-ping" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-foreground">
          {isRTL ? 'جارٍ تحليل المستند…' : 'Analyzing your document…'}
        </p>
        <p className="text-sm text-muted-foreground">
          {isRTL ? 'استخراج المواعيد والمخاطر والأطراف' : 'Extracting dates, risks, and parties'}
        </p>
      </div>
      <div className="w-full max-w-xs">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#1A3557] to-[#0E7490] transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">{progress}%</p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {[
          { icon: '📄', label_en: 'Reading', label_ar: 'قراءة' },
          { icon: '🧠', label_en: 'Analyzing', label_ar: 'تحليل' },
          { icon: '📋', label_en: 'Extracting', label_ar: 'استخراج' },
        ].map((s, i) => (
          <div key={i} className={cn(
            'flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-all',
            progress > i * 30 ? 'bg-[#1A3557]/10' : 'bg-muted/30'
          )}>
            <span className="text-lg">{s.icon}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {isRTL ? s.label_ar : s.label_en}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  /* ─── Step: results ─── */
  if (step === 'results' && result) return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Success banner */}
      <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            {isRTL ? 'تم تحليل المستند بنجاح!' : 'Document analyzed successfully!'}
          </p>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-500">
            {isRTL
              ? `تم اكتشاف ${result.key_dates?.length ?? 0} مواعيد و${result.risks?.length ?? 0} مخاطر`
              : `Found ${result.key_dates?.length ?? 0} dates and ${result.risks?.length ?? 0} risks`}
          </p>
        </div>
      </div>

      <AnalysisResults
        result={result}
        isRTL={isRTL}
        editableTitle={editableTitle}
        onTitleChange={setEditableTitle}
        analysisId={analysisId}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Confirm / Edit actions */}
      <div className="rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/5 p-5 space-y-3">
        <p className="text-sm font-bold text-[#1A3557] dark:text-blue-300">
          {isRTL ? 'هل هذه المعلومات صحيحة؟' : 'Does this look correct?'}
        </p>
        <p className="text-xs text-muted-foreground">
          {isRTL
            ? 'سيتم إنشاء القضية تلقائياً مع إضافة جميع المواعيد والتنبيهات.'
            : 'The case will be created automatically with all dates and alerts added.'}
        </p>
        <div className="flex gap-2">
          <button onClick={confirmAndCreate}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C89B3C] to-[#E8B84B] py-3 text-sm font-black text-[#1A3557] hover:-translate-y-0.5 transition-all shadow-md">
            <CheckCircle2 className="h-4 w-4" />
            {isRTL ? 'تأكيد وإنشاء القضية' : 'Confirm & Create Case'}
          </button>
          <button onClick={() => setStep('upload')}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition">
            <Edit3 className="h-4 w-4" />
            {isRTL ? 'تعديل' : 'Edit'}
          </button>
        </div>
      </div>
    </div>
  );

  /* ─── Step: creating ─── */
  if (step === 'creating') return (
    <div className="flex flex-col items-center gap-4 py-10" dir={isRTL ? 'rtl' : 'ltr'}>
      <Loader2 className="h-10 w-10 text-[#1A3557] animate-spin" />
      <p className="text-base font-bold text-foreground">
        {isRTL ? 'جارٍ إنشاء القضية…' : 'Creating your case…'}
      </p>
      <p className="text-sm text-muted-foreground text-center">
        {isRTL ? 'يتم إضافة المواعيد والجدول الزمني تلقائياً' : 'Adding deadlines and timeline automatically'}
      </p>
    </div>
  );

  /* ─── Step: done ─── */
  if (step === 'done') return (
    <div className="flex flex-col items-center gap-4 py-10 text-center" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <div>
        <p className="text-lg font-black text-foreground">
          {isRTL ? 'تم إنشاء القضية بنجاح ✅' : 'Case created successfully ✅'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {isRTL ? 'يمكنك الآن متابعة كل التحديثات.' : 'You can now see all updates here.'}
        </p>
      </div>
    </div>
  );

  return null;
}
