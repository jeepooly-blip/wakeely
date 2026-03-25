import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST — mark a tooltip as seen
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tooltip_id } = await req.json() as { tooltip_id: string };
  if (!tooltip_id) return NextResponse.json({ error: 'tooltip_id required' }, { status: 400 });

  await supabase.from('onboarding_tooltips_seen').upsert({
    user_id:    user.id,
    tooltip_id,
    seen_at:    new Date().toISOString(),
  }, { onConflict: 'user_id,tooltip_id' });

  return NextResponse.json({ ok: true });
}

// GET — list seen tooltips for current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([]);

  const { data } = await supabase
    .from('onboarding_tooltips_seen').select('tooltip_id').eq('user_id', user.id);

  return NextResponse.json((data ?? []).map((r: { tooltip_id: string }) => r.tooltip_id));
}
