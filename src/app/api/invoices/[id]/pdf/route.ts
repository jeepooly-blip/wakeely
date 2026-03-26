import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

// ──────────────────────────────────────────────────────────────────
// GET /api/invoices/[id]/pdf?locale=en|ar
//
// Returns print-optimised HTML that renders the full legal invoice.
// Auto-opens browser print dialog so user saves as PDF.
// JoFotara reference is shown when present.
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const url    = new URL(request.url);
  const locale = (url.searchParams.get('locale') ?? 'en') as 'en' | 'ar';
  const isRTL  = locale === 'ar';
  const dir    = isRTL ? 'rtl' : 'ltr';

  // Auth — lawyer or client can download
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Use admin client to fetch full data (avoids complex RLS join issues)
  const sb = createAdminClient();
  const { data: invoice } = await sb
    .from('invoices')
    .select(`
      *,
      cases(id, title, case_type, jurisdiction),
      lawyer:users!invoices_lawyer_id_fkey(id, full_name, email, phone),
      client:users!invoices_client_id_fkey(id, full_name, email, phone),
      invoice_items(*, disbursement_receipts(id, file_name))
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'invoice_items', ascending: true })
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Access check
  const isOwner = invoice.lawyer_id === user.id || invoice.client_id === user.id;
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Clients only see sent/viewed/paid invoices
  if (invoice.client_id === user.id && invoice.status === 'draft') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const lawyer = invoice.lawyer as { full_name: string; email: string; phone?: string };
  const client = invoice.client as { full_name: string; email: string; phone?: string };
  const caseRow = invoice.cases as { title: string; case_type: string; jurisdiction?: string };
  const items = (invoice.invoice_items ?? []) as Array<{
    id: string; item_type: string; item_date: string; description: string;
    hours?: number; rate?: number; quantity: number; unit_cost: number; amount: number;
    disbursement_receipts?: Array<{ id: string; file_name: string }>;
  }>;

  const services      = items.filter((i) => i.item_type === 'professional_service');
  const disbursements = items.filter((i) => i.item_type === 'disbursement');

  const fmtAmt = (n: number) =>
    n.toLocaleString('en-JO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-JO' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

  const exportedAt = new Date().toLocaleString(isRTL ? 'ar-JO' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const caseTypeLabels: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  const statusColors: Record<string, string> = {
    draft: '#6b7280', sent: '#1A3557', viewed: '#0E7490',
    paid: '#10b981', overdue: '#ef4444', cancelled: '#9ca3af',
  };
  const statusColor = statusColors[invoice.status] ?? '#6b7280';

  const statusLabel: Record<string, string> = isRTL
    ? { draft: 'مسودة', sent: 'مُرسَلة', viewed: 'تمت مشاهدتها', paid: 'مدفوعة', overdue: 'متأخرة', cancelled: 'ملغاة' }
    : { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' };

  // ── Build line item rows ────────────────────────────────────────
  const buildRow = (item: typeof items[0], idx: number) => {
    const isDisb = item.item_type === 'disbursement';
    const hasReceipts = (item.disbursement_receipts?.length ?? 0) > 0;
    const receiptNote = hasReceipts
      ? `<span class="receipt-tag">${isRTL ? `${item.disbursement_receipts!.length} إيصال` : `${item.disbursement_receipts!.length} receipt${item.disbursement_receipts!.length > 1 ? 's' : ''}`}</span>`
      : (isDisb ? `<span class="no-receipt">${isRTL ? 'لا إيصال' : 'No receipt'}</span>` : '');

    return `<tr class="${idx % 2 === 0 ? 'r-even' : 'r-odd'}">
      <td class="c-num">${idx + 1}</td>
      <td class="c-date" dir="ltr">${new Date(item.item_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td class="c-desc">
        <span class="desc-text">${item.description}</span>
        ${receiptNote}
      </td>
      <td class="c-qty" dir="ltr">
        ${isDisb
          ? (item.quantity !== 1 ? item.quantity : '—')
          : (item.hours ? `${item.hours}h` : '—')}
      </td>
      <td class="c-rate" dir="ltr">
        ${isDisb ? '—' : (item.rate ? `${fmtAmt(item.rate!)}` : '—')}
      </td>
      <td class="c-amount" dir="ltr">${fmtAmt(item.amount)}</td>
    </tr>`;
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';

  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${invoice.invoice_number} — ${isRTL ? 'فاتورة ضريبية' : 'Tax Invoice'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&family=Inter:wght@400;600;700;900&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ${isRTL ? "'IBM Plex Arabic'" : "'Inter'"}, Arial, sans-serif;
      background: #fff;
      color: #111827;
      font-size: 11px;
      line-height: 1.5;
      direction: ${dir};
    }

    .page { max-width: 820px; margin: 0 auto; padding: 32px 28px; }

    /* ── Header ── */
    .header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
      border-bottom: 3px solid #1A3557;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand-name { font-size: 22px; font-weight: 900; color: #1A3557; letter-spacing: -0.5px; }
    .brand-name span { color: #C89B3C; }
    .brand-sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
    .invoice-meta { text-align: ${isRTL ? 'left' : 'right'}; }
    .invoice-type {
      font-size: 16px; font-weight: 900; color: #1A3557;
      text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;
    }
    .meta-grid { display: grid; grid-template-columns: auto auto; gap: 2px 12px; font-size: 10px; }
    .meta-label { color: #6b7280; }
    .meta-value { font-weight: 700; color: #111827; }
    .status-badge {
      display: inline-block;
      background: ${statusColor}20;
      color: ${statusColor};
      border: 1px solid ${statusColor}40;
      font-size: 9px; font-weight: 700; padding: 2px 8px;
      border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    /* ── Parties ── */
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .party-box {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px;
    }
    .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 6px; }
    .party-name { font-size: 13px; font-weight: 700; color: #1A3557; margin-bottom: 4px; }
    .party-detail { font-size: 10px; color: #4b5563; line-height: 1.6; }

    /* ── Matter ── */
    .matter-box {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 10px 14px; margin-bottom: 20px;
    }
    .matter-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 4px; }
    .matter-text { font-size: 12px; font-weight: 600; color: #111827; }

    /* ── JoFotara ── */
    .jofotara-bar {
      background: #eff6ff; border: 1px solid #bfdbfe;
      border-radius: 8px; padding: 8px 14px; margin-bottom: 20px;
      display: flex; align-items: center; gap: 10px;
    }
    .jofotara-label { font-size: 10px; font-weight: 700; color: #1d4ed8; }
    .jofotara-ref { font-size: 10px; color: #1d4ed8; font-family: monospace; }

    /* ── Section headings ── */
    .section-heading {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: #6b7280; margin-bottom: 6px;
      display: flex; align-items: center; gap: 6px;
    }
    .section-heading::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
    thead th {
      background: #1A3557; color: #fff; font-weight: 700; font-size: 9px;
      padding: 7px 9px; text-align: ${isRTL ? 'right' : 'left'};
    }
    thead th:first-child { border-radius: ${isRTL ? '0 6px 6px 0' : '6px 0 0 6px'}; }
    thead th:last-child  { border-radius: ${isRTL ? '6px 0 0 6px' : '0 6px 6px 0'}; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    .r-even { background: #fff; }
    .r-odd  { background: #f8fafc; }
    td { padding: 7px 9px; vertical-align: middle; }

    .c-num   { width: 28px; color: #9ca3af; font-weight: 700; text-align: center; }
    .c-date  { width: 90px; color: #6b7280; white-space: nowrap; }
    .c-desc  { }
    .c-qty   { width: 50px; text-align: center; color: #374151; }
    .c-rate  { width: 70px; text-align: ${isRTL ? 'left' : 'right'}; color: #374151; }
    .c-amount{ width: 80px; text-align: ${isRTL ? 'left' : 'right'}; font-weight: 700; color: #1A3557; }

    .desc-text { font-weight: 600; color: #111827; display: block; }
    .receipt-tag {
      display: inline-block; font-size: 8px; background: #dcfce7;
      color: #15803d; border: 1px solid #bbf7d0; border-radius: 10px;
      padding: 1px 5px; margin-top: 2px; font-weight: 600;
    }
    .no-receipt {
      display: inline-block; font-size: 8px; background: #fef9c3;
      color: #a16207; border: 1px solid #fde68a; border-radius: 10px;
      padding: 1px 5px; margin-top: 2px;
    }

    /* ── Totals ── */
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-table { width: 280px; }
    .totals-table td { padding: 4px 0; font-size: 11px; }
    .totals-table .t-label { color: #6b7280; }
    .totals-table .t-value { text-align: ${isRTL ? 'left' : 'right'}; font-weight: 600; color: #111827; }
    .totals-table .t-total-row td { border-top: 2px solid #1A3557; padding-top: 8px; }
    .totals-table .t-total-label { font-size: 13px; font-weight: 900; color: #1A3557; }
    .totals-table .t-total-value { font-size: 15px; font-weight: 900; color: #1A3557; text-align: ${isRTL ? 'left' : 'right'}; }
    .retainer-row td { color: #10b981; font-weight: 700; }

    /* ── Payment ── */
    .payment-box {
      border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 14px 16px; margin-bottom: 20px;
    }
    .payment-title { font-size: 11px; font-weight: 700; color: #1A3557; margin-bottom: 10px; }
    .iban-row { display: flex; align-items: center; gap: 8px; }
    .iban-label { font-size: 10px; color: #6b7280; min-width: 60px; }
    .iban-value { font-family: monospace; font-size: 11px; font-weight: 700; color: #111827; }
    .pay-portal-note {
      margin-top: 8px; font-size: 10px; color: #0E7490; font-weight: 600;
    }

    /* ── Notes ── */
    .notes-box {
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
      padding: 10px 14px; margin-bottom: 20px; font-size: 10px; color: #78350f;
      line-height: 1.7;
    }

    /* ── Footer ── */
    .footer {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-top: 1px solid #e2e8f0; padding-top: 14px;
      font-size: 9px; color: #9ca3af; gap: 20px;
    }
    .disclaimer { max-width: 440px; line-height: 1.5; }
    .footer-right { text-align: ${isRTL ? 'left' : 'right'}; white-space: nowrap; }

    /* ── Print ── */
    @media print {
      body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 16px 20px; max-width: 100%; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr    { page-break-inside: avoid; }
    }

    /* ── Screen print bar ── */
    @media screen {
      .print-bar {
        position: fixed; top: 0; left: 0; right: 0;
        background: #1A3557; color: #fff;
        padding: 10px 20px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        z-index: 100; font-size: 12px;
        font-family: ${isRTL ? "'IBM Plex Arabic'" : "'Inter'"}, Arial, sans-serif;
        direction: ${dir};
      }
      .print-bar .hint { opacity: 0.75; font-size: 11px; }
      .print-btn {
        background: #C89B3C; color: #fff; border: none;
        border-radius: 8px; padding: 7px 18px;
        font-weight: 700; font-size: 12px; cursor: pointer;
        font-family: inherit; white-space: nowrap;
      }
      .print-btn:hover { background: #b8892f; }
      .page { padding-top: 68px; }
    }
  </style>
</head>
<body>

  <!-- Print bar (screen only) -->
  <div class="print-bar no-print">
    <span class="hint">
      ${isRTL
        ? '📄 لحفظ الفاتورة بصيغة PDF: اضغط "طباعة" ثم اختر "حفظ كـ PDF"'
        : '📄 To save as PDF: click Print → choose "Save as PDF" as the printer'}
    </span>
    <button class="print-btn" onclick="window.print()">
      ${isRTL ? '🖨️ طباعة / حفظ PDF' : '🖨️ Print / Save as PDF'}
    </button>
  </div>

  <div class="page">

    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand-name">WAKEELA <span>·</span> وكيلة</div>
        <div class="brand-sub">${isRTL ? 'درعك القانوني الشخصي' : 'Your personal legal shield'}</div>
      </div>
      <div class="invoice-meta">
        <div class="status-badge">${statusLabel[invoice.status] ?? invoice.status}</div>
        <div class="invoice-type">${isRTL ? 'فاتورة ضريبية' : 'TAX INVOICE'}</div>
        <div class="meta-grid">
          <span class="meta-label">${isRTL ? 'رقم الفاتورة' : 'Invoice No.'}</span>
          <span class="meta-value" dir="ltr">${invoice.invoice_number}</span>
          <span class="meta-label">${isRTL ? 'تاريخ الإصدار' : 'Invoice Date'}</span>
          <span class="meta-value" dir="ltr">${fmtDate(invoice.invoice_date)}</span>
          <span class="meta-label">${isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</span>
          <span class="meta-value" dir="ltr">${fmtDate(invoice.due_date)}</span>
          ${invoice.tax_id ? `<span class="meta-label">${isRTL ? 'الرقم الضريبي' : 'Tax ID'}</span><span class="meta-value" dir="ltr">${invoice.tax_id}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- JoFotara reference -->
    ${invoice.jofotara_ref ? `
    <div class="jofotara-bar">
      <span class="jofotara-label">🇯🇴 JoFotara ${isRTL ? 'رقم المرجع' : 'Reference'}:</span>
      <span class="jofotara-ref">${invoice.jofotara_ref}</span>
    </div>` : `
    <div class="jofotara-bar no-print" style="background:#fffbeb;border-color:#fde68a">
      <span class="jofotara-label" style="color:#92400e">⚠️ ${isRTL ? 'لم يُرسل إلى JoFotara بعد — مطلوب للصلاحية القانونية في الأردن' : 'Not yet submitted to JoFotara — required for legal validity in Jordan'}</span>
    </div>`}

    <!-- Bill From / Bill To -->
    <div class="parties">
      <div class="party-box">
        <div class="party-label">${isRTL ? 'من' : 'From'}</div>
        <div class="party-name">${lawyer.full_name}</div>
        <div class="party-detail">
          ${lawyer.email}<br/>
          ${lawyer.phone ?? ''}
        </div>
      </div>
      <div class="party-box" style="border-color:#1A3557">
        <div class="party-label">${isRTL ? 'إلى' : 'Bill To'}</div>
        <div class="party-name">${client.full_name}</div>
        <div class="party-detail">
          ${client.email}<br/>
          ${client.phone ?? ''}
        </div>
      </div>
    </div>

    <!-- Matter -->
    <div class="matter-box">
      <div class="matter-label">${isRTL ? 'موضوع القضية / رقم الملف' : 'Matter / Case Description'}</div>
      <div class="matter-text">
        ${invoice.matter_description}
        ${caseRow?.jurisdiction ? ` — ${caseRow.jurisdiction}` : ''}
      </div>
      <div style="margin-top:6px;font-size:9px;color:#6b7280">
        ${isRTL ? 'نوع القضية' : 'Case type'}: ${caseTypeLabels[caseRow?.case_type] ?? caseRow?.case_type ?? ''}
        &nbsp;·&nbsp;${isRTL ? 'رقم الملف' : 'File'}: ${invoice.case_id.slice(0, 8).toUpperCase()}
      </div>
    </div>

    <!-- Professional Services -->
    ${services.length > 0 ? `
    <div class="section-heading">${isRTL ? 'الخدمات المهنية' : 'Professional Services'}</div>
    <table>
      <thead><tr>
        <th>#</th>
        <th>${isRTL ? 'التاريخ' : 'Date'}</th>
        <th>${isRTL ? 'الوصف' : 'Description'}</th>
        <th>${isRTL ? 'الساعات' : 'Hours'}</th>
        <th>${isRTL ? 'السعر/ساعة' : 'Rate/hr'}</th>
        <th>${isRTL ? `المبلغ (${invoice.currency})` : `Amount (${invoice.currency})`}</th>
      </tr></thead>
      <tbody>${services.map((item, i) => buildRow(item, i)).join('')}</tbody>
      <tfoot>
        <tr style="background:#f8fafc">
          <td colspan="5" style="font-weight:700;padding:8px 9px;text-align:${isRTL ? 'left' : 'right'};color:#6b7280">
            ${isRTL ? 'إجمالي الخدمات المهنية' : 'Subtotal Professional Fees'}
          </td>
          <td style="font-weight:900;color:#1A3557;padding:8px 9px;text-align:${isRTL ? 'left' : 'right'}" dir="ltr">
            ${fmtAmt(invoice.subtotal_services)}
          </td>
        </tr>
      </tfoot>
    </table>` : ''}

    <!-- Disbursements -->
    ${disbursements.length > 0 ? `
    <div class="section-heading">
      ${isRTL ? 'المصروفات والنفقات القابلة للاسترداد' : 'Disbursements & Expenses (reimbursable)'}
    </div>
    <table>
      <thead><tr>
        <th>#</th>
        <th>${isRTL ? 'التاريخ' : 'Date'}</th>
        <th>${isRTL ? 'الوصف + الإيصالات' : 'Description + Receipts'}</th>
        <th>${isRTL ? 'الكمية' : 'Qty'}</th>
        <th>${isRTL ? 'التكلفة' : 'Cost'}</th>
        <th>${isRTL ? `المبلغ (${invoice.currency})` : `Amount (${invoice.currency})`}</th>
      </tr></thead>
      <tbody>${disbursements.map((item, i) => buildRow(item, i)).join('')}</tbody>
      <tfoot>
        <tr style="background:#f8fafc">
          <td colspan="5" style="font-weight:700;padding:8px 9px;text-align:${isRTL ? 'left' : 'right'};color:#6b7280">
            ${isRTL ? 'إجمالي المصروفات' : 'Subtotal Disbursements'}
          </td>
          <td style="font-weight:900;color:#1A3557;padding:8px 9px;text-align:${isRTL ? 'left' : 'right'}" dir="ltr">
            ${fmtAmt(invoice.subtotal_disbursements)}
          </td>
        </tr>
      </tfoot>
    </table>` : ''}

    <!-- Totals -->
    <div class="totals-section">
      <table class="totals-table">
        <tr>
          <td class="t-label">${isRTL ? 'المجموع قبل الضريبة' : 'Total Before Tax'}</td>
          <td class="t-value" dir="ltr">${fmtAmt(invoice.subtotal_services + invoice.subtotal_disbursements)} ${invoice.currency}</td>
        </tr>
        <tr>
          <td class="t-label">${isRTL ? `ضريبة المبيعات (${invoice.tax_rate}%)` : `Sales Tax (${invoice.tax_rate}%)`}</td>
          <td class="t-value" dir="ltr">${fmtAmt(invoice.tax_amount)} ${invoice.currency}</td>
        </tr>
        ${invoice.retainer_applied > 0 ? `
        <tr class="retainer-row">
          <td>${isRTL ? 'مبلغ السلفة المطبّق' : 'Retainer Applied'}</td>
          <td dir="ltr">−${fmtAmt(invoice.retainer_applied)} ${invoice.currency}</td>
        </tr>` : ''}
        <tr class="t-total-row">
          <td class="t-total-label">${isRTL ? 'الإجمالي المستحق' : 'TOTAL DUE'}</td>
          <td class="t-total-value" dir="ltr">${fmtAmt(invoice.total_amount)} ${invoice.currency}</td>
        </tr>
        ${invoice.retainer_balance > 0 ? `
        <tr>
          <td class="t-label" style="font-size:10px">${isRTL ? 'رصيد السلفة المتبقي' : 'Remaining Retainer'}</td>
          <td class="t-value" style="color:#10b981" dir="ltr">${fmtAmt(invoice.retainer_balance)} ${invoice.currency}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Payment -->
    <div class="payment-box">
      <div class="payment-title">${isRTL ? 'تعليمات الدفع' : 'Payment Instructions'}</div>
      <div class="iban-row">
        <span class="iban-label">${isRTL ? 'التحويل البنكي' : 'Bank Transfer'}</span>
        <span class="iban-value">IBAN: JO12BANK000000000000000</span>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#6b7280">
        ${isRTL ? 'المرجع' : 'Ref'}: ${invoice.invoice_number}
      </div>
      ${invoice.status !== 'paid' ? `
      <div class="pay-portal-note">
        🔗 ${isRTL ? 'أو ادفع مباشرة في البوابة:' : 'Or pay directly in the portal:'} ${appUrl}/invoices/${id}
      </div>` : `
      <div style="margin-top:8px;font-size:10px;color:#10b981;font-weight:700">
        ✅ ${isRTL ? `تم الدفع بتاريخ ${invoice.paid_at ? fmtDate(invoice.paid_at) : ''}` : `Paid on ${invoice.paid_at ? fmtDate(invoice.paid_at) : ''}`}
        ${invoice.payment_reference ? ` · Ref: ${invoice.payment_reference}` : ''}
      </div>`}
    </div>

    <!-- Notes -->
    ${invoice.notes ? `
    <div class="notes-box">
      <strong>${isRTL ? 'ملاحظات:' : 'Notes:'}</strong> ${invoice.notes}
    </div>` : ''}

    <!-- Late payment notice -->
    ${invoice.late_payment_rate && invoice.status !== 'paid' ? `
    <div style="font-size:9px;color:#9ca3af;margin-bottom:16px">
      ${isRTL
        ? `⚠️ سيُطبَّق فائدة بنسبة ${invoice.late_payment_rate}% شهرياً على المبالغ المتأخرة.`
        : `⚠️ Late payments attract ${invoice.late_payment_rate}% monthly interest.`}
    </div>` : ''}

    <!-- Footer -->
    <div class="footer">
      <div class="disclaimer">
        ${isRTL
          ? 'وكيلا هي أداة توثيق فحسب ولا تقدم استشارات قانونية. هذه الفاتورة صادرة من المحامي مباشرة وليس من وكيلا.'
          : 'Wakeela is a documentation tool only and does not provide legal advice. This invoice is issued by the lawyer, not by Wakeela.'}
      </div>
      <div class="footer-right">
        ${isRTL ? 'صدرت عبر وكيلا' : 'Generated via Wakeela'}<br/>
        JoFotara ${isRTL ? 'متوافق' : 'Compliant'} · ${exportedAt}
      </div>
    </div>

  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        if (document.referrer || window.opener) window.print();
      }, 600);
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type':        'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${invoice.invoice_number}.html"`,
      'Cache-Control':       'no-store',
    },
  });
}
