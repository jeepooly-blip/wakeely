import { NextResponse }       from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createNotification, sendEmail, sendWhatsApp } from '@/lib/notify';

// ──────────────────────────────────────────────────────────────────
// POST /api/invoices/[id]/send
//
// Transitions invoice from draft → sent, notifies client via
// email + in-app + WhatsApp (if opted in).
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch invoice + client info
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, lawyer_id, client_id, status,
      total_amount, currency, due_date, matter_description,
      cases(title),
      client:users!invoices_client_id_fkey(
        id, full_name, email, phone, locale,
        notification_email, notification_whatsapp, notification_in_app
      ),
      lawyer:users!invoices_lawyer_id_fkey(full_name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invoice.lawyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (invoice.status !== 'draft') return NextResponse.json({ error: 'Invoice already sent' }, { status: 409 });

  // Must have at least one item
  const { count } = await supabase
    .from('invoice_items')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', id);

  if (!count || count === 0) {
    return NextResponse.json({ error: 'Cannot send invoice with no line items' }, { status: 400 });
  }

  // Transition to sent
  const sb = createAdminClient();
  await sb.from('invoices').update({
    status:  'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', id);

  // Timeline event on the case
  const caseTitle = (invoice.cases as unknown as { title: string })?.title ?? '';
  try {
    await sb.from('timeline_events').insert({
      case_id:             (invoice.cases as unknown as { id?: string } | null)?.id ?? null,
      actor_id:            user.id,
      event_type:          'invoice_issued',
      payload: {
        invoice_id:     id,
        invoice_number: invoice.invoice_number,
        total_amount:   invoice.total_amount,
        currency:       invoice.currency,
      },
      is_system_generated: false,
    });
  } catch { /* non-critical */ }

  const client = invoice.client as unknown as {
    id: string; full_name: string; email: string; phone?: string;
    locale: string; notification_email: boolean; notification_whatsapp: boolean;
    notification_in_app: boolean;
  };
  const lawyerName = (invoice.lawyer as unknown as { full_name: string })?.full_name ?? 'Your lawyer';
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  const isAr       = client.locale === 'ar';

  const invoiceUrl = `${appUrl}/${client.locale}/invoices/${id}`;
  const fmtAmount  = `${invoice.total_amount.toLocaleString('en-JO', { minimumFractionDigits: 2 })} ${invoice.currency}`;
  const dueDate    = new Date(invoice.due_date).toLocaleDateString(isAr ? 'ar-JO' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── In-app notification ────────────────────────────────────────
  if (client.notification_in_app !== false) {
    await createNotification({
      user_id:    client.id,
      type:       'invoice_issued' as never,
      title:      isAr
        ? `فاتورة جديدة: ${invoice.invoice_number}`
        : `New invoice: ${invoice.invoice_number}`,
      body:       isAr
        ? `${lawyerName} أرسل فاتورة بقيمة ${fmtAmount} — تاريخ الاستحقاق: ${dueDate}`
        : `${lawyerName} sent an invoice for ${fmtAmount} — due ${dueDate}`,
      action_url: `/invoices/${id}`,
    });
  }

  // ── Email ──────────────────────────────────────────────────────
  if (client.notification_email !== false && client.email) {
    const subject = isAr
      ? `فاتورة جديدة ${invoice.invoice_number} — المطلوب: ${fmtAmount}`
      : `New Invoice ${invoice.invoice_number} — Amount Due: ${fmtAmount}`;

    await sendEmail({
      to:      client.email,
      subject,
      html: buildInvoiceEmail({
        clientName:    client.full_name,
        lawyerName,
        invoiceNumber: invoice.invoice_number,
        amount:        fmtAmount,
        dueDate,
        matterDesc:    invoice.matter_description,
        invoiceUrl,
        isAr,
        appUrl,
      }),
    });
  }

  // ── WhatsApp ───────────────────────────────────────────────────
  if (client.notification_whatsapp && client.phone) {
    const waMsg = isAr
      ? `📋 *وكيلا:* وصلتك فاتورة جديدة من ${lawyerName}\n` +
        `رقم الفاتورة: ${invoice.invoice_number}\n` +
        `المبلغ المطلوب: ${fmtAmount}\n` +
        `تاريخ الاستحقاق: ${dueDate}\n` +
        `اعرض وادفع: ${invoiceUrl}`
      : `📋 *Wakeela:* You have a new invoice from ${lawyerName}\n` +
        `Invoice: ${invoice.invoice_number}\n` +
        `Amount Due: ${fmtAmount}\n` +
        `Due: ${dueDate}\n` +
        `View & Pay: ${invoiceUrl}`;

    await sendWhatsApp({ phone: client.phone, message: waMsg });
  }

  return NextResponse.json({ ok: true, status: 'sent' });
}

// ── Email HTML builder ─────────────────────────────────────────────
function buildInvoiceEmail(opts: {
  clientName: string; lawyerName: string; invoiceNumber: string;
  amount: string; dueDate: string; matterDesc: string;
  invoiceUrl: string; isAr: boolean; appUrl: string;
}): string {
  const { clientName, lawyerName, invoiceNumber, amount, dueDate,
          matterDesc, invoiceUrl, isAr } = opts;
  const dir  = isAr ? 'rtl' : 'ltr';
  const font = isAr ? "'IBM Plex Arabic', Arial" : "'Inter', Arial";

  const greeting   = isAr ? `عزيزي ${clientName}،` : `Dear ${clientName},`;
  const body1      = isAr
    ? `يُخبرك المحامي ${lawyerName} بأنه أصدر فاتورة جديدة بشأن قضيتك.`
    : `${lawyerName} has issued a new invoice for your case.`;
  const matter     = isAr ? `الموضوع:` : `Matter:`;
  const amountLbl  = isAr ? `المبلغ المطلوب:` : `Amount Due:`;
  const dueLbl     = isAr ? `تاريخ الاستحقاق:` : `Due Date:`;
  const btnText    = isAr ? 'عرض الفاتورة والدفع' : 'View Invoice & Pay';
  const disc       = isAr
    ? 'وكيلا هي أداة توثيق فقط ولا تقدم استشارات قانونية.'
    : 'Wakeela is a documentation tool only and does not provide legal advice.';

  return `<!DOCTYPE html><html dir="${dir}" lang="${isAr ? 'ar' : 'en'}">
<head><meta charset="UTF-8"><style>
  body{margin:0;padding:0;background:#f4f4f5;font-family:${font},sans-serif}
</style></head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);border-top:4px solid #1A3557">
  <tr><td style="background:#1A3557;padding:18px 24px">
    <span style="color:#C89B3C;font-size:20px;font-weight:900">WAKEELA · وكيلة</span>
  </td></tr>
  <tr><td style="padding:28px">
    <p style="font-size:13px;color:#374151;margin:0 0 8px">${greeting}</p>
    <p style="font-size:14px;color:#111827;margin:0 0 20px">${body1}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:22px">
      <p style="font-size:11px;color:#6b7280;margin:0 0 4px">${matter}</p>
      <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 12px">${matterDesc}</p>
      <table width="100%"><tr>
        <td style="font-size:12px;color:#6b7280">${invoiceNumber}</td>
        <td align="${isAr ? 'left' : 'right'}" style="font-size:16px;font-weight:900;color:#1A3557">${amount}</td>
      </tr><tr>
        <td style="font-size:11px;color:#9ca3af;padding-top:4px">${dueLbl} ${dueDate}</td>
        <td></td>
      </tr></table>
    </div>
    <a href="${invoiceUrl}" style="display:block;background:#C89B3C;color:#fff;text-align:center;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:16px">${btnText}</a>
    <p style="font-size:11px;color:#9ca3af;text-align:center">${amountLbl} ${amount}</p>
  </td></tr>
  <tr><td style="padding:14px 28px;border-top:1px solid #f0f0f0">
    <p style="font-size:10px;color:#9ca3af;margin:0">${disc}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
