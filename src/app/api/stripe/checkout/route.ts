import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/stripe-plans';
import type { SubscriptionTier } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tier, billing, locale } = await req.json() as {
    tier: SubscriptionTier; billing: 'monthly' | 'annual'; locale: string;
  };

  const plan = getPlan(tier);
  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  const priceId = billing === 'annual' ? plan.priceIdAnnual : plan.priceIdMonthly;

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from('users')
    .select('email, full_name, stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    profile?.email ?? user.email ?? '',
      name:     profile?.full_name ?? '',
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';

  const session = await stripe.checkout.sessions.create({
    customer:    customerId,
    mode:        'subscription',
    line_items:  [{ price: priceId, quantity: 1 }],
    metadata:    { user_id: user.id, tier, email: profile?.email ?? '' },
    success_url: `${origin}/${locale}/billing?success=1&tier=${tier}`,
    cancel_url:  `${origin}/${locale}/billing?canceled=1`,
    subscription_data: {
      metadata: { user_id: user.id, tier, email: profile?.email ?? '' },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
