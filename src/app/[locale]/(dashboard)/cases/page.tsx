import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  Plus, FolderOpen, Scale, Shield, Calendar,
  FileText, AlertTriangle, Clock, Users,
  Building2, Home, MoreHorizontal, ChevronRight, ChevronLeft,
} from 'lucide-react';

const CASE_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  employment: { icon: Scale,         color: 'text-blue-600   bg-blue-50   dark:bg-blue-950/40'   },
  family:     { icon: Users,         color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
  commercial: { icon: Building2,     color: 'text-amber-600  bg-amber-50  dark:bg-amber-950/40'  },
  property:   { icon: Home,          color: 'text-green-600  bg-green-50  dark:bg-green-950/40'  },
  criminal:   { icon: Shield,        color: 'text-red-600    bg-red-50    dark:bg-red-950/40'    },
  other:      { icon: MoreHorizontal,color: 'text-gray-600   bg-gray-50   dark:bg-gray-900/40'   },
};

export default async function CasesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const Chevron  = isRTL ? ChevronLeft : ChevronRight;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: cases } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, jurisdiction, city, status,
      health_score, lawyer_name, created_at, updated_at,
      deadlines(id, due_date, status),
      nde_flags(id, severity, resolved_at),
      documents(id)
    `)
    .eq('client_id', user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  const allCases = cases ?? [];
  const activeCases = allCases.filter((c) => c.status === 'active');
  const closedCases = allCases.filter((c) => c.status === 'closed');

  const caseTypeLabel: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
  const fmtDate   = (d: string) => new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

  const CaseCard = ({ c }: { c: typeof allCases[0] }) => {
    const cfg      = CASE_TYPE_CONFIG[c.case_type] ?? CASE_TYPE_CONFIG.other;
    const Icon     = cfg.icon;
    const flags    = (c.nde_flags  as { resolved_at: string | null; severity: string }[]).filter((f) => !f.resolved_at);
    const pending  = (c.deadlines  as { due_date: string; status: string }[]).filter((d) => d.status === 'pending');
    const nextDL   = pending.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
    const docCount = (c.documents  as unknown[]).length;
    const score    = c.health_score;
    const scoreColor = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';

    return (
      <Link href={`/cases/${c.id}`}
        className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 hover:border-[#1A3557]/30 hover:shadow-md transition-all duration-200">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cfg.color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate group-hover:text-[#1A3557] transition-colors">
                {c.title}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="rounded-full bg-[#1A3557]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1A3557]">
                  {caseTypeLabel[c.case_type] ?? c.case_type}
                </span>
                {c.jurisdiction && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Scale className="h-2.5 w-2.5" />{c.jurisdiction}
                  </span>
                )}
              </div>
            </div>
            <span className={cn('text-sm font-black shrink-0', scoreColor)}>{score}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs mt-2">
            {c.lawyer_name
              ? <span className="flex items-center gap-1 text-muted-foreground"><Shield className="h-3 w-3" />{c.lawyer_name}</span>
              : <span className="text-muted-foreground/50">{isRTL ? 'لا يوجد محامٍ' : 'No lawyer'}</span>}
            {nextDL && (
              <span className={cn('flex items-center gap-1', daysUntil(nextDL.due_date) <= 3 ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                <Calendar className="h-3 w-3" />{fmtDate(nextDL.due_date)}
              </span>
            )}
            {flags.length > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle className="h-3 w-3" />{flags.length}
              </span>
            )}
            {docCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <FileText className="h-3 w-3" />{docCount}
              </span>
            )}
            <span className="flex items-center gap-1 text-muted-foreground ms-auto">
              <Clock className="h-3 w-3" />{fmtDate(c.updated_at)}
            </span>
          </div>
        </div>
        <Chevron className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1 group-hover:text-[#1A3557] transition-colors" />
      </Link>
    );
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">{isRTL ? 'قضاياي' : 'My Cases'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRTL ? `${activeCases.length} قضية نشطة` : `${activeCases.length} active case${activeCases.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/cases/new"
          className="flex items-center gap-2 rounded-xl bg-[#1A3557] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition shadow-sm">
          <Plus className="h-4 w-4" />
          {isRTL ? 'قضية جديدة' : 'New Case'}
        </Link>
      </div>

      {allCases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card py-20 text-center">
          <FolderOpen className="mx-auto h-14 w-14 text-muted-foreground/20 mb-4" />
          <p className="text-lg font-semibold text-foreground mb-1">{isRTL ? 'لا توجد قضايا بعد' : 'No cases yet'}</p>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-5">
            {isRTL ? 'ابدأ بإنشاء قضيتك الأولى.' : 'Start by creating your first case.'}
          </p>
          <Link href="/cases/new"
            className="flex items-center gap-2 rounded-xl bg-[#1A3557] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition">
            <Plus className="h-4 w-4" />
            {isRTL ? 'قضية جديدة' : 'New Case'}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active cases */}
          {activeCases.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isRTL ? 'القضايا النشطة' : 'Active Cases'}
              </h2>
              {activeCases.map((c) => <CaseCard key={c.id} c={c} />)}
            </div>
          )}
          {/* Closed cases */}
          {closedCases.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isRTL ? 'القضايا المغلقة' : 'Closed Cases'}
              </h2>
              {closedCases.map((c) => <CaseCard key={c.id} c={c} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
