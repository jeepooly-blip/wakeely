import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`admin:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const supabase = createAdminClient();
  const ago7d = new Date(Date.now() - 7*86400000).toISOString();
  const ago24h = new Date(Date.now() - 86400000).toISOString();

  const [
    { count: totalUsers }, { count: clients }, { count: lawyers },
    { count: newUsers7d }, { count: activeCases }, { count: newCases7d },
    { count: proSubs }, { count: premiumSubs },
    { count: openFlags }, { count: critical24h },
    { count: escalations }, { count: chatMsgs7d },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'client'),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'lawyer'),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('tier', 'pro').eq('status', 'active'),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('tier', 'premium').eq('status', 'active'),
    supabase.from('nde_flags').select('*', { count: 'exact', head: true }).is('resolved_at', null),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('severity', 'critical').gte('created_at', ago24h),
    supabase.from('escalation_drafts').select('*', { count: 'exact', head: true }),
    supabase.from('chat_messages').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
  ]);

  return NextResponse.json({
    users:         { total: totalUsers, clients, lawyers, new_7d: newUsers7d },
    cases:         { active: activeCases, new_7d: newCases7d },
    subscriptions: { pro: proSubs, premium: premiumSubs, mrr_usd: ((proSubs??0)*29)+((premiumSubs??0)*79) },
    platform:      { open_flags: openFlags, critical_24h: critical24h, escalations, chat_7d: chatMsgs7d },
    generated_at:  new Date().toISOString(),
  });
}
