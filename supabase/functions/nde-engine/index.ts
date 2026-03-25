// ============================================================
// Wakeela · Supabase Edge Function · nde-engine
// Negligence Detection Engine — evaluates all active cases
//
// Deploy with:
//   supabase functions deploy nde-engine
//
// Invoke via cron (supabase/functions/nde-engine/schedule.sql)
// or manually:
//   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/nde-engine \
//     -H "Authorization: Bearer YOUR_ANON_KEY"
//
// DISCLAIMER: Flags are informational only — not legal findings.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

type NDESeverity = 'low' | 'medium' | 'high' | 'critical';

interface NDERule {
  id: number;
  name: string;
  severity: NDESeverity;
  check: (caseData: CaseData) => boolean;
  message: (caseData: CaseData) => string;
}

interface CaseData {
  id: string;
  client_id: string;
  title: string;
  daysSinceActivity: number;
  missedDeadlines: { id: string; title: string; due_date: string }[];
  openFlags: number[];
}

// ── MVP Rule Set (Rules 1–3) ─────────────────────────────────
// Phase 2 will add Rules 4–7
const MVP_RULES: NDERule[] = [
  {
    id: 1,
    name: 'Inactivity Flag',
    severity: 'medium',
    check: (c) => c.daysSinceActivity >= 7 && c.daysSinceActivity < 14,
    message: (c) =>
      `No lawyer update or document upload for ${Math.floor(c.daysSinceActivity)} days`,
  },
  {
    id: 2,
    name: 'Deadline Miss',
    severity: 'high',
    check: (c) => c.missedDeadlines.length > 0,
    message: (c) =>
      `Missed deadline: ${c.missedDeadlines[0]?.title ?? 'Unknown'}`,
  },
  {
    id: 3,
    name: 'Extended Silence',
    severity: 'critical',
    check: (c) => c.daysSinceActivity >= 14,
    message: (c) =>
      `No activity of any kind for ${Math.floor(c.daysSinceActivity)} consecutive days`,
  },
];

Deno.serve(async (req) => {
  // Allow CORS for local testing
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
      },
    });
  }

  try {
    // Use service role for full DB access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const now = new Date();
    const results: { caseId: string; rule: number; action: string }[] = [];

    // ── Fetch all active cases ─────────────────────────────
    const { data: cases, error: casesError } = await supabase
      .from('cases')
      .select('id, client_id, title')
      .eq('status', 'active');

    if (casesError) throw casesError;
    if (!cases?.length) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No active cases', processed: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    for (const c of cases) {
      // Get last activity timestamp
      const { data: lastEvent } = await supabase
        .from('timeline_events')
        .select('created_at')
        .eq('case_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActivity = lastEvent?.created_at
        ? new Date(lastEvent.created_at)
        : new Date(0);

      const daysSinceActivity =
        (now.getTime() - lastActivity.getTime()) / 86_400_000;

      // Get missed deadlines (past due, still 'pending')
      const { data: missedDeadlines } = await supabase
        .from('deadlines')
        .select('id, title, due_date')
        .eq('case_id', c.id)
        .eq('status', 'pending')
        .lt('due_date', now.toISOString());

      // Get already-open flag rule IDs for this case
      const { data: openFlagRows } = await supabase
        .from('nde_flags')
        .select('rule_id')
        .eq('case_id', c.id)
        .is('resolved_at', null);

      const openFlags = (openFlagRows ?? []).map((f) => f.rule_id as number);

      const caseData: CaseData = {
        id: c.id,
        client_id: c.client_id,
        title: c.title,
        daysSinceActivity,
        missedDeadlines: missedDeadlines ?? [],
        openFlags,
      };

      // ── Evaluate each rule ──────────────────────────────
      for (const rule of MVP_RULES) {
        // Skip if flag already open for this rule
        if (openFlags.includes(rule.id)) continue;

        if (rule.check(caseData)) {
          // Insert NDE flag
          const { error: flagError } = await supabase
            .from('nde_flags')
            .insert({
              case_id:      c.id,
              rule_id:      rule.id,
              severity:     rule.severity,
              triggered_at: now.toISOString(),
            });

          if (flagError) {
            console.error(`Flag insert error case ${c.id} rule ${rule.id}:`, flagError);
            continue;
          }

          // Write immutable timeline event
          await supabase.from('timeline_events').insert({
            case_id:             c.id,
            actor_id:            SYSTEM_ACTOR,
            event_type:          'nde_flag',
            payload: {
              rule_id:  rule.id,
              rule_name: rule.name,
              severity: rule.severity,
              message:  rule.message(caseData),
            },
            is_system_generated: true,
          });

          // Mark any related deadlines as missed
          if (rule.id === 2 && missedDeadlines?.length) {
            const deadlineIds = missedDeadlines.map((d) => d.id);
            await supabase
              .from('deadlines')
              .update({ status: 'missed' })
              .in('id', deadlineIds);
          }

          results.push({
            caseId: c.id,
            rule: rule.id,
            action: `flagged:${rule.severity}`,
          });
        }
      }

      // ── Recalculate health score ───────────────────────
      if (results.some((r) => r.caseId === c.id)) {
        await supabase.rpc('calculate_health_score', { p_case_id: c.id });
      }
    }

    console.log(
      `[NDE] Processed ${cases.length} cases. Flagged: ${results.length}`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        processed: cases.length,
        flagged: results.length,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[NDE] Fatal error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
