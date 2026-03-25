import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Shield, UserCheck, AlertCircle, CheckCircle2, Clock, Hash, Scale } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

function StatusCard({
  type, locale,
}: {
  type: 'not_found' | 'used' | 'expired' | 'self_invite';
  locale: string;
}) {
  const isRTL = locale === 'ar';
  const cfg = {
    not_found:   { icon: AlertCircle,   color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      title: isRTL ? 'الدعوة غير موجودة'       : 'Invite Not Found',
      desc:  isRTL ? 'هذا الرابط غير صالح أو منتهي الصلاحية.' : 'This invite link is invalid or has expired.' },
    used:        { icon: CheckCircle2,  color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
      title: isRTL ? 'تم قبول الدعوة'          : 'Invite Already Accepted',
      desc:  isRTL ? 'هذه الدعوة قد قُبلت مسبقاً.' : 'This invite has already been accepted.' },
    expired:     { icon: Clock,         color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      title: isRTL ? 'انتهت صلاحية الدعوة'     : 'Invite Expired',
      desc:  isRTL ? 'اطلب من الموكّل إنشاء رابط جديد.' : 'Ask the client to generate a new invite link.' },
    self_invite: { icon: AlertCircle,   color: 'text-orange-500',  bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
      title: isRTL ? 'لا يمكنك قبول دعوتك الخاصة' : 'Cannot Accept Own Invite',
      desc:  isRTL ? 'لا يمكن للموكّل قبول دعوته الخاصة.' : 'You cannot accept an invite you created.' },
  }[type];
  const Icon = cfg.icon;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className={cn('w-full max-w-sm rounded-2xl border p-8 text-center', cfg.bg)}>
        <Icon className={cn('mx-auto h-12 w-12 mb-4', cfg.color)} />
        <h1 className="text-lg font-bold text-foreground mb-2">{cfg.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{cfg.desc}</p>
        <Link href={`/${locale}/login`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1A3557] text-white px-6 py-2.5 text-sm font-semibold hover:bg-[#1e4a7a] transition">
          {isRTL ? 'تسجيل الدخول' : 'Go to Login'}
        </Link>
      </div>
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const locale    = await getLocale();
  const isRTL     = locale === 'ar';
  const supabase  = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch invite details
  const { data: invite } = await supabase
    .from('lawyer_invites')
    .select(`
      id, status, expires_at, lawyer_email, case_id, created_by,
      cases!inner(id, title, case_type, jurisdiction, city),
      users!lawyer_invites_created_by_fkey(id, full_name, email)
    `)
    .eq('token', token)
    .maybeSingle();

  if (!invite)                                          return <StatusCard type="not_found"   locale={locale} />;
  if (invite.status === 'accepted')                     return <StatusCard type="used"        locale={locale} />;
  if (invite.status === 'revoked' ||
      new Date(invite.expires_at) < new Date())         return <StatusCard type="expired"     locale={locale} />;
  if (user && invite.created_by === user.id)            return <StatusCard type="self_invite" locale={locale} />;

  const c       = invite.cases   as unknown as { id: string; title: string; case_type: string; jurisdiction: string; city?: string };
  const inviter = invite.users   as unknown as { id: string; full_name: string; email: string };

  // Not logged in → redirect to register with returnUrl
  if (!user) {
    const returnUrl = encodeURIComponent(`/${locale}/invite/${token}`);
    redirect(`/${locale}/register?role=lawyer&returnUrl=${returnUrl}`);
  }

  // Already accepted this case
  const { data: existing } = await supabase
    .from('case_lawyers')
    .select('id, status')
    .eq('case_id', invite.case_id)
    .eq('lawyer_id', user.id)
    .maybeSingle();

  if (existing?.status === 'active') {
    redirect(`/${locale}/lawyer/cases/${invite.case_id}`);
  }

  // Server action to accept
  const accept = async () => {
    'use server';
    const sb = await createClient();
    const { data: { user: u } } = await sb.auth.getUser();
    if (!u) return;

    // Get lawyer's bar number and jurisdiction from their profile
    const { data: profile } = await sb
      .from('users')
      .select('bar_number, jurisdiction, role')
      .eq('id', u.id)
      .maybeSingle();

    // Upgrade role to lawyer if still client
    if (profile?.role === 'client') {
      await sb.from('users').update({ role: 'lawyer' }).eq('id', u.id);
    }

    // Fetch invite again to get created_by
    const { data: inv } = await sb
      .from('lawyer_invites')
      .select('case_id, created_by, id')
      .eq('token', token)
      .maybeSingle();
    if (!inv) return;

    // Create / reactivate case_lawyers row
    await sb.from('case_lawyers').upsert({
      case_id:     inv.case_id,
      lawyer_id:   u.id,
      invited_by:  inv.created_by,
      status:      'active',
      permissions: 'write',
    }, { onConflict: 'case_id,lawyer_id' });

    // Mark invite accepted
    await sb.from('lawyer_invites').update({
      status:      'accepted',
      accepted_by: u.id,
      accepted_at: new Date().toISOString(),
    }).eq('id', inv.id);

    // Timeline event
    await sb.from('timeline_events').insert({
      case_id:             inv.case_id,
      actor_id:            u.id,
      event_type:          'lawyer_joined',
      payload: {
        lawyer_id:    u.id,
        bar_number:   profile?.bar_number,
        jurisdiction: profile?.jurisdiction,
      },
      is_system_generated: true,
    });

    redirect(`/${locale}/lawyer/cases/${inv.case_id}`);
  };

  const caseTypeLabel: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  const daysLeft = Math.max(0, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 86_400_000));

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-lg space-y-4 animate-fade-in">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1A3557] shadow-brand">
              <Shield className="h-6 w-6 text-[#C89B3C]" />
            </div>
            <div>
              <p className="text-xl font-black text-[#1A3557] dark:text-foreground">
                {isRTL ? 'وكيلا' : 'WAKEELA'}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {isRTL ? 'بوابة المحامي' : 'Lawyer Portal'}
              </p>
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-2xl border border-border bg-card shadow-float overflow-hidden">

          {/* Teal accent header */}
          <div className="bg-gradient-to-r from-[#1A3557] to-[#0E7490] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shrink-0">
                <UserCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">
                  {isRTL ? 'دعوة للانضمام كمحامٍ' : 'Lawyer Invite'}
                </h1>
                <p className="text-xs text-white/70 mt-0.5">
                  {isRTL
                    ? `من ${inviter.full_name} · ${inviter.email}`
                    : `From ${inviter.full_name} · ${inviter.email}`}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Case card */}
            <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {isRTL ? 'تفاصيل القضية' : 'Case Details'}
              </p>
              <p className="text-base font-bold text-foreground leading-snug">{c.title}</p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-navy">{caseTypeLabel[c.case_type] ?? c.case_type}</span>
                {c.jurisdiction && (
                  <span className="flex items-center gap-1 badge badge-neutral">
                    <Scale className="h-3 w-3" />{c.jurisdiction}{c.city && `, ${c.city}`}
                  </span>
                )}
              </div>
            </div>

            {/* What you'll get access to */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {isRTL ? 'صلاحياتك كمحامٍ على هذه القضية:' : 'Your access as lawyer on this case:'}
              </p>
              {[
                { icon: '📋', en: 'Read full case timeline', ar: 'قراءة الجدول الزمني الكامل' },
                { icon: '✏️', en: 'Add action log entries',  ar: 'تسجيل الإجراءات القانونية' },
                { icon: '📎', en: 'Upload documents to vault', ar: 'رفع مستندات إلى الخزنة' },
                { icon: '💬', en: 'Secure chat with client', ar: 'محادثة آمنة مع الموكّل' },
              ].map((item) => (
                <div key={item.en} className="flex items-center gap-2.5 text-sm text-foreground">
                  <span>{item.icon}</span>
                  <span>{isRTL ? item.ar : item.en}</span>
                </div>
              ))}
            </div>

            {/* Expiry */}
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-4 py-2.5">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {isRTL
                  ? `ينتهي خلال ${daysLeft} يوم${daysLeft !== 1 ? '' : ''}`
                  : `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Accept button */}
            <form action={accept}>
              <button type="submit"
                className="w-full btn-primary py-3.5 text-base">
                <UserCheck className="h-5 w-5" />
                {isRTL ? 'قبول الدعوة والانضمام' : 'Accept Invite & Join Case'}
              </button>
            </form>

            <p className="text-[10px] text-center text-muted-foreground/60 leading-relaxed">
              {isRTL
                ? 'بقبول الدعوة ستحصل على صلاحية محدودة لهذه القضية فقط. لن تتمكن من رؤية بيانات موكّلين آخرين.'
                : 'By accepting, you get scoped access to this case only. No other client data is visible to you.'}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {isRTL ? 'وكيلا لا تقدم استشارات قانونية.' : 'Wakeela does not provide legal advice.'}
        </p>
      </div>
    </main>
  );
}
