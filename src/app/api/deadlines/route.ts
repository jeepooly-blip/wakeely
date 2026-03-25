import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/deadlines — fetch all deadlines for current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('deadlines')
    .select(`
      id, title, due_date, type, status,
      reminder_days, created_at, updated_at, completed_at,
      case_id,
      cases!inner(id, title, client_id)
    `)
    .eq('cases.client_id', user.id)
    .order('due_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/deadlines — create a new deadline
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { case_id, title, due_date, type, reminder_days } = body;

  if (!case_id || !title || !due_date) {
    return NextResponse.json({ error: 'case_id, title, and due_date are required' }, { status: 400 });
  }

  // Verify the case belongs to this user
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id')
    .eq('id', case_id)
    .eq('client_id', user.id)
    .maybeSingle();

  if (!caseRow) {
    return NextResponse.json({ error: 'Case not found or access denied' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('deadlines')
    .insert({
      case_id,
      title,
      due_date,
      type:          type ?? 'court',
      reminder_days: reminder_days ?? [7, 3, 1],
      status:        'pending',
      created_by:    user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write timeline event
  await supabase.from('timeline_events').insert({
    case_id,
    actor_id:            user.id,
    event_type:          'deadline_added',
    payload:             { deadline_id: data.id, title, due_date, type: type ?? 'court' },
    is_system_generated: false,
  });

  return NextResponse.json({ data }, { status: 201 });
}
