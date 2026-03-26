'use client';

import { useState } from 'react';
import { cn }       from '@/lib/utils';
import {
  FileText, Download, CheckCircle2, Clock, AlertTriangle,
  CreditCard, Loader2, ExternalLink, Receipt, Hash,
} from 'lucide-react';
import type { Invoice } from '@/types';

interface InvoicePortalViewProps {
  invoice:       Invoice;
  currentUserId: string;
  isLawyer:      boolean;
  locale:        string;
  appUrl:        string;
}

export function InvoicePortalView({
  invoice, currentUserId, isLawyer, locale, appUrl,
}: InvoicePortalViewProps) {
  const isRTL = locale === 'ar';

  const [payMethod, setPayMethod]   = useState<'bank_transfer' | 'card'>('bank_transfer');
  const [payRef,    setPayRef]       = useState('');
  const [paying,    setPaying]       = useState(false);
  const [payError,  setPayError]     = useState('');
  const [paid,      setPaid]         = useState(invoice.status === 'paid');

  const fmt    = (n: number) => n.toLocaleString('en-JO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isRTL ? 'ar-JO' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const statusConfig = {
    draft:     { color: 'bg-gray-100 text-gray-600',         label: isRTL ? 'مسودة'             : 'Draft'     },
    sent:      { color: 'bg-blue-100 text-[#1A3557]',        label: isRTL ? 'مُرسَلة'           : 'Sent'      },
    viewed:    { color: 'bg-teal-100 text-[#0E7490]',        label: isRTL ? 'تمت مشاهدتها'      : 'Viewed'    },
    paid:      { color: 'bg-emerald-100 text-emerald-700',   label: isRTL ? 'مدفوعة'            : 'Paid'      },
    overdue:   { color: 'bg-red-100 text-red-700',           label: isRTL ? 'متأخرة'            : 'Overdue'   },
    cancelled: { color: 'bg-gray-100 text-gray-500',         label: isRTL ? 'ملغاة'             : 'Cancelled' },
  }[invoice.status] ?? { color: 'bg-gray-100 text-gray-600', label: invoice.status };

  const services      = (invoice.items ?? []).filter((i) => i.item_type === 'professional_service');
  const disbursements = (invoice.items ?? []).filter((i) => i.item_type === 'disbursement');

  const lawyer = invoice.lawyer as { full_name: string; email: string; phone?: string } | undefined;
  const client = invoice.client as { full_name: string; email: string; phone?: string } | undefined;
  const caseRow = invoice.case   as { title: string; case_type: string; jurisdiction?: string } | undefined;

  const handlePay = async () => {
    if (!payRef.trim() && payMethod === 'bank_transfer') {
      setPayError(isRTL ? 'أدخل رقم الحوالة أو المرجع' : 'Enter payment reference / transfer number');
      return;
    }
    setPaying(true);
    setPayError('');
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pay`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payment_method: payMethod, payment_reference: payRef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Payment failed');
      setPaid(true);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30 transition';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Invoice header card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-5 w-5 text-[#1A3557]" />
              <span className="text-xl font-black text-foreground" dir="ltr">{invoice.invoice_number}</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', statusConfig.color)}>
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{invoice.matter_description}</p>
          </div>

          {/* PDF download */}
          <a
            href={`/api/invoices/${invoice.id}/pdf?locale=${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </a>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: isRTL ? 'التاريخ' : 'Invoice Date', value: fmtDate(invoice.invoice_date) },
            { label: isRTL ? 'الاستحقاق' : 'Due Date', value: fmtDate(invoice.due_date), highlight: invoice.status === 'overdue' },
            { label: isRTL ? 'من' : 'From', value: lawyer?.full_name ?? '—' },
            { label: isRTL ? 'إلى' : 'To', value: client?.full_name ?? '—' },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="rounded-xl bg-muted/50 border border-border px-3 py-2.5">
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{label}</p>
              <p className={cn('text-sm font-semibold truncate', highlight ? 'text-red-600' : 'text-foreground')}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {invoice.jofotara_ref && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">🇯🇴 JoFotara Ref:</span>
            <span className="text-xs font-mono text-blue-700 dark:text-blue-300">{invoice.jofotara_ref}</span>
          </div>
        )}
      </div>

      {/* Line items */}
      {services.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {isRTL ? 'الخدمات المهنية' : 'Professional Services'}
            </h2>
          </div>
          <div className="divide-y divide-border">
            {services.map((item, i) => (
              <div key={item.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-muted/20 transition">
                <span className="text-xs font-bold text-muted-foreground/50 w-5 shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                    {new Date(item.item_date).toLocaleDateString('en-GB')}
                    {item.hours ? ` · ${item.hours}h × ${fmt(item.rate ?? 0)} ${invoice.currency}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-[#1A3557] shrink-0" dir="ltr">
                  {fmt(item.amount)} {invoice.currency}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-muted/30 flex justify-between text-sm font-semibold">
            <span className="text-muted-foreground">{isRTL ? 'إجمالي الخدمات' : 'Subtotal Services'}</span>
            <span className="text-[#1A3557]" dir="ltr">{fmt(invoice.subtotal_services)} {invoice.currency}</span>
          </div>
        </div>
      )}

      {disbursements.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {isRTL ? 'المصروفات القابلة للاسترداد' : 'Disbursements & Expenses'}
            </h2>
          </div>
          <div className="divide-y divide-border">
            {disbursements.map((item, i) => (
              <div key={item.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-muted/20 transition">
                <span className="text-xs font-bold text-muted-foreground/50 w-5 shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {new Date(item.item_date).toLocaleDateString('en-GB')}
                    </span>
                    {(item.receipts?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                        <Receipt className="h-2.5 w-2.5" />
                        {isRTL ? `${item.receipts!.length} إيصال` : `${item.receipts!.length} receipt${item.receipts!.length > 1 ? 's' : ''} attached`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        {isRTL ? 'بدون إيصال' : 'No receipt attached'}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-[#0E7490] shrink-0" dir="ltr">
                  {fmt(item.amount)} {invoice.currency}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-muted/30 flex justify-between text-sm font-semibold">
            <span className="text-muted-foreground">{isRTL ? 'إجمالي المصروفات' : 'Subtotal Disbursements'}</span>
            <span className="text-[#0E7490]" dir="ltr">{fmt(invoice.subtotal_disbursements)} {invoice.currency}</span>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/5 p-5">
        <div className="space-y-2">
          {[
            { label: isRTL ? 'المجموع قبل الضريبة' : 'Subtotal', value: invoice.subtotal_services + invoice.subtotal_disbursements },
            { label: isRTL ? `ضريبة المبيعات (${invoice.tax_rate}%)` : `Sales Tax (${invoice.tax_rate}%)`, value: invoice.tax_amount },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm text-muted-foreground">
              <span>{label}</span>
              <span dir="ltr">{fmt(value)} {invoice.currency}</span>
            </div>
          ))}
          {invoice.retainer_applied > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 font-semibold">
              <span>{isRTL ? 'السلفة المطبّقة' : 'Retainer Applied'}</span>
              <span dir="ltr">−{fmt(invoice.retainer_applied)} {invoice.currency}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-black text-[#1A3557] pt-2 border-t border-[#1A3557]/20">
            <span>{isRTL ? 'الإجمالي المستحق' : 'TOTAL DUE'}</span>
            <span dir="ltr">{fmt(invoice.total_amount)} {invoice.currency}</span>
          </div>
        </div>
      </div>

      {/* Payment section — only for non-paid, non-cancelled invoices */}
      {!paid && !['cancelled', 'draft'].includes(invoice.status) && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#1A3557]" />
            {isRTL ? 'الدفع' : 'Payment'}
          </h2>

          {/* Payment method tabs */}
          <div className="flex gap-2">
            {[
              { value: 'bank_transfer', label: isRTL ? 'تحويل بنكي' : 'Bank Transfer' },
              { value: 'card',          label: isRTL ? 'بطاقة'       : 'Card'          },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPayMethod(value as 'bank_transfer' | 'card')}
                className={cn(
                  'flex-1 rounded-xl border py-2.5 text-sm font-semibold transition',
                  payMethod === value
                    ? 'border-[#1A3557] bg-[#1A3557] text-white'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {payMethod === 'bank_transfer' && (
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">{isRTL ? 'بيانات التحويل:' : 'Bank Transfer Details:'}</p>
              <p className="text-xs text-muted-foreground font-mono" dir="ltr">IBAN: JO12BANK000000000000000</p>
              <p className="text-xs text-muted-foreground">{isRTL ? `المرجع: ${invoice.invoice_number}` : `Reference: ${invoice.invoice_number}`}</p>
            </div>
          )}

          {payMethod === 'card' && (
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground text-center">
              {isRTL ? 'الدفع بالبطاقة قريباً عبر HyperPay / Stripe' : 'Card payment coming soon via HyperPay / Stripe'}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {isRTL ? 'رقم الحوالة / المرجع *' : 'Transfer Reference / Transaction ID *'}
            </label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder={isRTL ? 'مثال: BMJOB123456789' : 'e.g. BMJOB123456789'}
              className={inputCls}
              dir="ltr"
            />
          </div>

          {payError && (
            <p className="text-xs text-red-600 dark:text-red-400">{payError}</p>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={paying}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C89B3C] text-white py-3 text-sm font-bold hover:bg-[#b8892f] transition disabled:opacity-60"
          >
            {paying
              ? <><Loader2 className="h-4 w-4 animate-spin" />{isRTL ? 'جارٍ المعالجة…' : 'Processing…'}</>
              : <><CheckCircle2 className="h-4 w-4" />{isRTL ? `تأكيد الدفع — ${fmt(invoice.total_amount)} ${invoice.currency}` : `Confirm Payment — ${fmt(invoice.total_amount)} ${invoice.currency}`}</>
            }
          </button>
          <p className="text-[10px] text-muted-foreground/60 text-center">
            {isRTL ? 'بالضغط على "تأكيد الدفع" أنت تُقر بإرسال المبلغ المطلوب. سيُخطَر محاميك فور التأكيد.' : 'By confirming, you acknowledge sending the due amount. Your lawyer will be notified immediately.'}
          </p>
        </div>
      )}

      {/* Paid confirmation */}
      {paid && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 flex items-center gap-4">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              {isRTL ? 'تم تسجيل الدفع بنجاح' : 'Payment recorded successfully'}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
              {isRTL ? 'تم إخطار محاميك. ستظهر هذه الفاتورة في سجل القضية.' : 'Your lawyer has been notified. This invoice will appear in the case history.'}
            </p>
          </div>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-4">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
            {isRTL ? 'ملاحظات:' : 'Notes:'}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{invoice.notes}</p>
        </div>
      )}

      {/* Legal disclaimer */}
      <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
        {isRTL
          ? 'وكيلا هي أداة توثيق فحسب ولا تقدم استشارات قانونية. هذه الفاتورة صادرة من المحامي مباشرة.'
          : 'Wakeela is a documentation tool only. This invoice is issued by the lawyer, not by Wakeela.'}
      </p>
    </div>
  );
}
