import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PricingCards } from '@/components/billing/pricing-cards';
import { CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import type { SubscriptionTier } from '@/types';

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ success?: string; canceled?: string; tier?: string }>;
}) {
  const { locale } = await params;          // ✅ locale from URL
  const supabase = await createClient();
  const isRTL    = locale === 'ar';
  const sp       = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // ── Parallel queries ─────────────────────────────────────────
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from('users')
      .select('subscription_tier, full_name, email, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('tier, status, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const currentTier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;
  const hasStripe   = !!process.env.STRIPE_SECRET_KEY;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      {/* Success/cancel banners */}
      {sp.success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {isRTL ? 'تم تفعيل اشتراكك بنجاح!' : 'Subscription activated successfully!'}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {isRTL
                ? `مرحباً بك في خطة ${sp.tier ?? ''}. يمكنك الآن الاستفادة من جميع الميزات.`
                : `Welcome to the ${sp.tier ?? ''} plan. All features are now unlocked.`}
            </p>
          </div>
        </div>
      )}
      {sp.canceled && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 px-5 py-4">
          <XCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {isRTL ? 'تم إلغاء عملية الدفع.' : 'Payment was canceled. No charges were made.'}
          </p>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-[#1A3557]" />
          {isRTL ? 'الفواتير والاشتراك' : 'Billing & Subscription'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isRTL ? 'إدارة خطتك والميزات المتاحة لك.' : 'Manage your plan and available features.'}
        </p>
      </div>

      {/* Current plan card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          {isRTL ? 'خطتك الحالية' : 'Current Plan'}
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-xl font-black text-foreground capitalize">{currentTier}</p>
            {sub ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRTL
                  ? `ينتهي بتاريخ ${fmtDate(sub.current_period_end)}`
                  : `Renews on ${fmtDate(sub.current_period_end)}`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRTL ? 'الخطة المجانية — لا يوجد بطاقة مطلوبة' : 'Free plan — no credit card required'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              sub?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
            }`}>
              {sub?.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'مجاني' : 'Free')}
            </span>
          </div>
        </div>
      </div>

      {/* Pricing cards */}
      <PricingCards
        locale={locale}
        currentTier={currentTier}
        hasStripe={hasStripe}
      />

      {/* Env var note for dev */}
      {!hasStripe && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
          <p className="text-xs text-muted-foreground font-mono text-center">
            {isRTL
              ? 'لتفعيل المدفوعات: أضف STRIPE_SECRET_KEY و STRIPE_PRICE_* في إعدادات Vercel'
              : 'To enable payments: add STRIPE_SECRET_KEY and STRIPE_PRICE_* env vars in Vercel Settings'}
          </p>
        </div>
      )}
    </div>
  );
}
