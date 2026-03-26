import { NextResponse }       from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { generateBulkICS }   from '@/lib/calendar';
import type { CalendarDeadline } from '@/lib/calendar';

// ──────────────────────────────────────────────────────────────────
// GET /api/cases/[id]/deadlines/calendar
//
// Returns a bulk .ics file containing ALL pending deadlines for a
// case. Triggered by "Sync all to calendar" on the deadline tracker.
//
// PRD Screen 7 — "Sync to Calendar" bulk action
// Gap Analysis Task 5
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: caseId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify case ownership (RLS + explicit check)
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, title, client_id, jurisdiction')
    .eq('id', caseId)
    .eq('client_id', user.id)
    .maybeSingle();

  if (!caseRow) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Fetch all pending deadlines for this case
  const { data: dls, error } = await supabase
    .from('deadlines')
    .select('id, title, due_date, type')
    .eq('case_id', caseId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dls?.length) {
    return NextResponse.json(
      { error: 'No pending deadlines found for this case' },
      { status: 404 }
    );
  }

  const deadlines: CalendarDeadline[] = dls.map((dl) => ({
    id:           dl.id,
    title:        dl.title,
    due_date:     dl.due_date,
    type:         dl.type as CalendarDeadline['type'],
    case_id:      caseRow.id,
    case_title:   caseRow.title,
    jurisdiction: caseRow.jurisdiction ?? undefined,
  }));

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  const calName = `Wakeela — ${caseRow.title}`;
  const ics     = generateBulkICS(deadlines, calName, appUrl);

  const safeName = caseRow.title.replace(/[^a-z0-9\u0600-\u06ff\s-]/gi, '').trim().slice(0, 60);
  const filename = `wakeela-deadlines-${safeName || caseId.slice(0, 8)}.ics`;

  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
