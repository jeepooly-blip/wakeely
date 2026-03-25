import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { writeAuditLog, getClientIp } from '@/lib/audit';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { safeInt } from '@/lib/sanitize';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`admin:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const url   = new URL(req.url);
  const page  = safeInt(url.searchParams.get('page'), 1, 1000, 1);
  const limit = safeInt(url.searchParams.get('limit'), 10, 100, 25);
  const q     = url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
  const role  = url.searchParams.get('role') ?? '';
  const from  = (page - 1) * limit;

  const supabase = createAdminClient();
  let query = supabase
    .from('users')
    .select('id,email,full_name,role,subscription_tier,created_at,last_seen_at,locale,data_region', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (q)    query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (role) query = query.eq('role', role);

  const { data, count } = await query;
  await writeAuditLog({ user_id: guard.userId, action: 'admin_user_view', severity: 'info', ip_address: ip });

  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, limit });
}

export async function PATCH(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`admin:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { target_id, role, subscription_tier } = await req.json();
  if (!target_id) return NextResponse.json({ error: 'target_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: before } = await supabase.from('users').select('role,subscription_tier').eq('id', target_id).maybeSingle();

  const updates: Record<string, string> = {};
  if (role)              updates.role              = role;
  if (subscription_tier) updates.subscription_tier = subscription_tier;

  const { error } = await supabase.from('users').update(updates).eq('id', target_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    user_id: guard.userId, action: role ? 'admin_role_change' : 'admin_tier_change',
    resource: 'users', resource_id: target_id, severity: 'warn',
    ip_address: ip, changed_from: before ?? {}, changed_to: updates,
  });

  return NextResponse.json({ ok: true });
}
