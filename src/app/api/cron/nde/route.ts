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

    // ── Rule 4: Chat Non-Response (48 h) ─────────────────────────
    try {
      await processRule4(sb, cases as CaseRow[], now, results);
    } catch (e) {
      errors.push(`rule4: ${String(e)}`);
    }

    // ── Rule 5: Document Request Ignored (5 days) ─────────────────
    try {
      await processRule5(sb, cases as CaseRow[], now, results);
    } catch (e) {
      errors.push(`rule5: ${String(e)}`);
    }

    // ── Rule 6: Hearing Proximity Alert (≤3 days) ─────────────────
    try {
      await processRule6(sb, cases as CaseRow[], now, results);
    } catch (e) {
      errors.push(`rule6: ${String(e)}`);
    }

    // ── Rule 7: Vault Empty Warning (7+ days old, no docs) ────────
    try {
      await processRule7(sb, cases as CaseRow[], now, results);
    } catch (e) {
      errors.push(`rule7: ${String(e)}`);
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
    .select('email, phone, locale, notification_email, notification_whatsapp, quiet_hours_start, quiet_hours_end')
    .eq('id', caseRow.client_id)
    .maybeSingle();

  if (!user?.email) return;

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
    4: {
      en: `Your lawyer hasn't replied to your message — "${caseRow.title}" — Wakeela`,
      ar: `محاميك لم يردّ على رسالتك في "${caseRow.title}" — وكيلا`,
    },
    5: {
      en: `Document request unanswered (5 days) — "${caseRow.title}" — Wakeela`,
      ar: `طلب المستند لم يُنفَّذ منذ 5 أيام في "${caseRow.title}" — وكيلا`,
    },
    6: {
      en: `⚠️ URGENT: Hearing in ≤3 days, no lawyer activity — "${caseRow.title}" — Wakeela`,
      ar: `⚠️ عاجل: جلسة خلال 3 أيام ولا يوجد نشاط للمحامي في "${caseRow.title}" — وكيلا`,
    },
    7: {
      en: `Reminder: Your evidence vault is empty — "${caseRow.title}" — Wakeela`,
      ar: `تذكير: خزنة الأدلة فارغة في "${caseRow.title}" — وكيلا`,
    },
  };

  const subject = subjects[flag.rule_id]?.[isAr ? 'ar' : 'en'] ?? 'Wakeela Alert';
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';

  // ── Email ─────────────────────────────────────────────────────
  if (user.notification_email !== false) {
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
    }).catch(() => {});
  }

  // ── WhatsApp + SMS fallback — Rule 6 only (hearing proximity = urgent push) ──
  const waToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (
    flag.rule_id === 6 &&
    user.phone
  ) {
    const waBody = isAr
      ? `⚠️ وكيلا: جلستك القضائية في "${caseRow.title}" خلال 3 أيام أو أقل. لم يُسجَّل أي نشاط من محاميك في الـ 48 ساعة الماضية. سجّل دخولك لاتخاذ إجراء.`
      : `⚠️ Wakeela: Your court hearing for "${caseRow.title}" is in 3 days or less. No lawyer activity has been recorded in the past 48 hours. Log in to take action.`;

    const smsBody = isAr
      ? `وكيلا: جلستك في "${caseRow.title.slice(0, 30)}" خلال 3 أيام. لا يوجد نشاط من محاميك. سجّل دخولك الآن.`
      : `Wakeela: Court hearing for "${caseRow.title.slice(0, 30)}" in 3 days. No lawyer activity recorded. Log in now.`;

    const { sendWhatsAppWithSMSFallback } = await import('@/lib/notify');
    await sendWhatsAppWithSMSFallback({
      phone:                user.phone,
      message:              waBody,
      smsMessage:           smsBody,
      notification_whatsapp: user.notification_whatsapp !== false,
    }).catch(() => {});
  }
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
    1: { en: 'Lawyer Inactivity',          ar: 'تقصير المحامي'            },
    2: { en: 'Missed Deadline',            ar: 'موعد قضائي فائت'          },
    3: { en: 'Extended Silence',           ar: 'صمت مطوّل'               },
    4: { en: 'Unanswered Message (48 h)',  ar: 'رسالة بدون ردّ (48 ساعة)' },
    5: { en: 'Document Request Ignored',  ar: 'طلب مستند مُهمَل'          },
    6: { en: 'Hearing Proximity Alert',   ar: 'تنبيه اقتراب الجلسة'       },
    7: { en: 'Vault Empty Warning',       ar: 'تحذير: الخزنة فارغة'       },
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

// ═══════════════════════════════════════════════════════════════
// RULE 4 — Chat Non-Response (48 h) → MEDIUM
//
// Trigger: client sent a message to a lawyer-assigned case;
//          no reply from any lawyer on that case within 48 hours.
// ═══════════════════════════════════════════════════════════════
async function processRule4(
  sb:      Supabase,
  cases:   CaseRow[],
  now:     Date,
  results: FlagResult[]
) {
  const cutoff48h = new Date(now.getTime() - 48 * 3_600_000).toISOString();

  for (const c of cases) {
    try {
      // Only evaluate cases that have an active lawyer assigned
      const { data: lawyers } = await sb
        .from('case_lawyers')
        .select('lawyer_id')
        .eq('case_id', c.id)
        .eq('status', 'active')
        .limit(1);

      if (!lawyers?.length) continue; // no lawyer assigned — skip

      const lawyerIds = lawyers.map((l: { lawyer_id: string }) => l.lawyer_id);

      // Find the most recent client message older than 48 h with no lawyer reply after it
      const { data: clientMsgs } = await sb
        .from('chat_messages')
        .select('id, created_at')
        .eq('case_id', c.id)
        .eq('sender_id', c.client_id)
        .lt('created_at', cutoff48h)         // older than 48 h
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!clientMsgs?.length) continue; // no client messages

      const lastClientMsg = clientMsgs[0];

      // Check if any lawyer replied AFTER the client's last message
      const { data: lawyerReply } = await sb
        .from('chat_messages')
        .select('id')
        .eq('case_id', c.id)
        .in('sender_id', lawyerIds)
        .gt('created_at', lastClientMsg.created_at)
        .is('deleted_at', null)
        .limit(1);

      if (lawyerReply?.length) continue; // lawyer replied — no flag needed

      // No reply — create flag if not already open
      const already = await hasOpenFlag(sb, c.id, 4);
      if (!already) {
        await insertFlag(sb, c.id, 4, 'medium', now.toISOString());
        await insertTimelineEvent(sb, c.id, {
          rule_id:            4,
          rule_name:          'Chat Non-Response',
          severity:           'medium',
          last_client_msg_at: lastClientMsg.created_at,
          message:            'No lawyer reply within 48 hours of client message',
        });
        results.push({ case_id: c.id, rule_id: 4, severity: 'medium', action: 'flagged' });
      }
    } catch (e) {
      // Per-case error — continue processing remaining cases
      console.error(`[NDE R4] case ${c.id}:`, e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RULE 5 — Document Request Ignored (5 days) → MEDIUM
//
// Trigger: a lawyer logged an action_type='document_request';
//          no document was uploaded to that case in the
//          following 5 days.
// ═══════════════════════════════════════════════════════════════
async function processRule5(
  sb:      Supabase,
  cases:   CaseRow[],
  now:     Date,
  results: FlagResult[]
) {
  const caseIds = cases.map((c) => c.id);
  if (!caseIds.length) return;

  const cutoff5d = new Date(now.getTime() - 5 * 86_400_000).toISOString();

  // Find all document_request action logs older than 5 days
  const { data: requests, error } = await sb
    .from('action_logs')
    .select('id, case_id, created_at')
    .in('case_id', caseIds)
    .eq('action_type', 'document_request')
    .lt('created_at', cutoff5d);

  if (error) throw error;
  if (!requests?.length) return;

  for (const req of requests) {
    try {
      // Check if any document was uploaded to this case after the request
      const { data: docs } = await sb
        .from('documents')
        .select('id')
        .eq('case_id', req.case_id)
        .gt('created_at', req.created_at)
        .limit(1);

      if (docs?.length) continue; // document was uploaded — no flag

      const already = await hasOpenFlag(sb, req.case_id, 5);
      if (!already) {
        await insertFlag(sb, req.case_id, 5, 'medium', now.toISOString());
        await insertTimelineEvent(sb, req.case_id, {
          rule_id:     5,
          rule_name:   'Document Request Ignored',
          severity:    'medium',
          request_at:  req.created_at,
          message:     'Document requested by lawyer 5+ days ago — no upload received',
        });
        results.push({ case_id: req.case_id, rule_id: 5, severity: 'medium', action: 'flagged' });
      }
    } catch (e) {
      console.error(`[NDE R5] case ${req.case_id}:`, e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RULE 6 — Hearing Proximity Alert (≤3 days, no activity) → HIGH
//
// Trigger: a court deadline is due within 3 days AND no lawyer
//          action_log or document upload in the preceding 48 h.
// Auto-action: email + WhatsApp push to client.
// ═══════════════════════════════════════════════════════════════
async function processRule6(
  sb:      Supabase,
  cases:   CaseRow[],
  now:     Date,
  results: FlagResult[]
) {
  const caseIds   = cases.map((c) => c.id);
  if (!caseIds.length) return;

  const in3Days   = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const ago48h    = new Date(now.getTime() - 48 * 3_600_000).toISOString();

  // Find pending court deadlines due within 3 days
  const { data: upcoming, error } = await sb
    .from('deadlines')
    .select('id, case_id, title, due_date')
    .in('case_id', caseIds)
    .eq('type', 'court')
    .eq('status', 'pending')
    .gte('due_date', now.toISOString())  // not yet past
    .lte('due_date', in3Days);

  if (error) throw error;
  if (!upcoming?.length) return;

  for (const dl of upcoming) {
    try {
      // Check for any lawyer action_log in the last 48 h
      const { data: recentLog } = await sb
        .from('action_logs')
        .select('id')
        .eq('case_id', dl.case_id)
        .gte('created_at', ago48h)
        .limit(1);

      // Check for any document upload in the last 48 h
      const { data: recentDoc } = await sb
        .from('documents')
        .select('id')
        .eq('case_id', dl.case_id)
        .gte('created_at', ago48h)
        .limit(1);

      const hasActivity = recentLog?.length || recentDoc?.length;
      if (hasActivity) continue; // lawyer is active — no flag

      const already = await hasOpenFlag(sb, dl.case_id, 6);
      if (!already) {
        await insertFlag(sb, dl.case_id, 6, 'high', now.toISOString());
        await insertTimelineEvent(sb, dl.case_id, {
          rule_id:        6,
          rule_name:      'Hearing Proximity Alert',
          severity:       'high',
          deadline_id:    dl.id,
          deadline_title: dl.title,
          due_date:       dl.due_date,
          message:        `Court hearing "${dl.title}" in ≤3 days — no lawyer activity in last 48 h`,
        });
        results.push({ case_id: dl.case_id, rule_id: 6, severity: 'high', action: 'flagged' });
      }
    } catch (e) {
      console.error(`[NDE R6] case ${dl.case_id}:`, e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RULE 7 — Vault Empty Warning (7+ days old, zero docs) → LOW
//
// Trigger: case is 7+ days old and has zero documents uploaded.
// Auto-action: gentle nudge notification to client only.
// ═══════════════════════════════════════════════════════════════
async function processRule7(
  sb:      Supabase,
  cases:   CaseRow[],
  now:     Date,
  results: FlagResult[]
) {
  const cutoff7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  // Filter to cases that are 7+ days old
  const oldCases = cases.filter((c) => c.created_at < cutoff7d);
  if (!oldCases.length) return;

  const oldCaseIds = oldCases.map((c) => c.id);

  // Find which of those case IDs already have at least one document
  const { data: casesWithDocs, error } = await sb
    .from('documents')
    .select('case_id')
    .in('case_id', oldCaseIds);

  if (error) throw error;

  const caseIdsWithDocs = new Set(
    (casesWithDocs ?? []).map((d: { case_id: string }) => d.case_id)
  );

  for (const c of oldCases) {
    if (caseIdsWithDocs.has(c.id)) continue; // has documents — skip

    try {
      const already = await hasOpenFlag(sb, c.id, 7);
      if (!already) {
        await insertFlag(sb, c.id, 7, 'low', now.toISOString());
        await insertTimelineEvent(sb, c.id, {
          rule_id:  7,
          rule_name: 'Vault Empty Warning',
          severity: 'low',
          days_old: Math.floor(
            (now.getTime() - new Date(c.created_at).getTime()) / 86_400_000
          ),
          message:  'Case is 7+ days old with no documents in the evidence vault',
        });
        results.push({ case_id: c.id, rule_id: 7, severity: 'low', action: 'flagged' });
      }
    } catch (e) {
      console.error(`[NDE R7] case ${c.id}:`, e);
    }
  }
}
