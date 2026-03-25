import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/nde/flags/[id]
 * Resolves an NDE flag — records the action taken by the client.
 * action_taken: 'send_reminder' | 'log_update' | 'start_escalation' | 'dismissed'
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { action_taken } = body as { action_taken?: string };

  const validActions = ['send_reminder', 'log_update', 'start_escalation', 'dismissed'];
  if (action_taken && !validActions.includes(action_taken)) {
    return NextResponse.json({ error: 'Invalid action_taken value' }, { status: 400 });
  }

  // Verify the flag belongs to a case owned by this user
  const { data: flag } = await supabase
    .from('nde_flags')
    .select('id, case_id, rule_id, severity, cases!inner(client_id)')
    .eq('id', id)
    .eq('cases.client_id', user.id)
    .maybeSingle();

  if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('nde_flags')
    .update({
      resolved_at:  now,
      resolved_by:  user.id,
      action_taken: action_taken ?? 'dismissed',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write resolution to immutable timeline
  await supabase.from('timeline_events').insert({
    case_id:             flag.case_id,
    actor_id:            user.id,
    event_type:          'nde_flag_resolved',
    payload: {
      flag_id:      id,
      rule_id:      flag.rule_id,
      severity:     flag.severity,
      action_taken: action_taken ?? 'dismissed',
    },
    is_system_generated: false,
  });

  // Recalculate health score after resolution
  await recalcHealth(supabase, flag.case_id);

  return NextResponse.json({ data: updated });
}

async function recalcHealth(sb: Awaited<ReturnType<typeof createClient>>, caseId: string) {
  let score = 100;

  const { data: openFlags } = await sb
    .from('nde_flags')
    .select('severity')
    .eq('case_id', caseId)
    .is('resolved_at', null);

  for (const f of openFlags ?? []) {
    const penalty = { critical: 35, high: 25, medium: 15, low: 5 };
    score -= penalty[(f.severity as keyof typeof penalty)] ?? 10;
  }

  const { count } = await sb
    .from('deadlines')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .eq('status', 'missed');

  score -= (count ?? 0) * 10;
  score = Math.max(0, Math.min(100, score));

  await sb.from('cases').update({ health_score: score }).eq('id', caseId);
}
