import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { LawyerPerformanceScore } from '@/types';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: case_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only the case owner (client) can see the score
  const { data: c } = await supabase
    .from('cases').select('id, created_at')
    .eq('id', case_id).eq('client_id', user.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url     = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1';

  // Try cached score first (unless force-refresh requested)
  if (!refresh) {
    const { data: cached } = await supabase
      .from('lawyer_scores')
      .select('total,activity,recency,deadline_respect,responsiveness,logs_count,last_activity_at,computed_at')
      .eq('case_id', case_id)
      .order('total', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      // Return cached if computed within the last hour
      const age = Date.now() - new Date(cached.computed_at).getTime();
      if (age < 3600_000) {
        return NextResponse.json({
          total:            cached.total,
          activity:         cached.activity,
          recency:          cached.recency,
          deadline_respect: cached.deadline_respect,
          responsiveness:   cached.responsiveness,
          logs_count:       cached.logs_count,
          last_activity:    cached.last_activity_at,
          from_cache:       true,
          computed_at:      cached.computed_at,
        } satisfies LawyerPerformanceScore & { from_cache: boolean; computed_at: string });
      }
    }
  }

  // Compute fresh using DB function (writes to cache automatically)
  const admin = createAdminClient();

  // Get the active lawyer for this case
  const { data: assignment } = await admin
    .from('case_lawyers').select('lawyer_id')
    .eq('case_id', case_id).eq('status', 'active')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (!assignment) {
    // No lawyer assigned yet — return a neutral placeholder
    return NextResponse.json({
      total: 0, activity: 0, recency: 0, deadline_respect: 0, responsiveness: 0,
      logs_count: 0, last_activity: null, from_cache: false, no_lawyer: true,
    });
  }

  // Trigger DB recompute
  await admin.rpc('compute_lawyer_score' as never, {
    p_case_id:   case_id,
    p_lawyer_id: assignment.lawyer_id,
  });

  // Fetch freshly written score
  const { data: fresh } = await admin
    .from('lawyer_scores').select('*')
    .eq('case_id', case_id).eq('lawyer_id', assignment.lawyer_id).maybeSingle();

  if (!fresh) {
    return NextResponse.json({ total: 0, activity: 0, recency: 0, deadline_respect: 0, responsiveness: 0, logs_count: 0, last_activity: null });
  }

  return NextResponse.json({
    total:            fresh.total,
    activity:         fresh.activity,
    recency:          fresh.recency,
    deadline_respect: fresh.deadline_respect,
    responsiveness:   fresh.responsiveness,
    logs_count:       fresh.logs_count,
    last_activity:    fresh.last_activity_at,
    from_cache:       false,
    computed_at:      fresh.computed_at,
  });
}
