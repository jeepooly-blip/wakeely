import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── Helper: verify ownership ───────────────────────────────────
async function verifyOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deadlineId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('deadlines')
    .select('id, cases!inner(client_id)')
    .eq('id', deadlineId)
    .eq('cases.client_id', userId)
    .maybeSingle();
  return !!data;
}

// PATCH /api/deadlines/[id] — update or complete a deadline
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const owned = await verifyOwnership(supabase, id, user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { action, ...fields } = body;

  // Special action: mark complete
  if (action === 'complete') {
    const { data, error } = await supabase
      .from('deadlines')
      .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: user.id })
      .eq('id', id)
      .select('id, case_id, title')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Timeline event
    await supabase.from('timeline_events').insert({
      case_id:             data.case_id,
      actor_id:            user.id,
      event_type:          'deadline_completed',
      payload:             { deadline_id: id, title: data.title },
      is_system_generated: false,
    });

    return NextResponse.json({ data });
  }

  // Special action: reopen
  if (action === 'reopen') {
    const { data, error } = await supabase
      .from('deadlines')
      .update({ status: 'pending', completed_at: null, completed_by: null })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Regular field update
  const allowed = ['title', 'due_date', 'type', 'reminder_days', 'description'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('deadlines')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/deadlines/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const owned = await verifyOwnership(supabase, id, user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase.from('deadlines').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
