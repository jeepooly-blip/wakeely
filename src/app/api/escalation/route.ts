import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTemplate, buildLetterBody, type CountryCode } from '@/lib/escalation-templates';
import { canAccess } from '@/lib/feature-gate';
import { createNotification, sendEmail } from '@/lib/notify';
import { sanitizeText } from '@/lib/sanitize';
import type { SubscriptionTier } from '@/types';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url    = new URL(req.url);
  const caseId = url.searchParams.get('case_id');

  let query = supabase.from('escalation_drafts').select('*')
    .eq('user_id', user.id).order('updated_at', { ascending: false });
  if (caseId) query = query.eq('case_id', caseId);

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { case_id, template_key, fields, action, country = 'uae', language } = body;

  if (!case_id || !template_key || !fields) {
    return NextResponse.json({ error: 'case_id, template_key, fields required' }, { status: 400 });
  }

  const template = getTemplate(template_key);
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });

  const { data: profile } = await supabase
    .from('users').select('subscription_tier, email, locale').eq('id', user.id).maybeSingle();

  const tier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;

  // Priority: 1) explicit `language` param from client (reflects URL locale)
  //           2) user's stored DB locale (fallback for API-only callers)
  //           3) 'en' — never default to 'ar' silently
  const locale = (language ?? profile?.locale ?? 'en') as 'en' | 'ar';

  if (!canAccess(tier, 'escalation') && template.tier !== 'basic') {
    return NextResponse.json({ error: 'upgrade_required' }, { status: 403 });
  }

  // Sanitize all field values
  const sanitizedFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    sanitizedFields[k] = sanitizeText(String(v));
  }

  // Build letter
  const letterBody = buildLetterBody(template, sanitizedFields, locale, country as CountryCode);

  // Upsert draft
  const status = action === 'send' ? 'sent'
    : action === 'download' ? 'downloaded'
    : 'draft';

  const { data: existing } = await supabase
    .from('escalation_drafts').select('id')
    .eq('case_id', case_id).eq('user_id', user.id).eq('template_key', template_key)
    .maybeSingle();

  let draftId: string;
  if (existing) {
    await supabase.from('escalation_drafts').update({
      fields: sanitizedFields, status, country, language: locale,
      sent_at: action === 'send' ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    draftId = existing.id;
  } else {
    const { data: nd } = await supabase.from('escalation_drafts').insert({
      case_id, user_id: user.id, template_key, fields: sanitizedFields,
      status, country, language: locale,
      sent_at: action === 'send' ? new Date().toISOString() : undefined,
    }).select('id').single();
    draftId = nd?.id ?? '';
  }

  // Send email if action === 'send'
  if (action === 'send' && sanitizedFields.lawyer_email && profile?.email) {
    const subject = locale === 'ar'
      ? `${template.titleAr} — ${sanitizedFields.case_title ?? ''}`
      : `${template.titleEn} — ${sanitizedFields.case_title ?? ''}`;

    await sendEmail({
      to:   sanitizedFields.lawyer_email,
      subject,
      html: `<div style="font-family:serif;direction:${locale === 'ar' ? 'rtl' : 'ltr'};padding:24px">
               <pre style="white-space:pre-wrap;font-family:serif;font-size:13px">${letterBody.replace(/</g, '&lt;')}</pre>
               <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
               <p style="font-size:11px;color:#888">Sent via Wakeela Platform · وكيلا — Not legal advice</p>
             </div>`,
    });

    await createNotification({
      user_id: user.id, case_id,
      type:       'escalation_sent',
      title:      locale === 'ar' ? `تم إرسال "${template.titleAr}"` : `"${template.titleEn}" sent`,
      body:       locale === 'ar' ? `إلى ${sanitizedFields.lawyer_email}` : `To ${sanitizedFields.lawyer_email}`,
      action_url: `/cases/${case_id}`,
    });
  }

  return NextResponse.json({ id: draftId, letter_body: letterBody });
}
