import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeText, isValidUUID } from '@/lib/sanitize';
import type { CaseType } from '@/types';

// POST /api/cases — create a new case from wizard
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    title, case_type, jurisdiction, city,
    description, lawyer_name, lawyer_bar_number,
    lawyer_phone, lawyer_email, deadlines,
    draft_id,
  } = body;

  if (!title || !case_type) {
    return NextResponse.json({ error: 'title and case_type required' }, { status: 400 });
  }

  // Create case
  const { data: newCase, error: caseError } = await supabase
    .from('cases')
    .insert({
      client_id:         user.id,
      title:             sanitizeText(title),
      case_type:         case_type as CaseType,
      jurisdiction:      sanitizeText(jurisdiction ?? ''),
      city:              city ? sanitizeText(city) : null,
      description:       description ? sanitizeText(description) : null,
      lawyer_name:       lawyer_name ? sanitizeText(lawyer_name) : null,
      lawyer_bar_number: lawyer_bar_number ? sanitizeText(lawyer_bar_number) : null,
      lawyer_phone:      lawyer_phone ? sanitizeText(lawyer_phone) : null,
      lawyer_email:      lawyer_email ? sanitizeText(lawyer_email) : null,
      status:            'active',
      health_score:      100,
    })
    .select('id')
    .single();

  if (caseError || !newCase) {
    return NextResponse.json({ error: caseError?.message ?? 'Failed to create case' }, { status: 500 });
  }

  // Insert deadlines
  if (Array.isArray(deadlines) && deadlines.length > 0) {
    const rows = deadlines
      .filter((d: { title: string; due_date: string }) => d.title && d.due_date)
      .map((d: { title: string; due_date: string; type: string }) => ({
        case_id:    newCase.id,
        title:      sanitizeText(d.title),
        due_date:   d.due_date,
        type:       d.type ?? 'court',
        status:     'pending',
        created_by: user.id,
      }));
    if (rows.length > 0) await supabase.from('deadlines').insert(rows);
  }

  // Timeline event
  await supabase.from('timeline_events').insert({
    case_id:             newCase.id,
    actor_id:            user.id,
    event_type:          'case_created',
    payload:             { title, case_type, jurisdiction },
    is_system_generated: false,
  });

  // Delete draft if one existed
  if (draft_id && isValidUUID(draft_id)) {
    await supabase.from('cases').delete()
      .eq('id', draft_id)
      .eq('client_id', user.id)
      .eq('status', 'archived');
  }

  return NextResponse.json({ id: newCase.id }, { status: 201 });
}

// PATCH /api/cases — save wizard draft
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { case_id, draft_data, draft_step, title, case_type } = body;

  if (case_id && isValidUUID(case_id)) {
    // Update existing draft
    await supabase.from('cases')
      .update({ draft_data, draft_step, title: title ?? 'Untitled', case_type: case_type ?? 'other' })
      .eq('id', case_id)
      .eq('client_id', user.id);
    return NextResponse.json({ id: case_id });
  } else {
    // Create new draft
    const { data, error } = await supabase.from('cases')
      .insert({
        client_id:   user.id,
        title:       title ?? 'Untitled',
        case_type:   case_type ?? 'other',
        draft_data,
        draft_step,
        status:      'archived',
        health_score: 50,
      })
      .select('id').single();
    if (error || !data) return NextResponse.json({ error: error?.message }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  }
}
