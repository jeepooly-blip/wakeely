import { NextResponse }      from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

// POST — mark onboarding as completed after first case is created
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  await admin.from('users').update({
    onboarding_completed:  true,
    first_case_created_at: new Date().toISOString(),
  }).eq('id', user.id);

  return NextResponse.json({ ok: true });
}
