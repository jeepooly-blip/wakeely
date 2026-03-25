import { NextResponse }      from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime     = 'nodejs';
export const maxDuration = 300; // 5 min max

// ── System actor UUID for all NDE-generated rows ───────────────
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

// ─────────────────────────────────────────────────────────────────
// Negligence Detection Engine — MVP Rule Set (PRD Section 5.1)
//
// Rule 1 — Inactivity Flag
//   Trigger:  No lawyer update OR document upload for ≥ 7 days
//   Severity: MEDIUM
//   Action:   Client alert + suggested reminder draft
//
// Rule 2 — Deadline Miss
//   Trigger:  Court/submission date passed with no completion logged
//   Severity: HIGH
//   Action:   Critical alert + escalation CTA surfaced
//
// Rule 3 — Extended Silence
//   Trigger:  No activity of ANY kind for ≥ 14 consecutive days
//   Severity: CRITICAL
//   Action:   Escalation toolkit auto-surfaced; health_score impacted
//
// CRITICAL DISCLAIMER:
//   NDE flags are informational only. The engine identifies observable
//   inactivity patterns — it does NOT make legal findings or determinations
//   of professional negligence. The client decides every action.
// ─────────────────────────────────────────────────────────────────

type Supabase = ReturnType<typeof createAdminClient>;

interface CaseRow {
  id:         string;
  client_id:  string;
  title:      string;
  created_at: string;
  health_score: number;
}

interface FlagResult {
  case_id:  string;
  rule_id:  number;
  severity: string;
  action:   string;
}

export async function GET(request: Request) {
  // ── Auth: verify Vercel cron secret ───────────────────────────
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb  = createAdminClient();
  const now = new Date();
  const results: FlagResult[] = [];
  const errors:  string[]     = [];

  try {
    // ── 1. Fetch all active cases ────────────────────────────────
    const { data: cases, error: casesErr } = await sb
      .from('cases')
      .select('id, client_id, title, created_at, health_score')
      .eq('status', 'active');

    if (casesErr) throw casesErr;
    if (!cases?.length) {
      return NextResponse.json({ ok: true, message: 'No active cases', processed: 0 });
    }

    // ── Process Rule 1 + Rule 3 per case ─────────────────────────
    for (const c of cases as CaseRow[]) {
      try {
        await processRules1and3(sb, c, now, results);
      } catch (e) {
        errors.push(`case ${c.id}: ${String(e)}`);
      }
    }

    // ── Rule 2: Deadline Miss (global scan) ──────────────────────
    try {
      await processRule2(sb, cases as CaseRow[], now, results);
    } catch (e) {
      errors.push(`rule2: ${String(e)}`);
    }

    // ── Recalculate health scores for all flagged cases ───────────
    const flaggedCaseIds = [...new Set(results.map((r) => r.case_id))];
    for (const caseId of flaggedCaseIds) {
      await recalcHealth(sb, caseId);
    }

    // ── Send notifications for new critical/high flags ────────────
    for (const flag of results.filter((r) =>
      r.severity === 'critical' || r.severity === 'high'
    )) {
      await sendFlagNotification(sb, flag, now).catch((e) =>
        errors.push(`notify ${flag.case_id}: ${String(e)}`)
      );
    }

    console.log(
      `[NDE] ${now.toISOString()} | cases: ${cases.length} | flagged: ${results.length} | errors: ${errors.length}`
    );

    return NextResponse.json({
      ok:           true,
      processed:    cases.length,
      flagged:      results.length,
      errors_count: errors.length,
      results,
      errors,
      ran_at:       now.toISOString(),
    });

  } catch (err) {
    console.error('[NDE] Fatal:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// RULE 1 — Inactivity Flag (≥7 days, < 14 days) → MEDIUM
// RULE 3 — Extended Silence (≥14 days)           → CRITICAL
// ═══════════════════════════════════════════════════════════════
async function processRules1and3(
  sb:      Supabase,
  c:       CaseRow,
  now:     Date,
  results: FlagResult[]
) {
  // Fetch the latest timeline event for this case
  const { data: lastEvt } = await sb
    .from('timeline_events')
    .select('created_at')
    .eq('case_id', c.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback to case creation date if no events yet
  const lastActivityAt = lastEvt?.created_at
    ? new Date(lastEvt.created_at)
    : new Date(c.created_at);

  const daysSince = (now.getTime() - lastActivityAt.getTime()) / 86_400_000;

  // ── Rule 3 takes precedence over Rule 1 (≥14 days) ───────────
  if (daysSince >= 14) {
    const already = await hasOpenFlag(sb, c.id, 3);
    if (!already) {
      await insertFlag(sb, c.id, 3, 'critical', now.toISOString());
      await insertTimelineEvent(sb, c.id, {
        rule_id:     3,
        rule_name:   'Extended Silence',
        severity:    'critical',
        days_silent: Math.floor(daysSince),
        message:     `No activity of any kind for ${Math.floor(daysSince)} consecutive days`,
      });
      // Auto-close any open Rule 1 flag (it's now superseded by Rule 3)
      await sb
        .from('nde_flags')
        .update({ resolved_at: now.toISOString(), action_taken: 'superseded_by_rule3' })
        .eq('case_id', c.id)
        .eq('rule_id', 1)
        .is('resolved_at', null);

      results.push({ case_id: c.id, rule_id: 3, severity: 'critical', action: 'flagged' });
    }
    return; // Rule 3 active — skip Rule 1 for this case
  }

  // ── Rule 1: 7 ≤ days < 14 ────────────────────────────────────
  if (daysSince >= 7) {
    const already = await hasOpenFlag(sb, c.id, 1);
    if (!already) {
      await insertFlag(sb, c.id, 1, 'medium', now.toISOString());
      await insertTimelineEvent(sb, c.id, {
        rule_id:     1,
        rule_name:   'Inactivity Flag',
        severity:    'medium',
        days_silent: Math.floor(daysSince),
        message:     `No lawyer update or document upload for ${Math.floor(daysSince)} days`,
      });
      results.push({ case_id: c.id, rule_id: 1, severity: 'medium', action: 'flagged' });
    }
  } else {
    // ── Auto-resolve stale Rule 1 flag if activity resumed ──────
    const { data: openRule1 } = await sb
      .from('nde_flags')
      .select('id')
      .eq('case_id', c.id)
      .eq('rule_id', 1)
      .is('resolved_at', null)
      .maybeSingle();

    if (openRule1) {
      await sb
        .from('nde_flags')
        .update({ resolved_at: now.toISOString(), action_taken: 'auto_resolved_activity_resumed' })
        .eq('id', openRule1.id);

      await insertTimelineEvent(sb, c.id, {
        rule_id:  1,
        message:  'Inactivity flag auto-resolved — activity resumed',
        resolved: true,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RULE 2 — Deadline Miss → HIGH
// ═══════════════════════════════════════════════════════════════
async function processRule2(
  sb:      Supabase,
  cases:   CaseRow[],
  now:     Date,
  results: FlagResult[]
) {
  const caseIds = cases.map((c) => c.id);
  if (!caseIds.length) return;

  // Find all pending deadlines that are now past due
  const { data: missed, error } = await sb
    .from('deadlines')
    .select('id, case_id, title, due_date, type')
    .in('case_id', caseIds)
    .eq('status', 'pending')
    .lt('due_date', now.toISOString()); // strictly before now

  if (error) throw error;
  if (!missed?.length) return;

  for (const dl of missed) {
    // Only flag if no open Rule 2 flag for this case already
    const already = await hasOpenFlag(sb, dl.case_id, 2);

    if (!already) {
      await insertFlag(sb, dl.case_id, 2, 'high', now.toISOString());
      await insertTimelineEvent(sb, dl.case_id, {
        rule_id:        2,
        rule_name:      'Deadline Miss',
        severity:       'high',
        deadline_id:    dl.id,
        deadline_title: dl.title,
        deadline_type:  dl.type,
        due_date:       dl.due_date,
        message:        `Deadline missed: "${dl.title}" — due ${dl.due_date.split('T')[0]}`,
      });
      results.push({ case_id: dl.case_id, rule_id: 2, severity: 'high', action: 'flagged' });
    }

    // Always mark the deadline row itself as missed
    await sb
      .from('deadlines')
      .update({ status: 'missed' })
      .eq('id', dl.id);
  }
}

// ═══════════════════════════════════════════════════════════════
// HEALTH SCORE recalculation
// Formula: 100 − (open flags penalty) − (missed deadlines penalty) − (inactivity penalty)
// ═══════════════════════════════════════════════════════════════
async function recalcHealth(sb: Supabase, caseId: string) {
  let score = 100;

  // Open flags penalty
  const { data: openFlags } = await sb
    .from('nde_flags')
    .select('severity')
    .eq('case_id', caseId)
    .is('resolved_at', null);

  for (const f of openFlags ?? []) {
    const penalty = { critical: 35, high: 25, medium: 15, low: 5 };
    score -= penalty[(f.severity as keyof typeof penalty)] ?? 10;
  }

  // Missed deadlines penalty
  const { count: missedCount } = await sb
    .from('deadlines')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .eq('status', 'missed');

  score -= (missedCount ?? 0) * 10;

  // Clamp to [0, 100]
  score = Math.max(0, Math.min(100, score));

  await sb.from('cases').update({ health_score: score }).eq('id', caseId);
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION: send email for critical/high flags
// ═══════════════════════════════════════════════════════════════
async function sendFlagNotification(sb: Supabase, flag: FlagResult, now: Date) {
  if (!process.env.RESEND_API_KEY) return;

  // Get case + client info
  const { data: caseRow } = await sb
    .from('cases')
    .select('title, client_id')
    .eq('id', flag.case_id)
    .maybeSingle();

  if (!caseRow) return;

  const { data: user } = await sb
    .from('users')
    .select('email, locale, notification_email, quiet_hours_start, quiet_hours_end')
    .eq('id', caseRow.client_id)
    .maybeSingle();

  if (!user?.notification_email || !user?.email) return;

  // Quiet hours check
  const [qhS] = (user.quiet_hours_start ?? '22:00').split(':').map(Number);
  const [qhE] = (user.quiet_hours_end   ?? '07:00').split(':').map(Number);
  const h     = now.getUTCHours();
  const quiet = qhS > qhE ? (h >= qhS || h < qhE) : (h >= qhS && h < qhE);
  if (quiet) return;

  const isAr = user.locale === 'ar';

  const subjects: Record<number, Record<string, string>> = {
    1: {
      en: `Attention: No lawyer activity on "${caseRow.title}" — Wakeela`,
      ar: `تنبيه: لا يوجد نشاط للمحامي في "${caseRow.title}" — وكيلا`,
    },
    2: {
      en: `Action Required: Missed deadline on "${caseRow.title}" — Wakeela`,
      ar: `يلزم إجراء: موعد فائت في "${caseRow.title}" — وكيلا`,
    },
    3: {
      en: `URGENT: Extended silence on "${caseRow.title}" — Wakeela`,
      ar: `عاجل: صمت مطوّل في "${caseRow.title}" — وكيلا`,
    },
  };

  const subject = subjects[flag.rule_id]?.[isAr ? 'ar' : 'en'] ?? 'Wakeela Alert';
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    process.env.RESEND_FROM_EMAIL ?? 'noreply@wakeela.com',
      to:      [user.email],
      subject,
      html:    buildAlertEmail(flag, caseRow.title, isAr, appUrl),
    }),
  });
}

function buildAlertEmail(
  flag:       FlagResult,
  caseTitle:  string,
  isAr:       boolean,
  appUrl:     string
): string {
  const dir   = isAr ? 'rtl' : 'ltr';
  const clr   = flag.severity === 'critical' ? '#ef4444'
              : flag.severity === 'high'     ? '#f97316'
              : '#f59e0b';

  const ruleNames: Record<number, Record<string, string>> = {
    1: { en: 'Lawyer Inactivity',  ar: 'تقصير المحامي'  },
    2: { en: 'Missed Deadline',    ar: 'موعد قضائي فائت' },
    3: { en: 'Extended Silence',   ar: 'صمت مطوّل'      },
  };

  const ruleName = ruleNames[flag.rule_id]?.[isAr ? 'ar' : 'en'] ?? `Rule ${flag.rule_id}`;

  const body = isAr
    ? `تم رصد تنبيه <strong>${ruleName}</strong> على قضيتك <strong>${caseTitle}</strong>. سجّل دخولك إلى وكيلا لاتخاذ الإجراء المناسب.`
    : `A <strong>${ruleName}</strong> alert has been detected on your case <strong>${caseTitle}</strong>. Log in to Wakeela to take action.`;

  const btnText = isAr ? 'عرض التنبيه' : 'View Alert';
  const disc    = isAr
    ? 'وكيلا لا تقدم استشارات قانونية. التنبيهات استرشادية فحسب ولا تُعدّ أحكاماً قانونية بالإهمال.'
    : 'Wakeela does not provide legal advice. Alerts are informational only and do not constitute legal findings of negligence.';

  const font = isAr ? "'IBM Plex Arabic', Arial" : "'Inter', Arial";

  return `<!DOCTYPE html><html dir="${dir}" lang="${isAr ? 'ar' : 'en'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${font},sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);
         border-top:4px solid ${clr}">
  <tr><td style="background:#1A3557;padding:18px 24px">
    <span style="color:#C89B3C;font-size:20px;font-weight:900">WAKEELA · وكيلا</span>
  </td></tr>
  <tr><td style="padding:28px">
    <div style="display:inline-block;background:${clr};color:#fff;padding:3px 12px;
         border-radius:20px;font-size:11px;font-weight:700;margin-bottom:14px;text-transform:uppercase">
      ${flag.severity}
    </div>
    <p style="font-size:16px;color:#111827;font-weight:600;margin:0 0 10px">${ruleName}</p>
    <p style="font-size:14px;color:#374151;margin:0 0 22px">${body}</p>
    <a href="${appUrl}/en/alerts"
       style="display:inline-block;background:#1A3557;color:#fff;padding:11px 26px;
              border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
      ${btnText}
    </a>
  </td></tr>
  <tr><td style="padding:14px 28px;border-top:1px solid #f0f0f0">
    <p style="font-size:10px;color:#9ca3af;margin:0">${disc}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// DB HELPERS
// ═══════════════════════════════════════════════════════════════
async function hasOpenFlag(sb: Supabase, caseId: string, ruleId: number): Promise<boolean> {
  const { data } = await sb
    .from('nde_flags')
    .select('id')
    .eq('case_id', caseId)
    .eq('rule_id', ruleId)
    .is('resolved_at', null)
    .maybeSingle();
  return !!data;
}

async function insertFlag(
  sb:          Supabase,
  caseId:      string,
  ruleId:      number,
  severity:    string,
  triggeredAt: string
) {
  const { error } = await sb.from('nde_flags').insert({
    case_id:      caseId,
    rule_id:      ruleId,
    severity,
    triggered_at: triggeredAt,
  });
  if (error) throw error;
}

async function insertTimelineEvent(
  sb:      Supabase,
  caseId:  string,
  payload: Record<string, unknown>
) {
  const { error } = await sb.from('timeline_events').insert({
    case_id:             caseId,
    actor_id:            SYSTEM_ACTOR,
    event_type:          'nde_flag',
    payload,
    is_system_generated: true,
    // created_at is set by DB default — immutable after insert
  });
  if (error) throw error;
}
