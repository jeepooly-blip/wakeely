import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeText } from '@/lib/sanitize';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';

async function assertAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  case_id: string,
  user_id: string
) {
  const [{ data: owned }, { data: assigned }] = await Promise.all([
    supabase.from('cases').select('id').eq('id', case_id).eq('client_id', user_id).maybeSingle(),
    supabase.from('case_lawyers').select('id').eq('case_id', case_id)
      .eq('lawyer_id', user_id).eq('status', 'active').maybeSingle(),
  ]);
  return !!(owned || assigned);
}

// GET — fetch messages (paginated, newest last)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: case_id } = await params;
  const ip = getClientIp(req);
  const rl = checkRateLimit(`chat:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hasAccess = await assertAccess(supabase, case_id, user.id);
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url    = new URL(req.url);
  const before = url.searchParams.get('before'); // cursor for pagination
  const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 200);

  let query = supabase
    .from('chat_messages')
    .select('id, case_id, sender_id, content, is_encrypted, message_type, attachment_doc_id, attachment_name, attachment_size, read_at, created_at, users!chat_messages_sender_id_fkey(id, full_name, role)')
    .eq('case_id', case_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data: messages } = await query;

  // Mark unread messages as read
  await supabase.rpc('mark_chat_read' as never, { p_case_id: case_id, p_user_id: user.id });

  // Also fetch participants for the case (to show status badges)
  const [{ data: caseData }, { data: lawyers }] = await Promise.all([
    supabase.from('cases').select('client_id, users!cases_client_id_fkey(id, full_name, role)').eq('id', case_id).maybeSingle(),
    supabase.from('case_lawyers')
      .select('status, users!case_lawyers_lawyer_id_fkey(id, full_name, role)')
      .eq('case_id', case_id)
      .order('created_at', { ascending: false }),
  ]);

  const participants = [];
  if (caseData?.users) {
    const client = caseData.users as unknown as { id: string; full_name: string; role: string };
    participants.push({ ...client, status: 'active' });
  }
  for (const l of lawyers ?? []) {
    const lawyer = l.users as unknown as { id: string; full_name: string; role: string };
    if (lawyer) participants.push({ ...lawyer, status: l.status });
  }

  return NextResponse.json({
    messages:     messages ?? [],
    participants,
    current_user: user.id,
  });
}

// POST — send a message (text or attachment)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: case_id } = await params;
  const ip = getClientIp(req);
  const rl = checkRateLimit(`chat:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hasAccess = await assertAccess(supabase, case_id, user.id);
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { content, attachment_doc_id, message_type = 'text' } = body;

  // Validate
  if (message_type === 'text' && !content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }
  if (message_type === 'attachment' && !attachment_doc_id) {
    return NextResponse.json({ error: 'attachment_doc_id required for attachment' }, { status: 400 });
  }

  const cleanContent = sanitizeText(content ?? '');

  // For attachments: fetch doc metadata
  let attachmentName: string | null = null;
  let attachmentSize: number | null = null;
  if (attachment_doc_id) {
    const { data: doc } = await supabase
      .from('documents')
      .select('file_name, file_size, case_id')
      .eq('id', attachment_doc_id)
      .maybeSingle();
    // Verify doc belongs to this case
    if (!doc || doc.case_id !== case_id) {
      return NextResponse.json({ error: 'Document not found in this case' }, { status: 404 });
    }
    attachmentName = doc.file_name;
    attachmentSize = doc.file_size;
  }

  // E2E encryption placeholder — in production, content would be
  // encrypted client-side before sending. Server stores encrypted blob.
  const content_encrypted = cleanContent
    ? Buffer.from(cleanContent).toString('base64') // placeholder: base64 only
    : null;

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      case_id,
      sender_id:         user.id,
      content:           cleanContent,
      content_encrypted,
      is_encrypted:      false, // becomes true when real E2E is implemented
      message_type,
      attachment_doc_id: attachment_doc_id ?? null,
      attachment_name:   attachmentName,
      attachment_size:   attachmentSize,
    })
    .select('id, case_id, sender_id, content, is_encrypted, message_type, attachment_doc_id, attachment_name, attachment_size, read_at, created_at, users!chat_messages_sender_id_fkey(id, full_name, role)')
    .single();

  if (error || !msg) return NextResponse.json({ error: error?.message }, { status: 500 });

  return NextResponse.json(msg, { status: 201 });
}

// PATCH — soft-delete a message (sender only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: case_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message_id } = await req.json();
  if (!message_id) return NextResponse.json({ error: 'message_id required' }, { status: 400 });

  const { error } = await supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', message_id)
    .eq('case_id', case_id)
    .eq('sender_id', user.id); // only sender can delete

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
