import { notFound, redirect } from 'next/navigation';
import { getLocale }          from 'next-intl/server';
import { createClient }       from '@/lib/supabase/server';
import { Link }               from '@/i18n/navigation';
import { ArrowLeft, ArrowRight, MessageCircle, Lock, Shield } from 'lucide-react';
import dynamic                from 'next/dynamic';

const SecureChat = dynamic(() => import('@/components/chat/secure-chat').then(m => ({ default: m.SecureChat })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="h-7 w-7 rounded-full border-4 border-[#1A3557] border-t-transparent animate-spin" />
    </div>
  ),
});

export default async function CaseChatPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id }   = await params;
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const supabase = await createClient();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // ── Parallel: profile + case access check ────────────────────
  const [{ data: profile }, [{ data: ownedCase }, { data: assignment }]] = await Promise.all([
    supabase.from('users').select('role, full_name, subscription_tier').eq('id', user.id).maybeSingle(),
    Promise.all([
      supabase.from('cases').select('id, title').eq('id', id).eq('client_id', user.id).maybeSingle(),
      supabase.from('case_lawyers')
        .select('case_id, cases!inner(id, title)')
        .eq('case_id', id)
        .eq('lawyer_id', user.id)
        .eq('status', 'active')
        .maybeSingle(),
    ]),
  ]);

  const userRole = (profile?.role ?? 'client') as 'client' | 'lawyer' | 'admin';

  if (!ownedCase && !assignment) notFound();

  const caseTitle = ownedCase?.title
    ?? (assignment?.cases as unknown as { title: string })?.title
    ?? '';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)] max-w-3xl mx-auto space-y-3">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/cases/${id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <BackIcon className="h-4 w-4" />
            {isRTL ? 'القضية' : 'Case'}
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <MessageCircle className="h-3.5 w-3.5 text-[#0E7490]" />
            {isRTL ? 'المحادثة' : 'Chat'}
          </span>
        </div>

        {/* Security indicators */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3 text-emerald-500" />
            {isRTL ? 'محادثة مشفّرة' : 'Encrypted channel'}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3 text-[#1A3557]" />
            {isRTL ? 'وكيلا' : 'Wakeela'}
          </span>
        </div>
      </div>

      {/* Chat — fills remaining height */}
      <div className="flex-1 min-h-0">
        <SecureChat
          caseId={id}
          caseTitle={caseTitle}
          userId={user.id}
          userRole={userRole}
          locale={locale}
          subscriptionTier={profile?.subscription_tier ?? 'basic'}
        />
      </div>
    </div>
  );
}
