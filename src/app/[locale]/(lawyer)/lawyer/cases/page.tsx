import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { FolderOpen, Scale, Calendar, MessageCircle, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function LawyerCasesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch all cases this lawyer is assigned to
  const { data: assignments } = await supabase
    .from('case_lawyers')
    .select(`
      case_id, status, created_at,
      cases!inner(
        id, title, case_type, jurisdiction, city, status, health_score,
        created_at, updated_at,
        deadlines(id, due_date, status),
        users!cases_client_id_fkey(id, full_name, email)
      )
    `)
    .eq('lawyer_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const cases = (assignments ?? []).map((a) => ({
    ...(a.cases as unknown as {
      id: string; title: string; case_type: string; jurisdiction: string;
      city: string; status: string; health_score: number;
      created_at: string; updated_at: string;
      deadlines: { id: string; due_date: string; status: string }[];
      users: { id: string; full_name: string; email: string };
    }),
  }));

  const caseTypeLabel: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-foreground">
          {isRTL ? 'القضايا المُسنَدة إليّ' : 'My Assigned Cases'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isRTL
            ? `${cases.length} قضية نشطة`
            : `${cases.length} active case${cases.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-base font-semibold text-foreground mb-1">
            {isRTL ? 'لا توجد قضايا بعد' : 'No cases yet'}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {isRTL
              ? 'عندما يرسل لك موكّل رابط دعوة ويقبل، ستظهر القضية هنا.'
              : 'When a client invites you and you accept, the case will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cases.map((c) => {
            const pendingDLs = c.deadlines?.filter((d) => d.status === 'pending') ?? [];
            const nextDL = pendingDLs.sort((a, b) =>
              new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
            )[0];
            const daysUntil = nextDL
              ? Math.ceil((new Date(nextDL.due_date).getTime() - Date.now()) / 86_400_000)
              : null;

            return (
              <Link key={c.id} href={`/lawyer/cases/${c.id}`}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-[#0E7490]/50 hover:shadow-md transition-all duration-200">

                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="rounded-full bg-[#0E7490]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0E7490]">
                        {caseTypeLabel[c.case_type] ?? c.case_type}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-foreground truncate">{c.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Scale className="h-3 w-3" />
                      {c.jurisdiction}{c.city && `, ${c.city}`}
                    </p>
                  </div>
                  <ChevronIcon className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#0E7490] shrink-0 mt-1 transition" />
                </div>

                {/* Client info */}
                {c.users && (
                  <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 mb-3">
                    <div className="h-6 w-6 rounded-full bg-[#1A3557]/20 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-[#1A3557]">
                        {c.users.full_name?.[0]?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.users.full_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{c.users.email}</p>
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {daysUntil !== null && (
                    <span className={cn(
                      'flex items-center gap-1 rounded-full px-2.5 py-1 font-medium',
                      daysUntil <= 1 ? 'bg-red-100 text-red-700'
                        : daysUntil <= 7 ? 'bg-amber-100 text-amber-700'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      <Calendar className="h-3 w-3" />
                      {daysUntil === 0
                        ? (isRTL ? 'اليوم' : 'Today')
                        : daysUntil === 1
                        ? (isRTL ? 'غداً' : 'Tomorrow')
                        : (isRTL ? `${daysUntil} يوم` : `${daysUntil}d`)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <ClipboardList className="h-3 w-3" />
                    {isRTL ? `${pendingDLs.length} موعد` : `${pendingDLs.length} deadline${pendingDLs.length !== 1 ? 's' : ''}`}
                  </span>
                  <span className="flex items-center gap-1 ms-auto">
                    <MessageCircle className="h-3 w-3" />
                    {isRTL ? 'محادثة' : 'Chat'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
