import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/invites — create a new invite link for a case
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { case_id, lawyer_email } = await request.json();
  if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 });

  // Verify requester owns the case
  const { data: c } = await supabase
    .from('cases')
    .select('id')
    .eq('id', case_id)
    .eq('client_id', user.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  // Revoke any existing pending invites for this case
  await supabase
    .from('lawyer_invites')
    .update({ status: 'revoked' })
    .eq('case_id', case_id)
    .eq('created_by', user.id)
    .eq('status', 'pending');

  // Create new invite
  const { data: invite, error } = await supabase
    .from('lawyer_invites')
    .insert({ case_id, created_by: user.id, lawyer_email: lawyer_email ?? null })
    .select('id, token, expires_at')
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create invite' }, { status: 500 });
  }

  return NextResponse.json({ token: invite.token, expires_at: invite.expires_at });
}
