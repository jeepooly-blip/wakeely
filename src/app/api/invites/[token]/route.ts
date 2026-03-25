import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/invites/[token] — fetch invite details (public, for acceptance page)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: invite } = await supabase
    .from('lawyer_invites')
    .select(`
      id, status, expires_at, lawyer_email, case_id,
      cases!inner(id, title, case_type, jurisdiction),
      users!lawyer_invites_created_by_fkey(full_name)
    `)
    .eq('token', token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'revoked')  return NextResponse.json({ error: 'Invite revoked' }, { status: 410 });
  if (invite.status === 'accepted') return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
  if (new Date(invite.expires_at) < new Date()) {
    await supabase.from('lawyer_invites').update({ status: 'expired' }).eq('token', token);
    return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
  }

  return NextResponse.json(invite);
}

// POST /api/invites/[token] — accept invite (lawyer must be authenticated)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Validate invite
  const { data: invite } = await supabase
    .from('lawyer_invites')
    .select('id, case_id, status, expires_at, created_by')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 409 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
  if (invite.created_by === user.id) return NextResponse.json({ error: 'Cannot accept your own invite' }, { status: 400 });

  // Set role to lawyer if not already
  await supabase.from('users').update({ role: 'lawyer' }).eq('id', user.id).eq('role', 'client');

  // Create case_lawyers record
  const { error: clError } = await supabase.from('case_lawyers').upsert({
    case_id:    invite.case_id,
    lawyer_id:  user.id,
    invited_by: invite.created_by,
    status:     'active',
  }, { onConflict: 'case_id,lawyer_id' });

  if (clError) return NextResponse.json({ error: clError.message }, { status: 500 });

  // Mark invite accepted
  await supabase.from('lawyer_invites').update({
    status:      'accepted',
    accepted_by: user.id,
    accepted_at: new Date().toISOString(),
  }).eq('id', invite.id);

  // Log in timeline
  await supabase.from('timeline_events').insert({
    case_id:             invite.case_id,
    actor_id:            user.id,
    event_type:          'lawyer_joined',
    payload:             { lawyer_id: user.id },
    is_system_generated: true,
  });

  return NextResponse.json({ case_id: invite.case_id });
}
