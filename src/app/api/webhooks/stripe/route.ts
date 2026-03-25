import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });

  const body      = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'No signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub   = event.data.object as Stripe.Subscription;
      const tier  = (sub.metadata?.tier as 'pro' | 'premium') ?? 'pro';
      const email = sub.metadata?.email;
      if (!email) break;

      const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      if (user) {
        await supabase.from('subscriptions').upsert({
          user_id:                user.id,
          stripe_subscription_id: sub.id,
          tier,
          status:                 sub.status,
          current_period_end:     new Date(sub.current_period_end * 1000).toISOString(),
        });
        await supabase.from('users').update({ subscription_tier: tier }).eq('id', user.id);

        // In-app notification
        await supabase.from('notifications').insert({
          user_id: user.id,
          type:    'subscription_updated',
          title:   event.type === 'customer.subscription.created'
            ? `Subscription activated — ${tier} plan`
            : `Subscription updated — ${tier} plan`,
          body:    `Your ${tier} plan is now active.`,
          action_url: '/billing',
        });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await supabase.from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', sub.id);

      // Downgrade user to basic
      const { data: existingSub } = await supabase.from('subscriptions')
        .select('user_id').eq('stripe_subscription_id', sub.id).maybeSingle();
      if (existingSub) {
        await supabase.from('users')
          .update({ subscription_tier: 'basic' })
          .eq('id', existingSub.user_id);
        await supabase.from('notifications').insert({
          user_id: existingSub.user_id,
          type:    'subscription_updated',
          title:   'Subscription canceled',
          body:    'Your account has been downgraded to the Basic plan.',
          action_url: '/billing',
        });
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const { data: user } = await supabase.from('users')
          .select('id').eq('stripe_customer_id', customerId).maybeSingle();
        if (user) {
          await supabase.from('notifications').insert({
            user_id: user.id,
            type:    'subscription_updated',
            title:   'Payment failed',
            body:    'Your subscription payment failed. Please update your billing details.',
            action_url: '/billing',
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
