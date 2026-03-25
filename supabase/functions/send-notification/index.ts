// ============================================================
// Wakeela · Supabase Edge Function · send-notification
// Handles email (Resend) + WhatsApp (Cloud API) outbound
//
// Deploy with:
//   supabase functions deploy send-notification
//
// Called by: nde-engine, deadline-reminders cron, action triggers
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationPayload {
  user_id:   string;
  channel:   'email' | 'whatsapp' | 'both';
  template:  string;
  variables: Record<string, string>;
}

// ── WhatsApp approved template IDs (Meta Business Manager) ───
// These must match your approved template names exactly.
const WA_TEMPLATES: Record<string, string> = {
  deadline_reminder:    'wakeela_deadline_reminder',
  nde_inactivity:       'wakeela_lawyer_inactivity',
  nde_deadline_miss:    'wakeela_deadline_missed',
  nde_extended_silence: 'wakeela_extended_silence',
  case_created:         'wakeela_case_created',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  let payload: NotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Fetch user info
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, phone, locale, notification_email, notification_whatsapp, quiet_hours_start, quiet_hours_end')
    .eq('id', payload.user_id)
    .maybeSingle();

  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'User not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check quiet hours (simple UTC check — Phase 2 will be timezone-aware)
  const nowUTC = new Date();
  const currentHour = nowUTC.getUTCHours();
  const [quietStart] = (user.quiet_hours_start ?? '22:00').split(':').map(Number);
  const [quietEnd]   = (user.quiet_hours_end   ?? '07:00').split(':').map(Number);
  const inQuietHours = quietStart > quietEnd
    ? currentHour >= quietStart || currentHour < quietEnd
    : currentHour >= quietStart && currentHour < quietEnd;

  const sent: string[] = [];
  const errors: string[] = [];

  // ── Email via Resend ──────────────────────────────────────
  if (
    (payload.channel === 'email' || payload.channel === 'both') &&
    user.notification_email &&
    !inQuietHours
  ) {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@wakeela.com',
            to:      [user.email],
            subject: buildEmailSubject(payload.template, payload.variables, user.locale),
            html:    buildEmailBody(payload.template, payload.variables, user.locale),
          }),
        });
        if (emailRes.ok) {
          sent.push('email');
        } else {
          const errText = await emailRes.text();
          errors.push(`email: ${errText}`);
        }
      } catch (e) {
        errors.push(`email: ${String(e)}`);
      }
    }
  }

  // ── WhatsApp via Cloud API ────────────────────────────────
  if (
    (payload.channel === 'whatsapp' || payload.channel === 'both') &&
    user.notification_whatsapp &&
    user.phone &&
    !inQuietHours
  ) {
    const WA_TOKEN  = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const WA_PHONE  = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const templateName = WA_TEMPLATES[payload.template];

    if (WA_TOKEN && WA_PHONE && templateName) {
      try {
        const waRes = await fetch(
          `https://graph.facebook.com/v19.0/${WA_PHONE}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WA_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to:                user.phone.replace(/\D/g, ''),
              type:              'template',
              template: {
                name:     templateName,
                language: { code: user.locale === 'ar' ? 'ar' : 'en_US' },
                components: [
                  {
                    type:       'body',
                    parameters: Object.values(payload.variables).map((v) => ({
                      type: 'text',
                      text: v,
                    })),
                  },
                ],
              },
            }),
          }
        );
        if (waRes.ok) {
          sent.push('whatsapp');
        } else {
          const errText = await waRes.text();
          errors.push(`whatsapp: ${errText}`);
        }
      } catch (e) {
        errors.push(`whatsapp: ${String(e)}`);
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

// ── Email builders ────────────────────────────────────────────
function buildEmailSubject(
  template: string,
  vars: Record<string, string>,
  locale: string
): string {
  const isAr = locale === 'ar';
  const subjects: Record<string, Record<string, string>> = {
    deadline_reminder: {
      en: `Reminder: "${vars.deadline_title}" is in ${vars.days_until} day(s) — Wakeela`,
      ar: `تذكير: "${vars.deadline_title}" بعد ${vars.days_until} يوم — وكيلا`,
    },
    nde_inactivity: {
      en: `Alert: No lawyer activity on "${vars.case_title}" — Wakeela`,
      ar: `تنبيه: لا يوجد نشاط للمحامي في "${vars.case_title}" — وكيلا`,
    },
    nde_deadline_miss: {
      en: `Action required: Missed deadline on "${vars.case_title}" — Wakeela`,
      ar: `إجراء مطلوب: موعد فائت في "${vars.case_title}" — وكيلا`,
    },
    nde_extended_silence: {
      en: `URGENT: Extended inactivity on "${vars.case_title}" — Wakeela`,
      ar: `عاجل: صمت مطوّل في "${vars.case_title}" — وكيلا`,
    },
  };
  return subjects[template]?.[isAr ? 'ar' : 'en'] ?? 'Wakeela Notification';
}

function buildEmailBody(
  template: string,
  vars: Record<string, string>,
  locale: string
): string {
  const dir  = locale === 'ar' ? 'rtl' : 'ltr';
  const font = locale === 'ar'
    ? "'IBM Plex Arabic', Arial, sans-serif"
    : "'Inter', Arial, sans-serif";

  const messages: Record<string, Record<string, string>> = {
    deadline_reminder: {
      en: `Your deadline <strong>${vars.deadline_title}</strong> for case <strong>${vars.case_title}</strong> is due in <strong>${vars.days_until} day(s)</strong>.`,
      ar: `موعد <strong>${vars.deadline_title}</strong> للقضية <strong>${vars.case_title}</strong> بعد <strong>${vars.days_until} يوم</strong>.`,
    },
    nde_inactivity: {
      en: `No lawyer updates have been logged on <strong>${vars.case_title}</strong> for <strong>${vars.days} days</strong>. Log in to Wakeela to take action.`,
      ar: `لم تُسجَّل أي تحديثات للمحامي في <strong>${vars.case_title}</strong> منذ <strong>${vars.days} أيام</strong>. سجّل دخولك لاتخاذ الإجراء المناسب.`,
    },
  };

  const body = messages[template]?.[locale === 'ar' ? 'ar' : 'en']
    ?? 'You have a new notification from Wakeela.';

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:${font}">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <tr><td style="background:#1A3557;padding:24px 32px">
          <h1 style="margin:0;color:#C89B3C;font-size:24px;letter-spacing:2px">WAKEELA · وكيلا</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#1a1a1a;font-size:16px;line-height:1.6">
          ${body}
        </td></tr>
        <tr><td style="padding:0 32px 24px" align="${dir === 'rtl' ? 'right' : 'left'}">
          <a href="${Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://wakeela.com'}/${locale}/dashboard"
             style="display:inline-block;background:#1A3557;color:#fff;padding:12px 28px;
                    border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">
            ${locale === 'ar' ? 'فتح وكيلا' : 'Open Wakeela'}
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;font-size:11px;color:#888;border-top:1px solid #f0f0f0">
          ${locale === 'ar'
            ? 'وكيلا لا تقدم استشارات قانونية. التنبيهات استرشادية فحسب.'
            : 'Wakeela does not provide legal advice. Alerts are informational only.'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
