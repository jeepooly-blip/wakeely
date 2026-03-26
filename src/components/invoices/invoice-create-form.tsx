'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, Save, Send, FileText, Receipt,
  DollarSign, Clock, ChevronDown, ChevronUp, Loader2, ArrowLeft, ArrowRight,
} from 'lucide-react';

interface Props {
  caseId:    string;
  caseTitle: string;
  clientName: string;
}

interface LineItem {
  _id:         string;
  item_type:   'professional_service' | 'disbursement';
  item_date:   string;
  description: string;
  hours:       string;
  rate:        string;
  quantity:    string;
  unit_cost:   string;
  // receipt file (client-side only, uploaded separately)
  receiptFile?: File;
  receiptName?: string;
}

function makeItem(type: 'professional_service' | 'disbursement'): LineItem {
  return {
    _id:         crypto.randomUUID(),
    item_type:   type,
    item_date:   new Date().toISOString().split('T')[0],
    description: '',
    hours:        '',
    rate:         '',
    quantity:     '1',
    unit_cost:    '',
  };
}

function calcAmount(item: LineItem): number {
  if (item.item_type === 'professional_service') {
    return (parseFloat(item.hours) || 0) * (parseFloat(item.rate) || 0);
  }
  return (parseFloat(item.quantity) || 1) * (parseFloat(item.unit_cost) || 0);
}

export function InvoiceCreateForm({ caseId, caseTitle, clientName }: Props) {
  const locale = useLocale();
  const isRTL  = locale === 'ar';
  const router = useRouter();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const today   = new Date().toISOString().split('T')[0];
  const default30 = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];

  const [matterDesc,      setMatterDesc]      = useState('');
  const [invoiceDate,     setInvoiceDate]      = useState(today);
  const [dueDate,         setDueDate]          = useState(default30);
  const [taxId,           setTaxId]            = useState('');
  const [taxRate,         setTaxRate]          = useState('16');
  const [currency,        setCurrency]         = useState('JOD');
  const [retainerApplied, setRetainerApplied]  = useState('0');
  const [retainerBalance, setRetainerBalance]  = useState('0');
  const [notes,           setNotes]            = useState('');
  const [items,           setItems]            = useState<LineItem[]>([makeItem('professional_service')]);
  const [saving,          setSaving]           = useState(false);
  const [sending,         setSending]          = useState(false);
  const [error,           setError]            = useState('');
  const [expandedId,      setExpandedId]       = useState<string | null>(null);

  const inputCls = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30 transition';

  // Totals
  const subtotalServices      = items.filter((i) => i.item_type === 'professional_service').reduce((s, i) => s + calcAmount(i), 0);
  const subtotalDisbursements = items.filter((i) => i.item_type === 'disbursement').reduce((s, i) => s + calcAmount(i), 0);
  const taxAmt                = (subtotalServices + subtotalDisbursements) * (parseFloat(taxRate) / 100);
  const totalDue              = subtotalServices + subtotalDisbursements + taxAmt - (parseFloat(retainerApplied) || 0);

  const fmt = (n: number) => n.toLocaleString('en-JO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const updateItem = useCallback((id: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((i) => i._id === id ? { ...i, ...patch } : i));
  }, []);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i._id !== id));

  const handleReceiptFile = (id: string, file: File) => {
    updateItem(id, { receiptFile: file, receiptName: file.name });
  };

  const buildPayload = () => ({
    case_id:            caseId,
    matter_description: matterDesc,
    invoice_date:       invoiceDate,
    due_date:           dueDate,
    tax_id:             taxId || undefined,
    tax_rate:           parseFloat(taxRate) || 16,
    currency,
    retainer_applied:   parseFloat(retainerApplied) || 0,
    retainer_balance:   parseFloat(retainerBalance) || 0,
    notes:              notes || undefined,
    items: items.map((item, idx) => ({
      item_type:   item.item_type,
      item_date:   item.item_date,
      description: item.description,
      hours:       item.item_type === 'professional_service' ? (parseFloat(item.hours) || undefined) : undefined,
      rate:        item.item_type === 'professional_service' ? (parseFloat(item.rate) || undefined) : undefined,
      quantity:    parseFloat(item.quantity) || 1,
      unit_cost:   parseFloat(item.unit_cost) || 0,
      sort_order:  idx,
    })),
  });

  const validate = (): string | null => {
    if (!matterDesc.trim()) return isRTL ? 'أدخل وصف القضية' : 'Enter matter description';
    if (items.length === 0) return isRTL ? 'أضف بنداً واحداً على الأقل' : 'Add at least one line item';
    for (const item of items) {
      if (!item.description.trim()) return isRTL ? 'أدخل وصفاً لكل بند' : 'Add a description for every item';
      if (calcAmount(item) <= 0) return isRTL ? 'تحقق من الكميات والأسعار' : 'Check quantities and rates — all items must have a non-zero amount';
    }
    return null;
  };

  const handleSave = async (andSend = false) => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');

    if (andSend) setSending(true); else setSaving(true);

    try {
      const res = await fetch('/api/invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload()),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create invoice');

      const invoiceId = data.id!;

      if (andSend) {
        const sendRes = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
        if (!sendRes.ok) throw new Error('Invoice created but failed to send');
      }

      router.push(`/${locale}/lawyer/invoices/${invoiceId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : (isRTL ? 'حدث خطأ' : 'Something went wrong'));
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Back */}
      <a href={`/${locale}/lawyer/cases/${caseId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
        <BackIcon className="h-4 w-4" />
        {caseTitle}
      </a>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-[#1A3557]" />
          {isRTL ? 'إنشاء فاتورة' : 'Create Invoice'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isRTL ? `للعميل: ${clientName}` : `Client: ${clientName}`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Invoice metadata */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{isRTL ? 'بيانات الفاتورة' : 'Invoice Details'}</h2>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'وصف القضية / الموضوع *' : 'Matter Description *'}
          </label>
          <textarea
            value={matterDesc}
            onChange={(e) => setMatterDesc(e.target.value)}
            rows={2}
            placeholder={isRTL ? 'مثال: تمثيل في دعوى مدنية رقم 98765 أمام محكمة عمّان الابتدائية' : 'e.g. Representation in Civil Case No. 98765 before Amman Court of First Instance'}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'تاريخ الفاتورة' : 'Invoice Date'}</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'العملة' : 'Currency'}</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              <option value="JOD">JOD — Jordanian Dinar</option>
              <option value="AED">AED — UAE Dirham</option>
              <option value="SAR">SAR — Saudi Riyal</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'نسبة الضريبة (%)' : 'Tax Rate (%)'}</label>
            <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} min="0" max="30" step="0.1" className={inputCls} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'رقم الضريبة / التسجيل' : 'Tax ID / VAT Registration'}</label>
            <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="JO123456789" className={inputCls} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'سلفة مطبّقة' : 'Retainer Applied'}</label>
            <input type="number" value={retainerApplied} onChange={(e) => setRetainerApplied(e.target.value)} min="0" step="0.01" className={inputCls} dir="ltr" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isRTL ? 'ملاحظات' : 'Notes'}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder={isRTL ? 'مثال: جميع المصروفات سُدِّدت من حساب العميل الائتماني نيابةً عنك.' : 'e.g. All disbursements paid from client trust account on your behalf.'}
            className={inputCls} />
        </div>
      </div>

      {/* Professional Services */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#1A3557]" />
            {isRTL ? 'الخدمات المهنية' : 'Professional Services'}
          </h2>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, makeItem('professional_service')])}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#1A3557] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {isRTL ? 'إضافة' : 'Add'}
          </button>
        </div>

        {items.filter((i) => i.item_type === 'professional_service').map((item) => (
          <div key={item._id} className="rounded-xl border border-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
              <input
                placeholder={isRTL ? 'وصف العمل (مثال: جلسة استماع + إيداع مستندات)' : 'Description (e.g. Court appearance + filing documents)'}
                value={item.description}
                onChange={(e) => updateItem(item._id, { description: e.target.value })}
                className={cn(inputCls, 'text-sm')}
              />
              <button type="button" onClick={() => removeItem(item._id)}
                className="p-2 text-muted-foreground hover:text-red-500 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground">{isRTL ? 'التاريخ' : 'Date'}</label>
                <input type="date" value={item.item_date} onChange={(e) => updateItem(item._id, { item_date: e.target.value })} className={cn(inputCls, 'mt-1')} dir="ltr" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{isRTL ? 'ساعات' : 'Hours'}</label>
                <input type="number" min="0" step="0.25" value={item.hours} onChange={(e) => updateItem(item._id, { hours: e.target.value })} placeholder="1.5" className={cn(inputCls, 'mt-1')} dir="ltr" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{isRTL ? `سعر/ساعة (${currency})` : `Rate/hr (${currency})`}</label>
                <input type="number" min="0" step="1" value={item.rate} onChange={(e) => updateItem(item._id, { rate: e.target.value })} placeholder="150" className={cn(inputCls, 'mt-1')} dir="ltr" />
              </div>
            </div>
            {calcAmount(item) > 0 && (
              <div className="text-xs font-bold text-[#1A3557] text-end">
                = {fmt(calcAmount(item))} {currency}
              </div>
            )}
          </div>
        ))}

        {items.filter((i) => i.item_type === 'professional_service').length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {isRTL ? 'لا توجد خدمات مهنية — اضغط "إضافة"' : 'No professional services — click Add'}
          </p>
        )}
      </div>

      {/* Disbursements */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4 text-[#0E7490]" />
            {isRTL ? 'المصروفات القابلة للاسترداد' : 'Disbursements & Expenses'}
          </h2>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, makeItem('disbursement')])}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#0E7490] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {isRTL ? 'إضافة' : 'Add'}
          </button>
        </div>

        {items.filter((i) => i.item_type === 'disbursement').map((item) => (
          <div key={item._id} className="rounded-xl border border-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
              <input
                placeholder={isRTL ? 'وصف المصروف (مثال: رسوم المحكمة، إيصال مرفق)' : 'Description (e.g. Court stamp fees — receipt attached)'}
                value={item.description}
                onChange={(e) => updateItem(item._id, { description: e.target.value })}
                className={cn(inputCls, 'text-sm')}
              />
              <button type="button" onClick={() => removeItem(item._id)}
                className="p-2 text-muted-foreground hover:text-red-500 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground">{isRTL ? 'التاريخ' : 'Date'}</label>
                <input type="date" value={item.item_date} onChange={(e) => updateItem(item._id, { item_date: e.target.value })} className={cn(inputCls, 'mt-1')} dir="ltr" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{isRTL ? 'الكمية' : 'Quantity'}</label>
                <input type="number" min="0" step="1" value={item.quantity} onChange={(e) => updateItem(item._id, { quantity: e.target.value })} placeholder="1" className={cn(inputCls, 'mt-1')} dir="ltr" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{isRTL ? `التكلفة (${currency})` : `Cost (${currency})`}</label>
                <input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => updateItem(item._id, { unit_cost: e.target.value })} placeholder="85.00" className={cn(inputCls, 'mt-1')} dir="ltr" />
              </div>
            </div>

            {/* Receipt upload */}
            <div>
              <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 mb-1.5">
                <Receipt className="h-3 w-3" />
                {isRTL ? 'إيصال الدفع (مطلوب)' : 'Payment Receipt (required)'}
              </label>
              <label className={cn(
                'flex items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 cursor-pointer text-xs transition',
                item.receiptFile
                  ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700'
                  : 'border-border hover:border-[#0E7490]/40 hover:bg-[#0E7490]/5 text-muted-foreground'
              )}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleReceiptFile(item._id, e.target.files[0]); }}
                />
                <Receipt className="h-3.5 w-3.5 shrink-0" />
                {item.receiptFile
                  ? `✓ ${item.receiptName}`
                  : (isRTL ? 'اضغط لرفع الإيصال (PDF أو صورة)' : 'Click to upload receipt (PDF or image)')}
              </label>
            </div>

            {calcAmount(item) > 0 && (
              <div className="text-xs font-bold text-[#0E7490] text-end">
                = {fmt(calcAmount(item))} {currency}
              </div>
            )}
          </div>
        ))}

        {items.filter((i) => i.item_type === 'disbursement').length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {isRTL ? 'لا مصروفات — اضغط "إضافة" إن وجدت' : 'No disbursements — click Add if applicable'}
          </p>
        )}
      </div>

      {/* Totals preview */}
      <div className="rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/5 p-5">
        <h2 className="text-sm font-semibold text-[#1A3557] mb-4 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          {isRTL ? 'ملخص الفاتورة' : 'Invoice Summary'}
        </h2>
        <div className="space-y-2 text-sm">
          {[
            { label: isRTL ? 'الخدمات المهنية' : 'Professional Services', value: subtotalServices },
            { label: isRTL ? 'المصروفات' : 'Disbursements', value: subtotalDisbursements },
          ].map(({ label, value }) => value > 0 && (
            <div key={label} className="flex justify-between text-muted-foreground">
              <span>{label}</span>
              <span dir="ltr">{fmt(value)} {currency}</span>
            </div>
          ))}
          <div className="flex justify-between text-muted-foreground">
            <span>{isRTL ? `ضريبة المبيعات (${taxRate}%)` : `Sales Tax (${taxRate}%)`}</span>
            <span dir="ltr">{fmt(taxAmt)} {currency}</span>
          </div>
          {parseFloat(retainerApplied) > 0 && (
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>{isRTL ? 'السلفة المطبّقة' : 'Retainer Applied'}</span>
              <span dir="ltr">−{fmt(parseFloat(retainerApplied))} {currency}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-[#1A3557] text-base pt-2 border-t border-[#1A3557]/20">
            <span>{isRTL ? 'الإجمالي المستحق' : 'TOTAL DUE'}</span>
            <span dir="ltr">{fmt(totalDue)} {currency}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving || sending}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground hover:bg-muted transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isRTL ? 'حفظ كمسودة' : 'Save as Draft'}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving || sending}
          className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-[#1A3557] text-white py-3 text-sm font-bold hover:bg-[#1e4a7a] transition disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isRTL ? 'حفظ وإرسال للعميل' : 'Save & Send to Client'}
        </button>
      </div>
    </div>
  );
}
