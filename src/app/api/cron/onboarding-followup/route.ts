import { NextResponse }      from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsApp }      from '@/lib/notify';

export const runtime     = 'nodejs';
export const maxDuration = 60;

/**
 * Cron: /api/cron/onboarding-followup
 * Schedule: every 30 min (Vercel Pro) or daily (Hobby)
 *
 * Two jobs:
 *   A. Post-signup welcome — users who signed up in last 10 min with no WA sent
 *   B. No-case nudge — users who signed up 24h+ ago, no case created, no nudge sent
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createAdminClient();
  const now = new Date();
  const results = { welcome_sent: 0, nudge_sent: 0, errors: 0 };

  // ── A. Welcome message (within 10 min of signup) ────────────
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
  const { data: newUsers } = await sb
    .from('users')
    .select('id, full_name, locale, whatsapp_phone, notification_whatsapp')
    .eq('notification_whatsapp', true)
    .is('onboarding_wa_sent_at', null)
    .gte('created_at', tenMinAgo);

  for (const u of newUsers ?? []) {
    if (!u.whatsapp_phone) continue;
    const isAr = u.locale === 'ar';
    const name  = u.full_name?.split(' ')[0] || (isAr ? 'مرحباً' : 'there');
    const msg   = isAr
      ? `مرحباً ${name}! 👋 تم إنشاء حسابك في وكيلا بنجاح.\n\nهل تحتاج مساعدة في إعداد قضيتك؟ اكتب "نعم" وسأساعدك خلال دقيقة.`
      : `Hi ${name}! 👋 Your Wakeela account is ready.\n\nNeed help setting up your case? Reply "yes" and I'll guide you in under a minute.`;
    try {
      await sendWhatsApp({ phone: u.whatsapp_phone, message: msg });
      await sb.from('users').update({ onboarding_wa_sent_at: now.toISOString() }).eq('id', u.id);
      results.welcome_sent++;
    } catch { results.errors++; }
  }

  // ── B. No-case nudge (24h+ after signup, no case, not completed) ──
  const oneDayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data: idleUsers } = await sb
    .from('users')
    .select('id, full_name, locale, whatsapp_phone, notification_whatsapp, onboarding_wa_sent_at')
    .eq('notification_whatsapp', true)
    .eq('onboarding_completed', false)
    .is('first_case_created_at', null)
    .lte('created_at', oneDayAgo);

  for (const u of idleUsers ?? []) {
    if (!u.whatsapp_phone) continue;
    // Only nudge once per 24h
    if (u.onboarding_wa_sent_at) {
      const lastSent = new Date(u.onboarding_wa_sent_at).getTime();
      if (now.getTime() - lastSent < 24 * 3600_000) continue;
    }
    const isAr = u.locale === 'ar';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeelai-sigma.vercel.app';
    const msg = isAr
      ? `مرحباً 👋 معظم المستخدمين يبدأون بإضافة قضيتهم الأولى — الأمر يستغرق أقل من دقيقة.\n\n👉 ${appUrl}/${isAr ? 'ar' : 'en'}/cases/new`
      : `Hey 👋 Most users start by adding their first case — it takes less than 1 minute.\n\n👉 ${appUrl}/en/cases/new`;
    try {
      await sendWhatsApp({ phone: u.whatsapp_phone, message: msg });
      await sb.from('users').update({ onboarding_wa_sent_at: now.toISOString() }).eq('id', u.id);
      results.nudge_sent++;
    } catch { results.errors++; }
  }

  return NextResponse.json({ ok: true, ...results, at: now.toISOString() });
}
