// ============================================================
// Wakeela · Edge Function · send-reminder
// Runs on schedule (called by cron) OR ad-hoc by the API route.
// Sends email (Resend) + WhatsApp outbound reminders for deadlines
// whose reminder_days array contains today's days-until count.
//
// Deploy:
//   supabase functions deploy send-reminder
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DeadlineRow {
  id:           string;
  title:        string;
  due_date:     string;
  type:         string;
  reminder_days: number[];
  case_id:      string;
  cases: {
    title:     string;
    client_id: string;
  };
  users: {
    email:                  string;
    phone:                  string | null;
    locale:                 string;
    notification_email:     boolean;
    notification_whatsapp:  boolean;
    quiet_hours_start:      string;
    quiet_hours_end:        string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const results: { deadline_id: string; email: boolean; whatsapp: boolean; error?: string }[] = [];

  // Fetch all pending deadlines due in the next 30 days
  const { data: deadlines, error: fetchError } = await supabase
    .from('deadlines')
    .select(`
      id, title, due_date, type, reminder_days, case_id,
      cases!inner(title, client_id),
      cases!inner(users!inner(
        email, phone, locale,
        notification_email, notification_whatsapp,
        quiet_hours_start, quiet_hours_end
      ))
    `)
    .eq('status', 'pending')
    .gte('due_date', todayStr)
    .lte('due_date', new Date(now.getTime() + 30 * 86_400_000).toISOString().split('T')[0]);

  if (fetchError) {
    return new Response(
      JSON.stringify({ ok: false, error: fetchError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  for (const dl of (deadlines ?? []) as unknown as DeadlineRow[]) {
    const dueMs    = new Date(dl.due_date).getTime();
    const nowMs    = now.getTime();
    const daysLeft = Math.ceil((dueMs - nowMs) / 86_400_000);

    // Only fire if today matches a reminder_days value
    if (!dl.reminder_days.includes(daysLeft)) continue;

    const user   = dl.users;
    const result = { deadline_id: dl.id, email: false, whatsapp: false } as typeof results[0];

    // ── Quiet hours check ─────────────────────────────────
    const [qhStart] = (user.quiet_hours_start ?? '22:00').split(':').map(Number);
    const [qhEnd]   = (user.quiet_hours_end   ?? '07:00').split(':').map(Number);
    const curHour   = now.getUTCHours();
    const inQuiet   = qhStart > qhEnd
      ? curHour >= qhStart || curHour < qhEnd
      : curHour >= qhStart && curHour < qhEnd;
    if (inQuiet) {
      results.push(result);
      continue;
    }

    // ── Email ─────────────────────────────────────────────
    if (user.notification_email) {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const isAr    = user.locale === 'ar';
        const subject = daysLeft === 0
          ? (isAr ? `اليوم: ${dl.title}` : `TODAY: ${dl.title}`)
          : daysLeft === 1
          ? (isAr ? `غداً: ${dl.title}` : `Tomorrow: ${dl.title}`)
          : (isAr ? `موعد بعد ${daysLeft} أيام: ${dl.title}` : `In ${daysLeft} days: ${dl.title}`);

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@wakeela.com',
            to:   [user.email],
            subject,
            html: buildEmail(dl.title, dl.cases.title, dl.type, daysLeft, user.locale),
          }),
        });

        if (emailRes.ok) result.email = true;
        else result.error = `email_fail: ${await emailRes.text()}`;
      }
    }

    // ── WhatsApp ──────────────────────────────────────────
    if (user.notification_whatsapp && user.phone) {
      const waToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
      const waPhone = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
      if (waToken && waPhone) {
        const isAr    = user.locale === 'ar';
        const daysStr = daysLeft === 0
          ? (isAr ? 'اليوم' : 'today')
          : daysLeft === 1
          ? (isAr ? 'غداً' : 'tomorrow')
          : (isAr ? `بعد ${daysLeft} أيام` : `in ${daysLeft} days`);

        const waRes = await fetch(
          `https://graph.facebook.com/v19.0/${waPhone}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${waToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to:                user.phone.replace(/\D/g, ''),
              type:              'template',
              template: {
                name:     'wakeela_deadline_reminder',
                language: { code: isAr ? 'ar' : 'en_US' },
                components: [{
                  type:       'body',
                  parameters: [
                    { type: 'text', text: dl.title },
                    { type: 'text', text: dl.cases.title },
                    { type: 'text', text: daysStr },
                  ],
                }],
              },
            }),
          }
        );

        if (waRes.ok) result.whatsapp = true;
        else result.error = (result.error ?? '') + ` | wa_fail: ${await waRes.text()}`;
      }
    }

    // ── Log reminder in timeline ──────────────────────────
    await supabase.from('timeline_events').insert({
      case_id:             dl.case_id,
      actor_id:            '00000000-0000-0000-0000-000000000000',
      event_type:          'deadline_reminder_sent',
      payload: {
        deadline_id:  dl.id,
        title:        dl.title,
        days_until:   daysLeft,
        email_sent:   result.email,
        wa_sent:      result.whatsapp,
        triggered_by: 'cron',
      },
      is_system_generated: true,
    });

    results.push(result);
  }

  console.log(`[send-reminder] Processed ${results.length} reminder(s)`);
  return new Response(
    JSON.stringify({ ok: true, count: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

// ── Email HTML ─────────────────────────────────────────────────
function buildEmail(title: string, caseTitle: string, type: string, days: number, locale: string) {
  const isAr = locale === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  const typeLabel: Record<string, Record<string, string>> = {
    court:      { en: 'Court Hearing', ar: 'جلسة استماع' },
    submission: { en: 'Submission', ar: 'موعد تقديم' },
    internal:   { en: 'Reminder', ar: 'تذكير' },
  };
  const typeText = typeLabel[type]?.[isAr ? 'ar' : 'en'] ?? type;
  const urgentColor = days === 0 ? '#ef4444' : days <= 3 ? '#f97316' : '#1A3557';
  const daysText = days === 0
    ? (isAr ? 'اليوم' : 'Today')
    : days === 1 ? (isAr ? 'غداً' : 'Tomorrow')
    : (isAr ? `${days} أيام` : `${days} days`);

  const headline = isAr
    ? `تذكير: <b>${title}</b> — <b>${daysText}</b>`
    : `Reminder: <b>${title}</b> — due in <b>${daysText}</b>`;

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://wakeela.com';

  return `<!DOCTYPE html><html dir="${dir}" lang="${locale}">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${isAr ? "'IBM Plex Arabic'" : "'Inter'"},Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07)">
  <tr><td style="background:#1A3557;padding:18px 24px">
    <span style="color:#C89B3C;font-size:20px;font-weight:900">WAKEELA · وكيلا</span>
  </td></tr>
  <tr><td style="padding:24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td>
        <span style="background:${urgentColor};color:#fff;padding:3px 10px;border-radius:20px;
              font-size:11px;font-weight:700;display:inline-block;margin-bottom:14px">
          ${typeText} · ${daysText}
        </span>
        <p style="font-size:15px;color:#111827;margin:0 0 10px">${headline}</p>
        <p style="font-size:13px;color:#6b7280;margin:0 0 20px">
          ${isAr ? `القضية: ${caseTitle}` : `Case: ${caseTitle}`}
        </p>
        <a href="${appUrl}/${locale}/deadlines"
           style="display:inline-block;background:#1A3557;color:#fff;
                  padding:10px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px">
          ${isAr ? 'فتح وكيلا' : 'Open Wakeela'}
        </a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:12px 24px;border-top:1px solid #f0f0f0">
    <p style="font-size:10px;color:#9ca3af;margin:0">
      ${isAr ? 'وكيلا لا تقدم استشارات قانونية.' : 'Wakeela does not provide legal advice.'}
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
