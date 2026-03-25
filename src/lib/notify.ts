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
}) {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;
  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:   opts.phone.replace(/\D/g, ''),
      type: 'text',
      text: { body: opts.message },
    }),
  }).catch(() => {});
}
