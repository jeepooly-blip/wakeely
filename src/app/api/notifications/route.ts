import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — list notifications for current user
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url    = new URL(req.url);
  const unread = url.searchParams.get('unread') === 'true';
  const limit  = Number(url.searchParams.get('limit') ?? '30');

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unread) query = query.is('read_at', null);

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

// PATCH — mark all notifications as read
export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  return NextResponse.json({ ok: true });
}
