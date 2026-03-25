import { getLocale }     from 'next-intl/server';
import { redirect }      from 'next/navigation';
import { createClient }  from '@/lib/supabase/server';
import { acceptInvite }  from '@/actions/invite-actions';
import {
  Shield, UserCheck, Clock, Scale, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn }   from '@/lib/utils';

/* ─── Error state card ──────────────────────────────────────────── */
interface ErrorConfig {
  icon:  React.ElementType;
  color: string;
  bg:    string;
  title_en: string;  title_ar: string;
  desc_en:  string;  desc_ar:  string;
}

function ErrorCard({ cfg, locale }: { cfg: ErrorConfig; locale: string }) {
  const isRTL = locale === 'ar';
  const Icon  = cfg.icon;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className={cn('w-full max-w-sm rounded-2xl border p-8 text-center space-y-4', cfg.bg)}>
        <Icon className={cn('mx-auto h-14 w-14', cfg.color)} />
        <div>
          <h1 className="text-lg font-bold text-foreground mb-1">
            {isRTL ? cfg.title_ar : cfg.title_en}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRTL ? cfg.desc_ar : cfg.desc_en}
          </p>
        </div>
        <Link href={`/${locale}/login`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1A3557] text-white px-6 py-2.5 text-sm font-semibold hover:bg-[#1e4a7a] transition">
          {isRTL ? 'تسجيل الدخول' : 'Go to Login'}
        </Link>
      </div>
    </main>
  );
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
  invalid: {
    icon: AlertCircle, color: 'text-red-500',
    bg:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    title_en: 'Invite Not Found',      title_ar: 'الدعوة غير موجودة',
    desc_en:  'This invite link is invalid or does not exist.',
    desc_ar:  'رابط الدعوة غير صالح أو غير موجود.',
  },
  expired: {
    icon: Clock, color: 'text-amber-500',
    bg:   'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    title_en: 'Invite Expired',         title_ar: 'انتهت صلاحية الدعوة',
    desc_en:  'This invite has expired. Ask the client to generate a new link.',
    desc_ar:  'انتهت صلاحية هذه الدعوة. اطلب من الموكّل إنشاء رابط جديد.',
  },
  revoked: {
    icon: AlertCircle, color: 'text-orange-500',
    bg:   'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    title_en: 'Invite Revoked',         title_ar: 'تم إلغاء الدعوة',
    desc_en:  'This invite has been revoked by the client.',
    desc_ar:  'تم إلغاء هذه الدعوة من قِبل الموكّل.',
  },
  used: {
    icon: CheckCircle2, color: 'text-emerald-500',
    bg:   'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    title_en: 'Already Accepted',       title_ar: 'تم قبول الدعوة مسبقاً',
    desc_en:  'This invite has already been accepted.',
    desc_ar:  'هذه الدعوة قد قُبلت مسبقاً.',
  },
  self: {
    icon: AlertCircle, color: 'text-purple-500',
    bg:   'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    title_en: 'Cannot Accept Own Invite', title_ar: 'لا يمكنك قبول دعوتك',
    desc_en:  'You cannot accept an invite you created.',
    desc_ar:  'لا يمكنك قبول الدعوة التي أنشأتها.',
  },
};

/* ─── Main page ─────────────────────────────────────────────────── */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error: errorCode } = await searchParams;
  const locale  = await getLocale();
  const isRTL   = locale === 'ar';
  const supabase = await createClient();

  // ── Show error state ─────────────────────────────────────────
  if (errorCode && ERROR_CONFIGS[errorCode]) {
    return <ErrorCard cfg={ERROR_CONFIGS[errorCode]} locale={locale} />;
  }

  // ── No token ─────────────────────────────────────────────────
  if (!token) {
    return <ErrorCard cfg={ERROR_CONFIGS.invalid} locale={locale} />;
  }

  // ── Auth check ───────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = encodeURIComponent(`/${locale}/invite?token=${token}`);
    redirect(`/${locale}/login?redirectTo=${returnTo}`);
  }

  // ── Fetch invite ─────────────────────────────────────────────
  const { data: invite } = await supabase
    .from('invites')
    .select(`
      id, expires_at, accepted_at, revoked_at, invited_email, case_id, created_by,
      cases!inner(id, title, case_type, jurisdiction, city),
      users!invites_created_by_fkey(id, full_name, email)
    `)
    .eq('token', token)
    .maybeSingle();

  // ── Validate ─────────────────────────────────────────────────
  if (!invite)               return <ErrorCard cfg={ERROR_CONFIGS.invalid}  locale={locale} />;
  if (invite.revoked_at)     return <ErrorCard cfg={ERROR_CONFIGS.revoked}  locale={locale} />;
  if (invite.accepted_at)    return <ErrorCard cfg={ERROR_CONFIGS.used}     locale={locale} />;
  if (new Date(invite.expires_at) < new Date())
                             return <ErrorCard cfg={ERROR_CONFIGS.expired}  locale={locale} />;
  if (invite.created_by === user.id)
                             return <ErrorCard cfg={ERROR_CONFIGS.self}     locale={locale} />;

  // ── Already joined? ──────────────────────────────────────────
  const { data: existing } = await supabase
    .from('case_lawyers')
    .select('id, status')
    .eq('case_id', invite.case_id)
    .eq('lawyer_id', user.id)
    .maybeSingle();

  if (existing?.status === 'active') {
    redirect(`/${locale}/lawyer/cases/${invite.case_id}`);
  }

  const caseRow = invite.cases   as unknown as { id: string; title: string; case_type: string; jurisdiction: string; city?: string };
  const inviter = invite.users   as unknown as { id: string; full_name: string; email: string };

  const daysLeft = Math.max(0, Math.ceil(
    (new Date(invite.expires_at).getTime() - Date.now()) / 86_400_000
  ));

  const caseTypeLabel: Record<string, { en: string; ar: string }> = {
    employment: { en: 'Employment',  ar: 'عمالة'          },
    family:     { en: 'Family',      ar: 'أحوال شخصية'    },
    commercial: { en: 'Commercial',  ar: 'تجاري'           },
    property:   { en: 'Property',    ar: 'عقاري'           },
    criminal:   { en: 'Criminal',    ar: 'جنائي'           },
    other:      { en: 'Other',       ar: 'أخرى'           },
  };
  const typeLabel = caseTypeLabel[caseRow.case_type] ?? { en: caseRow.case_type, ar: caseRow.case_type };

  // Server Action bound to this token
  const accept = acceptInvite.bind(null, token);

  const accessItems = [
    { icon: '📋', en: 'Read full case timeline',     ar: 'قراءة الجدول الزمني الكامل' },
    { icon: '✏️', en: 'Log legal actions',           ar: 'تسجيل الإجراءات القانونية'  },
    { icon: '📎', en: 'Upload documents to vault',   ar: 'رفع مستندات إلى الخزنة'     },
    { icon: '💬', en: 'Secure chat with client',     ar: 'محادثة آمنة مع الموكّل'     },
  ];

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-lg space-y-4 animate-fade-in">

        {/* ── Logo ── */}
        <div className="flex justify-center mb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1A3557] shadow-lg">
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

        {/* ── Main card ── */}
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">

          {/* Header gradient */}
          <div className="bg-gradient-to-r from-[#1A3557] to-[#0E7490] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shrink-0">
                <UserCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">
                  {isRTL ? 'دعوة للانضمام كمحامٍ' : 'Lawyer Case Invite'}
                </h1>
                <p className="text-xs text-white/70 mt-0.5">
                  {isRTL
                    ? `من ${inviter.full_name}`
                    : `From ${inviter.full_name}`}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* ── Case details ── */}
            <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {isRTL ? 'تفاصيل القضية' : 'Case Details'}
              </p>
              <p className="text-base font-bold text-foreground leading-snug">
                {caseRow.title}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-[#1A3557]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#1A3557]">
                  {isRTL ? typeLabel.ar : typeLabel.en}
                </span>
                {caseRow.jurisdiction && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    <Scale className="h-3 w-3" />
                    {caseRow.jurisdiction}
                    {caseRow.city && `, ${caseRow.city}`}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isRTL
                  ? `الموكّل: ${inviter.full_name} (${inviter.email})`
                  : `Client: ${inviter.full_name} (${inviter.email})`}
              </p>
            </div>

            {/* ── Access list ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {isRTL ? 'صلاحياتك على هذه القضية:' : 'Your access on this case:'}
              </p>
              {accessItems.map((item) => (
                <div key={item.en} className="flex items-center gap-2.5 text-sm text-foreground">
                  <span>{item.icon}</span>
                  <span>{isRTL ? item.ar : item.en}</span>
                </div>
              ))}
            </div>

            {/* ── Expiry warning ── */}
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-4 py-2.5">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {isRTL
                  ? `ينتهي خلال ${daysLeft} يوم`
                  : `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* ── Accept button — Server Action via form ── */}
            <form action={accept}>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A3557] text-white py-3.5 text-base font-bold hover:bg-[#1e4a7a] transition active:scale-[0.98]"
              >
                <UserCheck className="h-5 w-5" />
                {isRTL ? 'قبول الدعوة والانضمام للقضية' : 'Accept Invite & Join Case'}
              </button>
            </form>

            <p className="text-[10px] text-center text-muted-foreground/60 leading-relaxed">
              {isRTL
                ? 'بقبول الدعوة ستحصل على صلاحية محدودة لهذه القضية فقط. لا يمكنك رؤية بيانات موكّلين آخرين.'
                : 'By accepting, you get scoped access to this case only. No other client data is accessible.'}
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
