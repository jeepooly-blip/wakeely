import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog, getClientIp } from '@/lib/audit';

// DELETE /api/cases/[id]/lawyers/[lawyerId] — client revokes lawyer access
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; lawyerId: string }> }
) {
  const { id: caseId, lawyerId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify requester owns the case
  const { data: c } = await supabase
    .from('cases')
    .select('id, title')
    .eq('id', caseId)
    .eq('client_id', user.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Revoke access
  const { error } = await supabase
    .from('case_lawyers')
    .update({
      status:     'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
    })
    .eq('case_id', caseId)
    .eq('lawyer_id', lawyerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Revoke any pending invites for this lawyer
  await supabase
    .from('lawyer_invites')
    .update({ status: 'revoked' })
    .eq('case_id', caseId)
    .eq('accepted_by', lawyerId);

  // Log to timeline
  await supabase.from('timeline_events').insert({
    case_id:             caseId,
    actor_id:            user.id,
    event_type:          'lawyer_revoked',
    payload:             { lawyer_id: lawyerId, revoked_by: user.id },
    is_system_generated: false,
  });

  await writeAuditLog({
    user_id: user.id, action: 'lawyer_revoke',
    resource: 'case_lawyers', resource_id: caseId,
    severity: 'warn', ip_address: getClientIp(req),
    metadata: { case_id: caseId, lawyer_id: lawyerId },
  });

  return NextResponse.json({ ok: true });
}
