import { createAdminClient } from '@/lib/supabase/server';
import type { NotificationType } from '@/types';

interface CreateNotificationInput {
  user_id:    string;
  case_id?:   string;
  type:       NotificationType;
  title:      string;
  body?:      string;
  action_url?: string;
}

/** Server-side helper — insert an in-app notification */
export async function createNotification(input: CreateNotificationInput) {
  const supabase = createAdminClient();
  await supabase.from('notifications').insert(input);
}

/** Send email via Resend (fire-and-forget) */
export async function sendEmail(opts: {
  to:      string;
  subject: string;
  html:    string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@wakeela.com',
      to:   [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  }).catch(() => {});
}

/** Send WhatsApp text message via Meta Cloud API */
export async function sendWhatsApp(opts: {
  phone:   string;
  message: string;
}): Promise<{ ok: boolean }> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false };

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   opts.phone.replace(/\D/g, ''),
        type: 'text',
        text: { body: opts.message },
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// ── SMS via Twilio (Gap Analysis Task 13) ─────────────────────────
// Fallback channel for CRITICAL/HIGH alerts when WhatsApp fails or
// user has WhatsApp notifications disabled but has a phone number.
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   — from Twilio console
//   TWILIO_AUTH_TOKEN    — from Twilio console
//   TWILIO_FROM_NUMBER   — your Twilio phone number (+1xxx)
//   NEXT_PUBLIC_SMS_ENABLED=true  — feature flag

/** Send SMS via Twilio REST API (no npm install — plain fetch) */
export async function sendSMS(opts: {
  to:      string;   // E.164 format, e.g. +971501234567
  body:    string;
}): Promise<{ ok: boolean }> {
  if (process.env.NEXT_PUBLIC_SMS_ENABLED !== 'true') return { ok: false };

  const sid      = process.env.TWILIO_ACCOUNT_SID;
  const token    = process.env.TWILIO_AUTH_TOKEN;
  const fromNum  = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !fromNum) return { ok: false };

  const to = opts.to.startsWith('+') ? opts.to : `+${opts.to.replace(/\D/g, '')}`;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNum,
          To:   to,
          Body: opts.body,
        }).toString(),
      }
    );
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

/**
 * Send a WhatsApp message with automatic SMS fallback.
 * Falls back to SMS when:
 *   - WhatsApp delivery fails (API error), OR
 *   - notification_whatsapp is false but phone is available
 *
 * Intended for CRITICAL and HIGH severity NDE alerts and
 * deadline reminders within 24 hours.
 */
export async function sendWhatsAppWithSMSFallback(opts: {
  phone:                 string;
  message:               string;
  smsMessage?:           string;   // shorter SMS version (defaults to message)
  notification_whatsapp?: boolean;
}): Promise<void> {
  const { phone, message, smsMessage, notification_whatsapp = true } = opts;
  if (!phone) return;

  if (notification_whatsapp) {
    const waResult = await sendWhatsApp({ phone, message });
    if (waResult.ok) return;    // WhatsApp delivered — done
    // WhatsApp failed → fall through to SMS
  }

  // SMS fallback
  await sendSMS({ to: phone, body: smsMessage ?? message });
}
