import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — list action logs for a case (client or assigned lawyer)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: case_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify access (client owns case OR lawyer assigned to case)
  const [{ data: ownedCase }, { data: assignment }] = await Promise.all([
    supabase.from('cases').select('id').eq('id', case_id).eq('client_id', user.id).maybeSingle(),
    supabase.from('case_lawyers').select('id').eq('case_id', case_id).eq('lawyer_id', user.id).eq('status', 'active').maybeSingle(),
  ]);
  if (!ownedCase && !assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: logs } = await supabase
    .from('action_logs')
    .select('*, users!action_logs_lawyer_id_fkey(id, full_name)')
    .eq('case_id', case_id)
    .order('action_date', { ascending: false });

  return NextResponse.json(logs ?? []);
}

// POST — lawyer creates an action log
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: case_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be an assigned lawyer for this case
  const { data: assignment } = await supabase
    .from('case_lawyers')
    .select('id')
    .eq('case_id', case_id)
    .eq('lawyer_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: 'Not assigned to this case' }, { status: 403 });

  const { action_type, description, action_date } = await request.json();
  if (!action_type || !description || !action_date) {
    return NextResponse.json({ error: 'action_type, description, action_date required' }, { status: 400 });
  }

  const { data: log, error } = await supabase
    .from('action_logs')
    .insert({ case_id, lawyer_id: user.id, action_type, description, action_date })
    .select()
    .single();

  if (error || !log) return NextResponse.json({ error: error?.message }, { status: 500 });

  // Log in timeline
  await supabase.from('timeline_events').insert({
    case_id,
    actor_id:            user.id,
    event_type:          'action_logged',
    payload:             { action_type, description, action_date, log_id: log.id },
    is_system_generated: false,
  });

  return NextResponse.json(log, { status: 201 });
}
