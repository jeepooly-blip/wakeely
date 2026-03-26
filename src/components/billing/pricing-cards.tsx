'use client';

import { useState } from 'react';
import { Check, Zap, Shield, Crown, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STRIPE_PLANS } from '@/lib/stripe-plans';
import { TIER_GATES } from '@/types';
import type { SubscriptionTier } from '@/types';

interface PricingCardsProps {
  locale:      string;
  currentTier: SubscriptionTier;
  hasStripe:   boolean; // STRIPE_SECRET_KEY is set
}

const TIER_ICONS: Record<SubscriptionTier, React.ElementType> = {
  basic:   Shield,
  pro:     Zap,
  premium: Crown,
};

const TIER_COLORS: Record<SubscriptionTier, { border: string; badge: string; btn: string }> = {
  basic:   { border: 'border-border',                            badge: 'bg-muted text-muted-foreground',                      btn: 'bg-foreground text-background hover:bg-foreground/90' },
  pro:     { border: 'border-[#1A3557] dark:border-blue-500',   badge: 'bg-[#1A3557] text-white',                             btn: 'bg-[#1A3557] text-white hover:bg-[#1e4a7a]' },
  premium: { border: 'border-[#C89B3C] dark:border-amber-400',  badge: 'bg-[#C89B3C] text-white',                             btn: 'bg-[#C89B3C] text-white hover:bg-[#b8892f]' },
};

const FEATURE_LABELS: Record<string, { en: string; ar: string }> = {
  max_cases:     { en: '{n} active case{p}',                     ar: '{n} قضية نشطة' },
  max_docs:      { en: '{n} documents per case',                 ar: '{n} مستند لكل قضية' },
  storage_gb:    { en: '{n} GB vault storage',                   ar: '{n} جيجابايت تخزين' },
  lawyer_invite: { en: 'Lawyer invite & collaboration',          ar: 'دعوة المحامي والتعاون' },
  chat:          { en: 'Secure client-lawyer chat',              ar: 'محادثة آمنة مع المحامي' },
  escalation:    { en: 'Escalation toolkit (letter templates)',  ar: 'أدوات التصعيد (قوالب الرسائل)' },
  whatsapp:      { en: 'WhatsApp reminders',                     ar: 'تذكيرات واتسآب' },
  vault:         { en: 'Evidence vault',                         ar: 'خزنة الأدلة' },
};

export function PricingCards({ locale, currentTier, hasStripe }: PricingCardsProps) {
  const isRTL   = locale === 'ar';
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);

  const checkout = async (tier: SubscriptionTier) => {
    if (!hasStripe) return;
    setLoading(tier);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tier, billing, locale }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  };

  const portal = async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  };

  const fmtFeature = (key: string, value: unknown): string => {
    const lbl = FEATURE_LABELS[key];
    if (!lbl) return '';
    const tmpl = isRTL ? lbl.ar : lbl.en;
    if (typeof value === 'number') {
      const n = value === Infinity ? (isRTL ? 'غير محدود' : 'Unlimited') : String(value);
      return tmpl.replace('{n}', n).replace('{p}', value === 1 ? '' : 's');
    }
    return tmpl;
  };

  return (
    <div className="space-y-6">
      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-border bg-muted p-1">
          {(['monthly', 'annual'] as const).map((b) => (
            <button key={b} onClick={() => setBilling(b)}
              className={cn(
                'rounded-lg px-5 py-2 text-sm font-semibold transition',
                billing === b ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}>
              {b === 'monthly'
                ? (isRTL ? 'شهري' : 'Monthly')
                : (isRTL ? 'سنوي (وفّر 15%)' : 'Annual (save 15%)')}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {STRIPE_PLANS.map((plan) => {
          const isCurrentTier = plan.tier === currentTier;
          const isUpgrade     = ['basic','pro','premium'].indexOf(plan.tier) > ['basic','pro','premium'].indexOf(currentTier);
          const colors        = TIER_COLORS[plan.tier];
          const Icon          = TIER_ICONS[plan.tier];
          const price         = billing === 'annual' ? plan.usd.annual : plan.usd.monthly;
          const gates         = TIER_GATES[plan.tier];

          return (
            <div key={plan.tier}
              className={cn(
                'relative rounded-2xl border-2 bg-card p-6 flex flex-col',
                colors.border,
                plan.tier === 'pro' && 'shadow-lg shadow-[#1A3557]/10'
              )}>
              {plan.tier === 'pro' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#1A3557] text-white text-[10px] font-bold px-3 py-1">
                    {isRTL ? 'الأكثر شيوعاً' : 'Most Popular'}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', colors.badge)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground capitalize">{plan.tier}</h3>
                  <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', colors.badge)}>
                    {isRTL ? { basic: 'أساسي', pro: 'احترافي', premium: 'مميز' }[plan.tier]
                      : { basic: 'Basic', pro: 'Pro', premium: 'Premium' }[plan.tier]}
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="mb-5">
                <div className="flex items-end gap-1" dir="ltr">
                  <span className="text-3xl font-black text-foreground">${price}</span>
                  <span className="text-sm text-muted-foreground mb-1">
                    /{billing === 'annual' ? (isRTL ? 'سنة' : 'yr') : (isRTL ? 'شهر' : 'mo')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                  ≈ {billing === 'annual' ? plan.aed.annual : plan.aed.monthly} AED
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-6 flex-1">
                {(Object.entries(gates) as [string, unknown][]).map(([key, value]) => {
                  const label = fmtFeature(key, value);
                  if (!label) return null;
                  const enabled = typeof value === 'boolean' ? value : true;
                  return (
                    <li key={key} className={cn('flex items-center gap-2 text-xs', !enabled && 'opacity-40')}>
                      <Check className={cn('h-3.5 w-3.5 shrink-0', enabled ? 'text-emerald-500' : 'text-muted-foreground')} />
                      <span className={enabled ? 'text-foreground' : 'text-muted-foreground line-through'}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* CTA */}
              {isCurrentTier ? (
                <div className="space-y-2">
                  <button disabled
                    className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground cursor-default">
                    {isRTL ? 'خطتك الحالية' : 'Current Plan'}
                  </button>
                  {currentTier !== 'basic' && hasStripe && (
                    <button onClick={portal} disabled={loading === 'portal'}
                      className="w-full rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition">
                      {loading === 'portal'
                        ? <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                        : (isRTL ? 'إدارة الاشتراك' : 'Manage Subscription')}
                    </button>
                  )}
                </div>
              ) : isUpgrade && hasStripe ? (
                <button onClick={() => checkout(plan.tier)}
                  disabled={!!loading}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition',
                    colors.btn,
                    loading === plan.tier && 'opacity-70'
                  )}>
                  {loading === plan.tier
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><ArrowRight className="h-4 w-4" />{isRTL ? 'ترقية الآن' : 'Upgrade Now'}</>}
                </button>
              ) : !hasStripe ? (
                <div className="rounded-xl bg-muted px-4 py-2.5 text-center">
                  <p className="text-xs text-muted-foreground">
                    {isRTL ? 'قريباً' : 'Coming soon'}
                  </p>
                </div>
              ) : (
                <button disabled
                  className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground cursor-default opacity-50">
                  {isRTL ? 'تخفيض الخطة' : 'Downgrade'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* HyperPay placeholder */}
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">
          {isRTL ? 'الدفع المحلي — HyperPay' : 'Local Payment — HyperPay'}
        </p>
        <p className="text-xs text-muted-foreground">
          {isRTL
            ? 'ادفع بالريال السعودي أو الدرهم الإماراتي عبر HyperPay. قريباً في الإصدار التالي.'
            : 'Pay in SAR or AED via HyperPay (Mada, KNET, local cards). Coming in the next release.'}
        </p>
      </div>
    </div>
  );
}
