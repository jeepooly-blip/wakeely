import { NextResponse }       from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notify';

// ──────────────────────────────────────────────────────────────────
// POST /api/invoices/[id]/pay
//
// Body: { payment_method, payment_reference, payment_proof_path? }
// Can be called by either the client (self-reporting payment) or
// the lawyer (confirming receipt of bank transfer).
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    payment_method?:     string;
    payment_reference?:  string;
    payment_proof_path?: string;
  };

  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id, lawyer_id, client_id, status, invoice_number,
      total_amount, currency, case_id,
      lawyer:users!invoices_lawyer_id_fkey(full_name, email, notification_in_app),
      client:users!invoices_client_id_fkey(full_name, locale, notification_in_app)
    `)
    .eq('id', id)
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isLawyer = invoice.lawyer_id === user.id;
  const isClient = invoice.client_id === user.id;

  if (!isLawyer && !isClient) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'Already marked as paid' }, { status: 409 });
  }
  if (invoice.status === 'cancelled') {
    return NextResponse.json({ error: 'Invoice is cancelled' }, { status: 409 });
  }

  // Mark as paid
  const sb = createAdminClient();
  await sb.from('invoices').update({
    status:              'paid',
    paid_at:             new Date().toISOString(),
    payment_method:      body.payment_method ?? 'bank_transfer',
    payment_reference:   body.payment_reference ?? null,
    payment_proof_path:  body.payment_proof_path ?? null,
  }).eq('id', id);

  // Write timeline event
  await sb.from('timeline_events').insert({
    case_id:             invoice.case_id,
    actor_id:            user.id,
    event_type:          'invoice_paid',
    payload: {
      invoice_id:       id,
      invoice_number:   invoice.invoice_number,
      total_amount:     invoice.total_amount,
      currency:         invoice.currency,
      paid_by:          isClient ? 'client' : 'lawyer_confirmed',
      payment_method:   body.payment_method ?? 'bank_transfer',
      payment_reference: body.payment_reference,
    },
    is_system_generated: false,
  }).catch(() => {});

  // Notify the other party
  const lawyer = invoice.lawyer as unknown as { full_name: string; email: string; notification_in_app: boolean };
  const client = invoice.client as unknown as { full_name: string; locale: string; notification_in_app: boolean };
  const isAr   = client.locale === 'ar';
  const fmtAmt = `${invoice.total_amount.toLocaleString('en-JO', { minimumFractionDigits: 2 })} ${invoice.currency}`;

  if (isClient && lawyer.notification_in_app !== false) {
    // Notify lawyer that client marked as paid
    await createNotification({
      user_id:    invoice.lawyer_id,
      type:       'invoice_paid' as never,
      title:      `Payment received: ${invoice.invoice_number}`,
      body:       `${client.full_name} marked invoice ${invoice.invoice_number} as paid (${fmtAmt})`,
      action_url: `/lawyer/invoices/${id}`,
    });
  }

  if (isLawyer && client.notification_in_app !== false) {
    // Notify client that lawyer confirmed payment
    await createNotification({
      user_id:    invoice.client_id,
      type:       'invoice_paid' as never,
      title:      isAr ? `تم تأكيد دفع الفاتورة ${invoice.invoice_number}` : `Payment confirmed: ${invoice.invoice_number}`,
      body:       isAr ? `أكد محاميك استلام مبلغ ${fmtAmt}` : `Your lawyer confirmed receipt of ${fmtAmt}`,
      action_url: `/invoices/${id}`,
    });
  }

  return NextResponse.json({ ok: true, status: 'paid' });
}
