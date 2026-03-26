'use client';

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw, Download, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Milestone { date: string; event: string; significance: string; }

interface SummaryJson {
  overview?:         string;
  milestones?:       Milestone[];
  pending_actions?:  string[];
  risks?:            string[];
  recommendations?:  string[];
}

interface CachedSummary {
  id:           string;
  case_id:      string;
  generated_at: string;
  language:     string;
  summary_json: SummaryJson;
}

interface AISummaryPanelProps {
  caseId:            string;
  locale:            string;
  subscriptionTier:  string;
  cachedSummary?:    CachedSummary | null;
}

export function AISummaryPanel({
  caseId, locale, subscriptionTier, cachedSummary: initial,
}: AISummaryPanelProps) {
  const isRTL    = locale === 'ar';
  const isPremium = subscriptionTier === 'premium';

  const [summary,    setSummary]    = useState<CachedSummary | null>(initial ?? null);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');
  const [expanded,   setExpanded]   = useState(!!initial);

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res  = await fetch(`/api/cases/${caseId}/summary?locale=${locale}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setSummary(data as CachedSummary);
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : (isRTL ? 'حدث خطأ' : 'Something went wrong'));
    } finally {
      setGenerating(false);
    }
  };

  const openPdfExport = () => {
    // Build a simple print page with the summary content
    if (!summary) return;
    const s = summary.summary_json;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="${isRTL ? 'ar' : 'en'}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head><meta charset="UTF-8"><title>AI Case Summary</title>
<style>body{font-family:${isRTL ? "'IBM Plex Arabic'" : "Inter"},Arial,sans-serif;max-width:640px;margin:32px auto;color:#111827;font-size:13px;line-height:1.6}
h1{color:#1A3557;font-size:18px;margin-bottom:4px}
h2{color:#1A3557;font-size:13px;font-weight:700;margin:18px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
ul{padding-${isRTL ? 'right' : 'left'}:18px}li{margin-bottom:4px}
.meta{font-size:10px;color:#6b7280;margin-bottom:20px}
.overview{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px}
.milestone{margin-bottom:8px;padding:6px 10px;background:#f8fafc;border-radius:6px}
.m-date{font-size:10px;color:#6b7280;font-weight:700}
.m-event{font-weight:600}
.m-sig{font-size:11px;color:#4b5563}
@media print{body{margin:16px auto}.no-print{display:none}}
</style></head><body>
<div class="no-print" style="background:#1A3557;color:#fff;padding:8px 16px;margin:-32px -100px 20px;display:flex;justify-content:space-between;align-items:center">
  <span style="font-weight:700;font-size:13px">WAKEELA · AI Case Summary</span>
  <button onclick="window.print()" style="background:#C89B3C;color:#fff;border:none;padding:6px 16px;border-radius:8px;font-weight:700;cursor:pointer">Print / Save PDF</button>
</div>
<h1>${isRTL ? 'ملخص القضية بالذكاء الاصطناعي' : 'AI Case Summary'}</h1>
<div class="meta">${isRTL ? 'صُدِّر' : 'Generated'}: ${new Date(summary.generated_at).toLocaleString(isRTL ? 'ar-AE' : 'en-AE')}</div>
${s.overview ? `<div class="overview">${s.overview}</div>` : ''}
${s.milestones?.length ? `<h2>${isRTL ? 'المعالم الرئيسية' : 'Key Milestones'}</h2>
${s.milestones.map((m) => `<div class="milestone"><div class="m-date">${m.date}</div><div class="m-event">${m.event}</div><div class="m-sig">${m.significance}</div></div>`).join('')}` : ''}
${s.pending_actions?.length ? `<h2>${isRTL ? 'الإجراءات المعلّقة' : 'Pending Actions'}</h2><ul>${s.pending_actions.map((a) => `<li>${a}</li>`).join('')}</ul>` : ''}
${s.risks?.length ? `<h2>${isRTL ? 'المخاطر' : 'Risks'}</h2><ul>${s.risks.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
${s.recommendations?.length ? `<h2>${isRTL ? 'التوصيات' : 'Recommendations'}</h2><ul>${s.recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
<div style="margin-top:24px;font-size:10px;color:#9ca3af">
  ${isRTL ? 'وكيلا هي أداة توثيق فحسب ولا تقدم استشارات قانونية.' : 'Wakeela is a documentation tool only and does not provide legal advice.'}
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const s = summary?.summary_json;

  return (
    <div className={cn(
      'rounded-2xl border bg-card overflow-hidden',
      isPremium ? 'border-[#C89B3C]/30' : 'border-border'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-5 py-4',
        isPremium ? 'bg-gradient-to-r from-[#C89B3C]/10 to-transparent' : 'bg-muted/30'
      )}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#C89B3C]" />
          <span className="text-sm font-bold text-foreground">
            {isRTL ? 'ملخص القضية بالذكاء الاصطناعي' : 'AI Case Summary'}
          </span>
          {!isPremium && (
            <span className="text-[10px] font-semibold bg-[#C89B3C] text-white px-2 py-0.5 rounded-full">
              Premium
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <>
              <button
                type="button"
                onClick={openPdfExport}
                title={isRTL ? 'تصدير PDF' : 'Export PDF'}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                title={isRTL ? 'تحديث الملخص' : 'Regenerate'}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition disabled:opacity-40"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', generating && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted transition"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Not premium — upgrade prompt */}
      {!isPremium && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            {isRTL
              ? 'ملخص القضية بالذكاء الاصطناعي متاح لمشتركي Premium فقط.'
              : 'AI Case Summary is available on Premium plan only.'}
          </p>
          <a
            href={`/${locale}/billing`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C89B3C] text-white px-5 py-2.5 text-sm font-bold hover:bg-[#b8892f] transition"
          >
            <Sparkles className="h-4 w-4" />
            {isRTL ? 'ترقية إلى Premium' : 'Upgrade to Premium'}
          </a>
        </div>
      )}

      {/* Premium — no summary yet */}
      {isPremium && !summary && !generating && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            {isRTL
              ? 'اضغط لتوليد ملخص شامل للقضية بناءً على الجدول الزمني وسجلات المحامي.'
              : 'Generate a structured case summary from the timeline, lawyer actions, and documents.'}
          </p>
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C89B3C] text-white px-5 py-2.5 text-sm font-bold hover:bg-[#b8892f] transition"
          >
            <Sparkles className="h-4 w-4" />
            {isRTL ? 'توليد الملخص' : 'Generate Summary'}
          </button>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="flex items-center justify-center gap-3 px-5 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-[#C89B3C]" />
          <span className="text-sm">
            {isRTL ? 'يُحلِّل وكيلا قضيتك…' : 'Wakeela is analysing your case…'}
          </span>
        </div>
      )}

      {/* Error */}
      {error && !generating && (
        <div className="flex items-center gap-2 px-5 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={generate}
            className="ms-auto text-xs font-semibold text-red-600 hover:underline"
          >
            {isRTL ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {/* Summary content */}
      {summary && expanded && s && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          {/* Generated at */}
          <p className="text-[10px] text-muted-foreground">
            {isRTL ? 'صُدِّر' : 'Generated'}:{' '}
            {new Date(summary.generated_at).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>

          {/* Overview */}
          {s.overview && (
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3">
              <p className="text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wide">
                {isRTL ? 'نظرة عامة' : 'Overview'}
              </p>
              <p className="text-sm text-foreground leading-relaxed">{s.overview}</p>
            </div>
          )}

          {/* Milestones */}
          {(s.milestones?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                {isRTL ? 'المعالم الرئيسية' : 'Key Milestones'}
              </p>
              <div className="space-y-2">
                {s.milestones!.map((m, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className="w-20 shrink-0">
                      <span className="text-[10px] font-bold text-[#1A3557]">{m.date}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{m.event}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{m.significance}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-column: pending actions + risks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(s.pending_actions?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                  {isRTL ? 'إجراءات معلّقة' : 'Pending Actions'}
                </p>
                <ul className="space-y-1.5">
                  {s.pending_actions!.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <span className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-bold">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(s.risks?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                  {isRTL ? 'المخاطر' : 'Risks'}
                </p>
                <ul className="space-y-1.5">
                  {s.risks!.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <span className="mt-0.5 text-red-500 shrink-0">⚠</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recommendations */}
          {(s.recommendations?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                {isRTL ? 'التوصيات' : 'Recommendations'}
              </p>
              <ul className="space-y-1.5">
                {s.recommendations!.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="mt-0.5 text-emerald-500 shrink-0">✓</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 border-t border-border pt-3">
            {isRTL
              ? 'هذا الملخص أُنشئ بالذكاء الاصطناعي للتوثيق فحسب ولا يُعدّ استشارة قانونية.'
              : 'This summary is AI-generated for documentation purposes only and does not constitute legal advice.'}
          </p>
        </div>
      )}
    </div>
  );
}
