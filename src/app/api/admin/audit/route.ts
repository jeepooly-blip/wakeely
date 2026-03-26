import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';
import { safeInt } from '@/lib/sanitize';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`admin:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const url      = new URL(req.url);
  const page     = safeInt(url.searchParams.get('page'),  1, 1000, 1);
  const limit    = safeInt(url.searchParams.get('limit'), 10, 100, 50);
  const severity = url.searchParams.get('severity') ?? '';
  const action   = url.searchParams.get('action')?.trim().slice(0, 100) ?? '';
  const from     = (page - 1) * limit;

  const supabase = createAdminClient();
  let query = supabase
    .from('audit_logs')
    .select('id,user_id,user_email,action,resource,severity,ip_address,metadata,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (severity) query = query.eq('severity', severity);
  if (action)   query = query.ilike('action', `%${action}%`);

  const { data, count } = await query;
  return NextResponse.json({ logs: data ?? [], total: count ?? 0, page, limit });
}
