import { NextResponse }  from 'next/server';
import { createClient }  from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { SubscriptionTier } from '@/types';

const DAILY_LIMITS: Record<SubscriptionTier, number> = {
  basic: 5, pro: 50, premium: Infinity,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const [profileRes, usageRes] = await Promise.all([
    admin.from('users').select('subscription_tier').eq('id', user.id).maybeSingle(),
    admin.rpc('voice_queries_today' as never, { p_user_id: user.id }),
  ]);

  const tier  = (profileRes.data?.subscription_tier ?? 'basic') as SubscriptionTier;
  const used  = (usageRes.data as number) ?? 0;
  const limit = DAILY_LIMITS[tier];

  return NextResponse.json({ used, limit, tier, remaining: Math.max(0, limit - used) });
}
