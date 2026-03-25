'use client';

import { useState, useCallback, useRef } from 'react';
import {
  FileText, Send, Download, Loader2, Check, Lock,
  Globe, ChevronDown, AlertCircle, RefreshCw,
  Scale, Building2, FileDown, Mail, X, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ESCALATION_TEMPLATES, COUNTRY_CONFIG, type CountryCode,
} from '@/lib/escalation-templates';
import type { EscalationTemplate, SubscriptionTier } from '@/types';
import { TIER_GATES } from '@/types';

interface EscalationToolkitProps {
  caseId:       string;
  caseTitle:    string;
  locale:       string;
  lawyerName?:  string;
  lawyerEmail?: string;
  userTier:     SubscriptionTier;
  // Pre-filled from case
  clientName?:  string;
  caseSummary?: string;
}

const COUNTRY_ORDER: CountryCode[] = ['uae', 'ksa', 'kuwait', 'other'];

/* ─── Country selector ──────────────────────────────────────────── */
function CountrySelector({
  value, onChange, isRTL,
}: { value: CountryCode; onChange: (c: CountryCode) => void; isRTL: boolean }) {
  const [open, setOpen] = useState(false);
  const cc = COUNTRY_CONFIG[value];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:border-[#1A3557]/40 transition w-full"
      >
        <Globe className="h-4 w-4 text-[#0E7490] shrink-0" />
        <span className="flex-1 text-start">{isRTL ? cc.nameAr : cc.nameEn}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 w-full z-20 rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-scale-in">
          {COUNTRY_ORDER.map((code) => {
            const cfg = COUNTRY_CONFIG[code];
            return (
              <button key={code} type="button"
                onClick={() => { onChange(code); setOpen(false); }}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 text-sm text-start hover:bg-muted/50 transition',
                  code === value && 'bg-[#1A3557]/5 text-[#1A3557] font-semibold'
                )}
              >
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-semibold">{isRTL ? cfg.nameAr : cfg.nameEn}</p>
                  <p className="text-[10px] text-muted-foreground">{isRTL ? cfg.barAr : cfg.barEn}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Template card ─────────────────────────────────────────────── */
function TemplateCard({
  template, selected, locked, onClick, isRTL,
}: {
  template: EscalationTemplate;
  selected: boolean;
  locked:   boolean;
  onClick:  () => void;
  isRTL:    boolean;
}) {
  return (
    <button type="button" onClick={locked ? undefined : onClick}
      className={cn(
        'relative rounded-2xl border p-5 text-start transition-all duration-200 w-full group',
        selected
          ? 'border-[#1A3557] bg-[#1A3557]/5 shadow-sm'
          : locked
          ? 'border-border bg-muted/30 opacity-60 cursor-not-allowed'
          : 'border-border bg-card hover:border-[#1A3557]/40 hover:shadow-md hover:-translate-y-0.5'
      )}>
      {locked && (
        <div className="absolute top-3 end-3 flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold">
          <Lock className="h-2.5 w-2.5" />
          Pro
        </div>
      )}
      {selected && (
        <div className="absolute top-3 end-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#1A3557] text-white">
          <Check className="h-3 w-3" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
          selected ? 'bg-[#1A3557] text-white' : 'bg-muted text-muted-foreground group-hover:bg-[#1A3557]/10 group-hover:text-[#1A3557]'
        )}>
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {isRTL ? template.titleAr : template.titleEn}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {isRTL ? template.descAr : template.descEn}
          </p>
        </div>
      </div>
    </button>
  );
}

/* ─── Main component ────────────────────────────────────────────── */
export function EscalationToolkit({
  caseId, caseTitle, locale, lawyerName, lawyerEmail,
  userTier, clientName, caseSummary,
}: EscalationToolkitProps) {
  const isRTL      = locale === 'ar';
  const canEscalate = TIER_GATES[userTier].escalation;

  const [country,     setCountry]     = useState<CountryCode>('uae');
  const [selected,    setSelected]    = useState<EscalationTemplate | null>(null);
  const [fields,      setFields]      = useState<Record<string, string>>({});
  const [preview,     setPreview]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [emailSent,   setEmailSent]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [error,       setError]       = useState('');
  const [activeTab,   setActiveTab]   = useState<'edit' | 'preview'>('edit');
  const previewRef = useRef<HTMLPreElement>(null);

  // Filter templates by country for MoJ-specific ones
  const visibleTemplates = ESCALATION_TEMPLATES.filter((t) => {
    if (t.key === 'moj_complaint_uae')    return country === 'uae';
    if (t.key === 'moj_complaint_ksa')    return country === 'ksa';
    if (t.key === 'moj_complaint_kuwait') return country === 'kuwait';
    return true; // generic templates always shown
  });

  const selectTemplate = (t: EscalationTemplate) => {
    setSelected(t);
    setPreview('');
    setEmailSent(false);
    setError('');
    setActiveTab('edit');
    // Pre-fill fields from case data
    const cc = COUNTRY_CONFIG[country];
    setFields({
      case_title:   caseTitle,
      lawyer_name:  lawyerName  ?? '',
      lawyer_email: lawyerEmail ?? '',
      client_name:  clientName  ?? '',
      request_date: new Date().toISOString().split('T')[0],
      // Country-specific
      court_name: isRTL ? cc.courtLabel_ar : cc.courtLabel_en,
    });
  };

  const setField = (key: string, val: string) =>
    setFields(prev => ({ ...prev, [key]: val }));

  const generate = useCallback(async (action: 'preview' | 'save' | 'send' | 'download_txt' | 'download_word') => {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/escalation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id:      caseId,
          template_key: selected.key,
          fields,
          action:       action === 'preview' ? 'save' : action === 'download_txt' || action === 'download_word' ? 'download' : action,
          country,
          language:     locale === 'ar' ? 'ar' : 'en',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === 'upgrade_required'
          ? (isRTL ? 'يتطلب هذا القالب ترقية إلى خطة Pro.' : 'This template requires a Pro plan.')
          : (data.error ?? 'Error'));
        return;
      }

      const letterBody: string = data.letter_body ?? '';
      setPreview(letterBody);

      if (action === 'preview' || action === 'save') {
        setActiveTab('preview');
      } else if (action === 'send') {
        setEmailSent(true);
        setActiveTab('preview');
      } else if (action === 'download_txt') {
        const blob = new Blob([letterBody], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `${selected.key}_${caseId.slice(0, 8)}.txt`);
      } else if (action === 'download_word') {
        // Word-compatible HTML
        const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:12pt;direction:${isRTL ? 'rtl' : 'ltr'};margin:2cm;}
pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12pt;}</style></head>
<body><pre>${letterBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`;
        const blob = new Blob([wordHtml], { type: 'application/msword' });
        downloadBlob(blob, `${selected.key}_${caseId.slice(0, 8)}.doc`);
      }
    } finally {
      setLoading(false);
    }
  }, [selected, fields, caseId, country, locale, isRTL]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const copyPreview = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const requiredFilled = selected
    ? selected.fields.filter(f => f.required).every(f => (fields[f.key] ?? '').trim())
    : false;

  const cc = COUNTRY_CONFIG[country];

  return (
    <div className="space-y-6">

      {/* Country selector */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {isRTL ? 'اختر الدولة / الجهة المختصة' : 'Select Country / Jurisdiction'}
        </p>
        <CountrySelector value={country} onChange={(c) => { setCountry(c); setSelected(null); setPreview(''); }} isRTL={isRTL} />
        {country !== 'other' && (
          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <Scale className="h-3 w-3" />
            {isRTL
              ? `الجهة المختصة: ${cc.barAr} — ${cc.barAddressAr}`
              : `Authority: ${cc.barEn} — ${cc.barAddressEn}`}
            {cc.barWebsite && (
              <a href={cc.barWebsite} target="_blank" rel="noopener" className="text-[#0E7490] hover:underline ms-1">
                {isRTL ? 'الموقع الرسمي ↗' : 'Official site ↗'}
              </a>
            )}
          </p>
        )}
      </div>

      {/* Template grid */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {isRTL ? 'اختر قالب الرسالة' : 'Choose a Letter Template'}
          <span className="ms-2 normal-case font-normal text-muted-foreground/70">
            ({visibleTemplates.length} {isRTL ? 'قوالب' : 'templates'})
          </span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleTemplates.map((t) => {
            const locked = t.tier === 'pro' && !canEscalate;
            return (
              <TemplateCard key={t.key} template={t}
                selected={selected?.key === t.key}
                locked={locked}
                onClick={() => selectTemplate(t)}
                isRTL={isRTL} />
            );
          })}
        </div>
        {!canEscalate && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-4 py-3">
            <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {isRTL ? 'بعض القوالب تتطلب خطة Pro' : 'Some templates require Pro plan'}
              </p>
              <a href={`/${locale}/billing`} className="text-[10px] text-[#1A3557] hover:underline font-medium">
                {isRTL ? 'ترقية للاستمتاع بجميع القوالب ←' : 'Upgrade to unlock all templates →'}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Field form */}
      {selected && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(['edit', 'preview'] as const).map((tab) => (
              <button key={tab} type="button"
                onClick={() => { if (tab === 'preview' && !preview) generate('preview'); else setActiveTab(tab); }}
                className={cn(
                  'flex-1 py-3 text-sm font-semibold transition',
                  activeTab === tab
                    ? 'bg-[#1A3557]/5 text-[#1A3557] border-b-2 border-[#1A3557]'
                    : 'text-muted-foreground hover:text-foreground'
                )}>
                {tab === 'edit'
                  ? (isRTL ? '✏️ تعبئة الحقول' : '✏️ Fill Fields')
                  : (isRTL ? '👁 معاينة الرسالة' : '👁 Preview Letter')}
              </button>
            ))}
          </div>

          {activeTab === 'edit' ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {isRTL ? selected.titleAr : selected.titleEn}
                </p>
                <button type="button" onClick={() => setSelected(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {selected.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {isRTL ? f.labelAr : f.labelEn}
                    {f.required && <span className="text-red-500 ms-0.5">*</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={fields[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      rows={3}
                      placeholder={isRTL ? f.placeholderAr : f.placeholderEn}
                      className="input-base resize-none"
                      dir={isRTL ? 'rtl' : 'ltr'}
                    />
                  ) : (
                    <input
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={fields[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={isRTL ? f.placeholderAr : f.placeholderEn}
                      className="input-base"
                      dir={f.type === 'date' || f.key.includes('email') || f.key.includes('phone') || f.key.includes('id') ? 'ltr' : isRTL ? 'rtl' : 'ltr'}
                    />
                  )}
                </div>
              ))}

              {error && (
                <div className="flex items-center gap-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <button type="button"
                onClick={() => generate('preview')}
                disabled={!requiredFilled || loading}
                className="btn-primary w-full py-3 disabled:opacity-40">
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />{isRTL ? 'جارٍ الإنشاء…' : 'Generating…'}</>
                  : <><FileText className="h-4 w-4" />{isRTL ? 'إنشاء الرسالة ومعاينتها' : 'Generate & Preview'}</>}
              </button>
            </div>
          ) : (
            /* Preview tab */
            <div className="p-5 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : preview ? (
                <>
                  {emailSent && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 px-4 py-3">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
                        {isRTL ? 'تم إرسال الرسالة بالبريد الإلكتروني بنجاح.' : 'Letter sent via email successfully.'}
                      </p>
                    </div>
                  )}

                  {/* Letter preview */}
                  <div className="relative rounded-xl border border-border bg-muted/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/50">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isRTL ? selected.titleAr : selected.titleEn}
                      </span>
                      <button type="button" onClick={copyPreview}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition hover:bg-muted"
                        title={isRTL ? 'نسخ النص' : 'Copy text'}>
                        {copied
                          ? <><Check className="h-3 w-3 text-emerald-600" /><span className="text-emerald-600">{isRTL ? 'تم النسخ' : 'Copied'}</span></>
                          : <><Copy className="h-3 w-3" />{isRTL ? 'نسخ' : 'Copy'}</>}
                      </button>
                    </div>
                    <pre ref={previewRef}
                      className="p-5 text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto no-scrollbar"
                      dir={isRTL ? 'rtl' : 'ltr'}>
                      {preview}
                    </pre>
                  </div>

                  {/* Action bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button type="button" onClick={() => generate('download_txt')} disabled={loading}
                      className="btn-secondary text-xs py-2.5 flex-col gap-1 h-auto">
                      <FileDown className="h-4 w-4" />
                      <span>TXT</span>
                    </button>
                    <button type="button" onClick={() => generate('download_word')} disabled={loading}
                      className="btn-secondary text-xs py-2.5 flex-col gap-1 h-auto">
                      <FileDown className="h-4 w-4 text-blue-600" />
                      <span>Word</span>
                    </button>
                    {fields.lawyer_email && (
                      <button type="button" onClick={() => generate('send')} disabled={loading || emailSent}
                        className={cn(
                          'btn-secondary text-xs py-2.5 flex-col gap-1 h-auto',
                          emailSent && 'border-emerald-200 dark:border-emerald-800 text-emerald-600'
                        )}>
                        {emailSent ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                        <span>{isRTL ? 'إرسال' : 'Email'}</span>
                      </button>
                    )}
                    <button type="button" onClick={() => generate('save')} disabled={loading}
                      className="btn-primary text-xs py-2.5 flex-col gap-1 h-auto">
                      <Check className="h-4 w-4" />
                      <span>{isRTL ? 'حفظ' : 'Save'}</span>
                    </button>
                  </div>

                  {/* WhatsApp share */}
                  <a href={`https://wa.me/?text=${encodeURIComponent(preview.slice(0, 1000) + '…')}`}
                    target="_blank" rel="noopener"
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
                    style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}>
                    💬 {isRTL ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}
                  </a>

                  <button type="button" onClick={() => { setActiveTab('edit'); setPreview(''); setEmailSent(false); }}
                    className="btn-ghost w-full text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5" />
                    {isRTL ? 'تعديل الحقول' : 'Edit fields'}
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center py-8 text-center gap-3">
                  <FileText className="h-10 w-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">
                    {isRTL ? 'أكمل الحقول واضغط "إنشاء الرسالة"' : 'Fill the fields and click "Generate"'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legal disclaimer */}
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed text-center">
        {isRTL
          ? 'هذه القوالب استرشادية لأغراض التوثيق فقط. وكيلا لا تقدم استشارات قانونية. استشر محاميك أو متخصصاً قانونياً قبل إرسال أي رسالة رسمية.'
          : 'These templates are for documentation purposes only. Wakeela does not provide legal advice. Consult a qualified legal professional before sending any formal correspondence.'}
      </p>
    </div>
  );
}
