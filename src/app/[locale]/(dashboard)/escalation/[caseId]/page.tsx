import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { EscalationToolkit } from '@/components/escalation/escalation-toolkit';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import type { SubscriptionTier } from '@/types';

export default async function EscalationPage({
  params,
}: {
  params: Promise<{ locale: string; caseId: string }>;
}) {
  const { caseId } = await params;
  const locale      = await getLocale();
  const isRTL       = locale === 'ar';
  const supabase    = await createClient();
  const BackIcon    = isRTL ? ArrowRight : ArrowLeft;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [{ data: c }, { data: profile }] = await Promise.all([
    supabase.from('cases').select('id, title, lawyer_email').eq('id', caseId).eq('client_id', user.id).maybeSingle(),
    supabase.from('users').select('subscription_tier').eq('id', user.id).maybeSingle(),
  ]);
  if (!c) notFound();

  const tier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-2">
        <Link href={`/cases/${caseId}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
          <BackIcon className="h-4 w-4" />
          {isRTL ? 'القضية' : 'Case'}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <FileText className="h-3.5 w-3.5" />
          {isRTL ? 'التصعيد' : 'Escalation'}
        </span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">{c.title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isRTL ? 'قوالب رسائل التصعيد القانوني' : 'Legal escalation letter templates'}
        </p>
      </div>

      <EscalationToolkit
        caseId={caseId}
        caseTitle={c.title}
        locale={locale}
        lawyerEmail={c.lawyer_email ?? undefined}
        userTier={tier}
      />
    </div>
  );
}
