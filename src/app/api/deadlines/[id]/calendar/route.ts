import { NextResponse }     from 'next/server';
import { createClient }    from '@/lib/supabase/server';
import { generateICS }     from '@/lib/calendar';
import type { CalendarDeadline } from '@/lib/calendar';

// ──────────────────────────────────────────────────────────────────
// GET /api/deadlines/[id]/calendar
//
// Returns an RFC 5545 .ics file for a single deadline so the user
// can add it to iOS Calendar, Google Calendar, Outlook, etc.
//
// PRD Screen 7 — "Add to Calendar" per deadline
// Gap Analysis Task 5
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch deadline + owning case in one query (RLS enforces ownership)
  const { data: dl, error } = await supabase
    .from('deadlines')
    .select(`
      id, title, due_date, type,
      cases!inner (
        id, title, client_id, jurisdiction
      )
    `)
    .eq('id', id)
    .eq('cases.client_id', user.id)
    .maybeSingle();

  if (error || !dl) {
    return NextResponse.json({ error: 'Deadline not found' }, { status: 404 });
  }

  const caseRow = dl.cases as { id: string; title: string; jurisdiction: string | null };

  const deadline: CalendarDeadline = {
    id:           dl.id,
    title:        dl.title,
    due_date:     dl.due_date,
    type:         dl.type as CalendarDeadline['type'],
    case_id:      caseRow.id,
    case_title:   caseRow.title,
    jurisdiction: caseRow.jurisdiction ?? undefined,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  const ics    = generateICS(deadline, appUrl);

  // Sanitise filename
  const safeName = dl.title.replace(/[^a-z0-9\u0600-\u06ff\s-]/gi, '').trim().slice(0, 60);
  const filename = `wakeela-deadline-${safeName || id.slice(0, 8)}.ics`;

  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
