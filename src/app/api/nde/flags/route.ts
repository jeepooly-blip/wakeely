import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GET /api/nde/flags — all flags for the current user's cases */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: cases } = await supabase
    .from('cases')
    .select('id, title')
    .eq('client_id', user.id)
    .eq('status', 'active');

  if (!cases?.length) return NextResponse.json({ data: [] });

  const caseIds   = cases.map((c) => c.id);
  const caseMap   = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  const { data: flags, error } = await supabase
    .from('nde_flags')
    .select(`
      id, rule_id, severity, triggered_at, resolved_at, action_taken, case_id,
      timeline_events!left(payload, created_at)
    `)
    .in('case_id', caseIds)
    .order('triggered_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Merge case titles + payload from matching timeline event
  const normalized = (flags ?? []).map((f) => {
    // Find matching NDE timeline event for payload
    const events = (f.timeline_events as Array<{ payload: Record<string, unknown>; created_at: string }> | null) ?? [];
    const payload = events.find((e) => (e.payload as { rule_id?: number })?.rule_id === f.rule_id)?.payload ?? {};
    return {
      id:           f.id,
      rule_id:      f.rule_id,
      severity:     f.severity,
      triggered_at: f.triggered_at,
      resolved_at:  f.resolved_at,
      action_taken: f.action_taken,
      case_id:      f.case_id,
      case_title:   caseMap[f.case_id] ?? '',
      payload,
    };
  });

  return NextResponse.json({ data: normalized });
}
