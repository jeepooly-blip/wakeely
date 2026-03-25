import type { StripePlan } from '@/types';

export const STRIPE_PLANS: StripePlan[] = [
  {
    tier: 'basic',
    priceIdMonthly: process.env.STRIPE_PRICE_BASIC_MONTHLY  ?? 'price_basic_monthly',
    priceIdAnnual:  process.env.STRIPE_PRICE_BASIC_ANNUAL   ?? 'price_basic_annual',
    usd: { monthly: 9,  annual: 79  },
    aed: { monthly: 33, annual: 289 },
  },
  {
    tier: 'pro',
    priceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY    ?? 'price_pro_monthly',
    priceIdAnnual:  process.env.STRIPE_PRICE_PRO_ANNUAL     ?? 'price_pro_annual',
    usd: { monthly: 29, annual: 249 },
    aed: { monthly: 99, annual: 899 },
  },
  {
    tier: 'premium',
    priceIdMonthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY ?? 'price_premium_monthly',
    priceIdAnnual:  process.env.STRIPE_PRICE_PREMIUM_ANNUAL  ?? 'price_premium_annual',
    usd: { monthly: 79,  annual: 699  },
    aed: { monthly: 289, annual: 2499 },
  },
];

export function getPlan(tier: string): StripePlan | undefined {
  return STRIPE_PLANS.find((p) => p.tier === tier);
}
