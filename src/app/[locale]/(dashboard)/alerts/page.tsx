import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AlertsPageClient } from '@/components/nde/alerts-page-client';

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // ── Fetch active cases ─────────────────────────────────────
  const { data: cases } = await supabase
    .from('cases')
    .select('id, title')
    .eq('client_id', user.id)
    .eq('status', 'active');

  if (!cases?.length) {
    return <AlertsPageClient initialFlags={[]} />;
  }

  const caseIds = cases.map((c) => c.id);
  const caseMap = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  // ── Fetch all NDE flags for those cases ───────────────────
  const { data: flagsRaw } = await supabase
    .from('nde_flags')
    .select('id, rule_id, severity, triggered_at, resolved_at, action_taken, case_id')
    .in('case_id', caseIds)
    .order('triggered_at', { ascending: false });

  // ── Fetch matching timeline events for payloads ───────────
  const { data: events } = await supabase
    .from('timeline_events')
    .select('case_id, payload, created_at')
    .in('case_id', caseIds)
    .eq('event_type', 'nde_flag')
    .order('created_at', { ascending: false });

  // Build a map: case_id+rule_id → payload
  const payloadMap = new Map<string, Record<string, unknown>>();
  for (const ev of events ?? []) {
    const pl       = ev.payload as Record<string, unknown>;
    const ruleId   = pl?.rule_id as number | undefined;
    if (ruleId) {
      const key = `${ev.case_id}:${ruleId}`;
      if (!payloadMap.has(key)) payloadMap.set(key, pl);
    }
  }

  const flags = (flagsRaw ?? []).map((f) => ({
    id:           f.id,
    rule_id:      f.rule_id as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    severity:     f.severity as 'low' | 'medium' | 'high' | 'critical',
    triggered_at: f.triggered_at,
    resolved_at:  f.resolved_at,
    action_taken: f.action_taken,
    case_id:      f.case_id,
    case_title:   caseMap[f.case_id] ?? '',
    payload:      payloadMap.get(`${f.case_id}:${f.rule_id}`) ?? {},
  }));

  return <AlertsPageClient initialFlags={flags} />;
}
