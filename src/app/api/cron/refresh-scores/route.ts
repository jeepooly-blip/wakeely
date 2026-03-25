import { NextResponse }      from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime     = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createAdminClient();

  // Bulk refresh all lawyer scores via DB function
  const { data: count, error } = await sb.rpc('refresh_all_scores' as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also update health_score for every active case
  const { data: cases } = await sb.from('cases').select('id').eq('status', 'active');
  let healthCount = 0;
  for (const c of cases ?? []) {
    const { data: score } = await sb.rpc('calculate_health_score' as never, { p_case_id: c.id });
    if (score !== null) {
      await sb.from('cases').update({ health_score: score }).eq('id', c.id);
      healthCount++;
    }
  }

  return NextResponse.json({ ok: true, scores_updated: count ?? 0, health_updated: healthCount, at: new Date().toISOString() });
}
