import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DeadlineTracker } from '@/components/deadlines/deadline-tracker';
import type { DeadlineRowFull } from '@/components/deadlines/deadline-list';

export default async function DeadlinesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch user's active cases + hijri preference in parallel
  const [{ data: casesRaw }, { data: profileRow }] = await Promise.all([
    supabase.from('cases').select('id, title')
      .eq('client_id', user.id).eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase.from('users').select('hijri_calendar').eq('id', user.id).maybeSingle(),
  ]);

  const hijriCalendar = profileRow?.hijri_calendar ?? false;

  const cases = (casesRaw ?? []).map((c) => ({ id: c.id, title: c.title }));
  const caseIds = cases.map((c) => c.id);

  // ── Fetch all deadlines for those cases ────────────────────
  const { data: deadlinesRaw } = caseIds.length
    ? await supabase
        .from('deadlines')
        .select('id, title, due_date, type, status, reminder_days, case_id')
        .in('case_id', caseIds)
        .order('due_date', { ascending: true })
    : { data: [] };

  // Build a case_id → title map
  const caseMap = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  const deadlines: DeadlineRowFull[] = (deadlinesRaw ?? []).map((d) => ({
    id:            d.id,
    title:         d.title,
    due_date:      d.due_date,
    type:          d.type,
    status:        d.status,
    reminder_days: d.reminder_days ?? [7, 3, 1],
    case_id:       d.case_id,
    case_title:    caseMap[d.case_id] ?? '',
  }));

  return (
    <DeadlineTracker
      initialDeadlines={deadlines}
      cases={cases}
      hijriCalendar={hijriCalendar}
    />
  );
}
