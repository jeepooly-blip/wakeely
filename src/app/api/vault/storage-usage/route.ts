import { NextResponse }    from 'next/server';
import { createClient }    from '@/lib/supabase/server';
import { checkStorageLimit } from '@/lib/feature-gate';

// GET /api/vault/storage-usage
// Returns the current user's vault storage usage vs their tier limit.
// Used by the vault UI and the case-wizard pre-upload check.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve the user's current subscription tier
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = profile?.subscription_tier ?? 'basic';

  const result = await checkStorageLimit(user.id, tier, supabase);

  return NextResponse.json({
    bytes_used:  result.bytes_used,
    bytes_limit: result.bytes_limit,
    percentage:  result.percentage,
    tier:        result.tier,
    // Convenience: human-readable values
    used_gb:     +(result.bytes_used  / 1_073_741_824).toFixed(3),
    limit_gb:    +(result.bytes_limit / 1_073_741_824).toFixed(1),
  });
}
