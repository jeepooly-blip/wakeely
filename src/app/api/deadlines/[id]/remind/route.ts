import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/deadlines/[id]/remind
 * Manually triggers a reminder for a specific deadline.
 * Calls the Supabase Edge Function `send-reminder`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Read locale from request body if provided (client sends URL locale).
  // Falls back to user's stored DB locale, then 'en'.
  let requestLocale: string | undefined;
  try {
    const body = await request.clone().json();
    requestLocale = body?.locale;
  } catch { /* no body is fine */ }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch deadline + case + user profile
  const { data: deadline } = await supabase
    .from('deadlines')
    .select(`
      id, title, due_date, type, status,
      cases!inner(id, title, client_id)
    `)
    .eq('id', id)
    .eq('cases.client_id', user.id)
    .maybeSingle();

  if (!deadline) {
    return NextResponse.json({ error: 'Deadline not found' }, { status: 404 });
  }

  if (deadline.status !== 'pending') {
    return NextResponse.json({ error: 'Cannot remind on a completed or missed deadline' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('email, phone, locale, notification_email, notification_whatsapp')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  // Resolve locale: URL param > DB column > 'en' (never default to Arabic silently)
  const effectiveLocale = (requestLocale ?? profile.locale ?? 'en') as 'en' | 'ar';

  const dueDate = new Date(deadline.due_date);
  const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  let emailSent = false;
  let whatsappSent = false;
  const errors: string[] = [];

  const caseTitle = (deadline.cases as unknown as { title: string }).title;

  // ── Send Email via Resend ─────────────────────────────────
  if (profile.notification_email && profile.email) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const isAr = effectiveLocale === 'ar';
        const subject = daysUntil === 0
          ? (isAr ? `اليوم: ${deadline.title}` : `TODAY: ${deadline.title}`)
          : daysUntil === 1
          ? (isAr ? `غداً: ${deadline.title}` : `Tomorrow: ${deadline.title}`)
          : (isAr
            ? `موعد بعد ${daysUntil} أيام: ${deadline.title}`
            : `In ${daysUntil} days: ${deadline.title}`);

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    process.env.RESEND_FROM_EMAIL ?? 'noreply@wakeela.com',
            to:      [profile.email],
            subject,
            html:    buildReminderEmail(deadline.title, caseTitle, deadline.type, daysUntil, effectiveLocale),
          }),
        });

        if (emailRes.ok) emailSent = true;
        else errors.push(`email: ${await emailRes.text()}`);
      } catch (e) {
        errors.push(`email: ${String(e)}`);
      }
    }
  }

  // ── Send WhatsApp via Cloud API ──────────────────────────
  if (profile.notification_whatsapp && profile.phone) {
    const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (waToken && waPhone) {
      try {
        const isAr      = effectiveLocale === 'ar';
        const daysText  = daysUntil === 0
          ? (isAr ? 'اليوم' : 'today')
          : daysUntil === 1
          ? (isAr ? 'غداً' : 'tomorrow')
          : (isAr ? `بعد ${daysUntil} أيام` : `in ${daysUntil} days`);

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
              to:                profile.phone.replace(/\D/g, ''),
              type:              'template',
              template: {
                name:     'wakeela_deadline_reminder',
                language: { code: isAr ? 'ar' : 'en_US' },
                components: [{
                  type:       'body',
                  parameters: [
                    { type: 'text', text: deadline.title },
                    { type: 'text', text: caseTitle },
                    { type: 'text', text: daysText },
                  ],
                }],
              },
            }),
          }
        );

        if (waRes.ok) whatsappSent = true;
        else errors.push(`whatsapp: ${await waRes.text()}`);
      } catch (e) {
        errors.push(`whatsapp: ${String(e)}`);
      }
    }
  }

  // ── Log reminder sent in timeline ──────────────────────
  const caseId = (deadline.cases as unknown as { id: string }).id;
  await supabase.from('timeline_events').insert({
    case_id:             caseId,
    actor_id:            user.id,
    event_type:          'deadline_reminder_sent',
    payload: {
      deadline_id:  id,
      title:        deadline.title,
      days_until:   daysUntil,
      email_sent:   emailSent,
      wa_sent:      whatsappSent,
      triggered_by: 'manual',
    },
    is_system_generated: false,
  });

  return NextResponse.json({
    ok:            true,
    email_sent:    emailSent,
    whatsapp_sent: whatsappSent,
    errors,
  });
}

// ── Email HTML builder ────────────────────────────────────────
function buildReminderEmail(
  title:     string,
  caseTitle: string,
  type:      string,
  days:      number,
  locale:    string
): string {
  const isAr = locale === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';

  const typeLabel: Record<string, Record<string, string>> = {
    court:      { en: 'Court Hearing', ar: 'جلسة استماع' },
    submission: { en: 'Submission Deadline', ar: 'موعد تقديم' },
    internal:   { en: 'Internal Reminder', ar: 'تذكير داخلي' },
  };

  const typeText = typeLabel[type]?.[isAr ? 'ar' : 'en'] ?? type;

  const daysText = days === 0
    ? (isAr ? '<strong>اليوم</strong>' : '<strong>TODAY</strong>')
    : days === 1
    ? (isAr ? '<strong>غداً</strong>' : '<strong>tomorrow</strong>')
    : (isAr ? `بعد <strong>${days} أيام</strong>` : `in <strong>${days} days</strong>`);

  const headline = isAr
    ? `تذكير: <strong>${title}</strong> ${daysText}`
    : `Reminder: <strong>${title}</strong> is due ${daysText}`;

  const caseInfo = isAr
    ? `القضية: <strong>${caseTitle}</strong>`
    : `Case: <strong>${caseTitle}</strong>`;

  const typeInfo = isAr
    ? `النوع: ${typeText}`
    : `Type: ${typeText}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  const btnText = isAr ? 'فتح وكيلا' : 'Open Wakeela';
  const disclaimer = isAr
    ? 'وكيلا لا تقدم استشارات قانونية. التنبيهات استرشادية فحسب.'
    : 'Wakeela does not provide legal advice. Alerts are informational only.';

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${isAr ? "'IBM Plex Arabic',Arial" : "'Inter',Arial"},sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#1A3557;padding:20px 28px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="color:#C89B3C;font-size:22px;font-weight:900;letter-spacing:1px">WAKEELA · وكيلا</span></td>
              <td align="${isAr ? 'left' : 'right'}">
                <span style="background:${days <= 1 ? '#ef4444' : days <= 3 ? '#f97316' : '#0E7490'};
                  color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">
                  ${days === 0 ? (isAr ? 'اليوم' : 'TODAY')
                    : days === 1 ? (isAr ? 'غداً' : 'TOMORROW')
                    : isAr ? `${days} أيام` : `${days} DAYS`}
                </span>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px">
          <p style="font-size:16px;color:#111827;margin:0 0 12px">${headline}</p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 6px">${caseInfo}</p>
          <p style="font-size:13px;color:#9ca3af;margin:0 0 24px">${typeInfo}</p>
          <a href="${appUrl}/${locale}/deadlines"
             style="display:inline-block;background:#1A3557;color:#fff;padding:12px 28px;
                    border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">
            ${btnText}
          </a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0">
          <p style="font-size:11px;color:#9ca3af;margin:0">${disclaimer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
