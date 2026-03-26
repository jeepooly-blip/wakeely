import { NextResponse }    from 'next/server';
import { createClient }   from '@/lib/supabase/server';
import { sanitizeText }   from '@/lib/sanitize';

// ──────────────────────────────────────────────────────────────────
// GET  /api/invoices?case_id=xxx     — list invoices for a case
// POST /api/invoices                 — create a new draft invoice
// ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url    = new URL(req.url);
  const caseId = url.searchParams.get('case_id');

  let query = supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, status,
      total_amount, currency, matter_description,
      subtotal_services, subtotal_disbursements, tax_amount,
      sent_at, paid_at, created_at,
      cases(id, title, case_type),
      lawyer:users!invoices_lawyer_id_fkey(id, full_name, email),
      client:users!invoices_client_id_fkey(id, full_name, email)
    `)
    .order('created_at', { ascending: false });

  if (caseId) query = query.eq('case_id', caseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only lawyers can create invoices
  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'lawyer' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only lawyers can create invoices' }, { status: 403 });
  }

  const body = await req.json() as {
    case_id:             string;
    matter_description:  string;
    invoice_date?:       string;
    due_date?:           string;
    tax_id?:             string;
    tax_rate?:           number;
    retainer_applied?:   number;
    retainer_balance?:   number;
    notes?:              string;
    currency?:           string;
    items?:              Array<{
      item_type:    string;
      item_date:    string;
      description:  string;
      hours?:       number;
      rate?:        number;
      quantity?:    number;
      unit_cost?:   number;
      sort_order?:  number;
    }>;
  };

  if (!body.case_id || !body.matter_description) {
    return NextResponse.json({ error: 'case_id and matter_description required' }, { status: 400 });
  }

  // Verify lawyer is assigned to this case
  const { data: assignment } = await supabase
    .from('case_lawyers')
    .select('id')
    .eq('case_id', body.case_id)
    .eq('lawyer_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: 'Not assigned to this case' }, { status: 403 });
  }

  // Get client_id from case
  const { data: caseRow } = await supabase
    .from('cases')
    .select('client_id')
    .eq('id', body.case_id)
    .maybeSingle();

  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  // Create invoice
  const { data: invoice, error: invoiceErr } = await supabase
    .from('invoices')
    .insert({
      case_id:            body.case_id,
      lawyer_id:          user.id,
      client_id:          caseRow.client_id,
      matter_description: sanitizeText(body.matter_description),
      invoice_date:       body.invoice_date ?? new Date().toISOString().split('T')[0],
      due_date:           body.due_date,  // DB trigger sets default +30d if null
      tax_id:             body.tax_id ? sanitizeText(body.tax_id) : null,
      tax_rate:           body.tax_rate ?? 16,
      retainer_applied:   body.retainer_applied ?? 0,
      retainer_balance:   body.retainer_balance ?? 0,
      notes:              body.notes ? sanitizeText(body.notes) : null,
      currency:           body.currency ?? 'JOD',
      invoice_number:     '',  // DB trigger auto-generates
    })
    .select('id, invoice_number')
    .single();

  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: invoiceErr?.message ?? 'Failed to create invoice' }, { status: 500 });
  }

  // Insert line items if provided
  if (body.items?.length) {
    const rows = body.items.map((item, idx) => ({
      invoice_id:  invoice.id,
      item_type:   item.item_type,
      item_date:   item.item_date,
      description: sanitizeText(item.description),
      hours:       item.hours ?? null,
      rate:        item.rate ?? null,
      quantity:    item.quantity ?? 1,
      unit_cost:   item.unit_cost ?? 0,
      sort_order:  item.sort_order ?? idx,
    }));
    await supabase.from('invoice_items').insert(rows);
  }

  return NextResponse.json({ id: invoice.id, invoice_number: invoice.invoice_number }, { status: 201 });
}
