import { NextResponse }  from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeText } from '@/lib/sanitize';

// ──────────────────────────────────────────────────────────────────
// GET    /api/invoices/[id]  — full invoice with items + receipts
// PATCH  /api/invoices/[id]  — update draft invoice
// DELETE /api/invoices/[id]  — cancel/delete draft
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      *,
      cases(id, title, case_type, jurisdiction, city),
      lawyer:users!invoices_lawyer_id_fkey(id, full_name, email, phone),
      client:users!invoices_client_id_fkey(id, full_name, email, phone),
      invoice_items(
        *,
        disbursement_receipts(*)
      )
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'invoice_items', ascending: true })
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mark as viewed if client is fetching for first time
  if (invoice.client_id === user.id && invoice.status === 'sent' && !invoice.viewed_at) {
    await supabase
      .from('invoices')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', id);
    invoice.status = 'viewed';
    invoice.viewed_at = new Date().toISOString();
  }

  return NextResponse.json(invoice);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only lawyer who owns the invoice can edit (and only drafts)
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, lawyer_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.lawyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (existing.status !== 'draft') return NextResponse.json({ error: 'Only draft invoices can be edited' }, { status: 409 });

  const body = await req.json();
  const allowed = [
    'matter_description', 'invoice_date', 'due_date', 'tax_id',
    'tax_rate', 'retainer_applied', 'retainer_balance', 'notes',
    'currency', 'late_payment_rate',
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      updates[key] = typeof body[key] === 'string' ? sanitizeText(body[key]) : body[key];
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: existing } = await supabase
    .from('invoices')
    .select('lawyer_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.lawyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Sent/paid invoices should be cancelled, not deleted (audit trail)
  if (existing.status !== 'draft') {
    await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id);
    return NextResponse.json({ ok: true, action: 'cancelled' });
  }

  await supabase.from('invoices').delete().eq('id', id);
  return NextResponse.json({ ok: true, action: 'deleted' });
}
