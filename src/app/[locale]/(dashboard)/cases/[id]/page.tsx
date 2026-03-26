import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { NDEAlertBanner, type NDEFlag } from '@/components/nde/nde-alert-banner';
import { LawyerAccessPanel } from '@/components/lawyer/lawyer-access-panel';
import { InviteButton } from '@/components/cases/invite-button';
import { LawyerScorePanel } from '@/components/scores/lawyer-score-panel';
import { CaseHealthCard } from '@/components/scores/case-health-card';
import { HealthBadge } from '@/components/scores/health-badge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, Scale, Calendar, FileText,
  CheckCircle2, Clock, Hash, Plus, AlertTriangle,
  Layers, BarChart2, MessageCircle, Download,
} from 'lucide-react';

// HealthBar replaced by HealthBadge + CaseHealthCard components

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: c } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, jurisdiction, city, status, health_score,
      lawyer_name, lawyer_bar_number, lawyer_phone, lawyer_email,
      description, created_at, updated_at,
      deadlines(id, title, due_date, type, status, created_at),
      nde_flags(id, rule_id, severity, triggered_at, resolved_at, action_taken),
      documents(id, file_name, file_size, file_hash, version, created_at),
      timeline_events(id, event_type, payload, actor_id, is_system_generated, created_at)
    `)
    .eq('id', id)
    .eq('client_id', user.id)
    .maybeSingle();

  if (!c) notFound();

  type DeadlineRow  = { id: string; title: string; due_date: string; type: string; status: string };
  type FlagRow      = { id: string; rule_id: number; severity: string; triggered_at: string; resolved_at: string | null; action_taken: string | null };
  type DocRow       = { id: string; file_name: string; file_size: number; file_hash: string; version: number; created_at: string };
  type TimelineRow  = { id: string; event_type: string; payload: Record<string, unknown>; actor_id: string; is_system_generated: boolean; created_at: string };

  const deadlines      = c.deadlines       as DeadlineRow[];
  const flags          = c.nde_flags       as FlagRow[];
  const documents      = c.documents       as DocRow[];
  const timelineEvents = (c.timeline_events as TimelineRow[])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const openFlags  = flags.filter((f) => !f.resolved_at);
  const pendingDLs = deadlines.filter((d) => d.status === 'pending')
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const worstSeverity = openFlags.length > 0
    ? openFlags.reduce((worst, f) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[f.severity as keyof typeof order] < order[worst as keyof typeof order] ? f.severity : worst;
      }, openFlags[0].severity)
    : null;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'long', year: 'numeric' });

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const daysUntil = (d: string) =>
    Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);

  const caseTypeLabel: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  const eventIcon = (type: string): React.ElementType => {
    const m: Record<string, React.ElementType> = {
      case_created:            CheckCircle2, document_uploaded: FileText,
      deadline_added:          Calendar,     deadline_completed: CheckCircle2,
      nde_flag:                AlertTriangle, nde_flag_resolved: CheckCircle2,
      deadline_reminder_sent:  Clock,         action_logged:     Layers,
      lawyer_joined:           MessageCircle, lawyer_revoked:    AlertTriangle,
    };
    return m[type] ?? Clock;
  };

  const eventColor = (type: string) => {
    if (type === 'nde_flag')      return 'text-amber-600  bg-amber-50   dark:bg-amber-900/30';
    if (type === 'nde_flag_resolved' || type === 'case_created' || type === 'deadline_completed')
                                   return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30';
    if (type === 'lawyer_joined')  return 'text-[#0E7490]  bg-[#0E7490]/10';
    if (type === 'lawyer_revoked') return 'text-red-600    bg-red-50     dark:bg-red-900/30';
    if (type.includes('deadline')) return 'text-[#0E7490]  bg-[#0E7490]/10';
    return 'text-[#1A3557] bg-[#1A3557]/10';
  };

  const eventLabel = (type: string, payload: Record<string, unknown>) => {
    const m: Record<string, string> = {
      case_created:           isRTL ? 'تم إنشاء القضية'            : 'Case created',
      document_uploaded:      isRTL ? `رُفع: ${payload.file_name ?? ''}` : `Uploaded: ${payload.file_name ?? ''}`,
      deadline_added:         isRTL ? `موعد جديد: ${payload.title ?? ''}` : `Deadline added: ${payload.title ?? ''}`,
      deadline_completed:     isRTL ? 'تم إكمال موعد'              : 'Deadline completed',
      deadline_reminder_sent: isRTL ? 'تم إرسال تذكير'             : 'Reminder sent',
      action_logged:          isRTL ? `إجراء مسجّل: ${payload.description ?? ''}` : `Action logged: ${payload.description ?? ''}`,
      lawyer_joined:          isRTL ? 'انضم محامٍ إلى القضية'       : 'Lawyer joined case',
      lawyer_revoked:         isRTL ? 'تم إلغاء صلاحية المحامي'    : 'Lawyer access revoked',
      nde_flag:               isRTL ? `تنبيه NDE: ${payload.rule_name as string ?? ''}` : `Alert: ${payload.rule_name as string ?? payload.message as string ?? ''}`,
      nde_flag_resolved:      isRTL ? `تم حل التنبيه — ${payload.action_taken as string ?? ''}` : `Alert resolved — ${payload.action_taken as string ?? ''}`,
    };
    return m[type] ?? type.replace(/_/g, ' ');
  };

  const bannerFlags: NDEFlag[] = openFlags.map((f) => ({
    id: f.id, rule_id: f.rule_id as 1|2|3, severity: f.severity as NDEFlag['severity'],
    triggered_at: f.triggered_at, resolved_at: f.resolved_at, action_taken: f.action_taken,
    case_id: id,
    payload: timelineEvents.find((e) => e.event_type === 'nde_flag' && (e.payload?.rule_id as number) === f.rule_id)?.payload ?? {},
  }));

  return (
    <div className="space-y-5 pb-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/cases"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
          <BackIcon className="h-4 w-4" />
          {isRTL ? 'قضاياي' : 'My Cases'}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground truncate max-w-[240px]">{c.title}</span>
      </div>

      {/* NDE banner */}
      {bannerFlags.length > 0 && (
        <NDEAlertBanner flags={bannerFlags} caseId={id} onUpdate={() => {}} />
      )}

      {/* Case header */}
      <div className={cn(
        'page-section',
        worstSeverity === 'critical' ? 'border-red-300    dark:border-red-800/60'
        : worstSeverity === 'high'   ? 'border-orange-300 dark:border-orange-800/60'
        : worstSeverity === 'medium' ? 'border-amber-300  dark:border-amber-800/60'
        : ''
      )}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="badge badge-navy">{caseTypeLabel[c.case_type] ?? c.case_type}</span>
              <span className="badge badge-success">{isRTL ? 'نشطة' : 'Active'}</span>
              {openFlags.length > 0 && (
                <span className="badge badge-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {openFlags.length} {isRTL ? 'تنبيه' : 'alert'}
                </span>
              )}
            </div>
            <h1 className="text-xl font-black text-foreground mb-2 leading-snug">{c.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {c.jurisdiction && (
                <span className="flex items-center gap-1">
                  <Scale className="h-3 w-3" />{c.jurisdiction}{c.city && `, ${c.city}`}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />{fmtDate(c.created_at)}
              </span>
            </div>
          </div>

          {/* Health + chat */}
          <div className="space-y-2 sm:min-w-[220px]">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">
                {isRTL ? 'صحة القضية' : 'Case Health'}
              </p>
              <div className="flex items-center justify-between mb-2">
                <HealthBadge score={c.health_score} isRTL={isRTL} size="lg" />
                <span className="text-2xl font-black tabular-nums text-foreground" dir="ltr">{c.health_score}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-700',
                  c.health_score >= 75 ? 'bg-emerald-500' : c.health_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                )} style={{ width: `${c.health_score}%` }} />
              </div>
            </div>
            <a href={`/${locale}/cases/${id}/chat`}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#0E7490]/30 bg-[#0E7490]/5 px-4 py-2.5 text-xs font-semibold text-[#0E7490] hover:bg-[#0E7490]/10 transition">
              <MessageCircle className="h-4 w-4" />
              {isRTL ? 'المحادثة مع المحامي' : 'Chat with Lawyer'}
            </a>
            <InviteButton
              caseId={id}
              caseTitle={c.title}
              locale={locale}
            />
          </div>
        </div>

        {c.description && (
          <p className="mt-4 text-sm text-muted-foreground border-t border-border pt-4 leading-relaxed">
            {c.description}
          </p>
        )}
      </div>

      {/* 3-col: Lawyer | Deadlines | NDE Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Lawyer Access Panel — full component */}
        <LawyerAccessPanel
          caseId={id}
          caseTitle={c.title}
          locale={locale}
          lawyerName={c.lawyer_name ?? undefined}
          lawyerEmail={c.lawyer_email ?? undefined}
          lawyerPhone={c.lawyer_phone ?? undefined}
          lawyerBarNumber={c.lawyer_bar_number ?? undefined}
        />

        {/* Deadlines */}
        <div className="page-section space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              {isRTL ? 'المواعيد القادمة' : 'Upcoming Deadlines'}
              <span className="badge badge-neutral">{pendingDLs.length}</span>
            </h3>
            <Link href="/deadlines" className="text-[10px] text-[#0E7490] hover:underline font-medium">
              {isRTL ? 'الكل' : 'All'}
            </Link>
          </div>
          {pendingDLs.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground">{isRTL ? 'لا توجد مواعيد' : 'No deadlines'}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingDLs.slice(0, 5).map((d) => {
                const days = daysUntil(d.due_date);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(d.due_date)}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                      days < 0  ? 'bg-red-100    text-red-700    dark:bg-red-900/40'
                      : days <= 1 ? 'bg-red-100    text-red-700    dark:bg-red-900/40'
                      : days <= 7 ? 'bg-amber-100  text-amber-700  dark:bg-amber-900/40'
                      : 'bg-muted text-muted-foreground'
                    )} dir="ltr">
                      {days < 0 ? `${Math.abs(days)}d late` : `${days}d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* NDE Status */}
        <div className={cn(
          'page-section space-y-3',
          openFlags.length > 0
            ? 'border-amber-300  dark:border-amber-800/50 bg-amber-50/50  dark:bg-amber-900/10'
            : 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10'
        )}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className={cn('h-3.5 w-3.5', openFlags.length > 0 ? 'text-amber-600' : 'text-emerald-600')} />
            {isRTL ? 'حالة NDE' : 'NDE Status'}
          </h3>
          {openFlags.length === 0 ? (
            <div className="flex flex-col items-center py-3 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500/50 mb-2" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {isRTL ? 'لا توجد تنبيهات' : 'No active alerts'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isRTL ? 'يفحص وكيلا كل 6 ساعات' : 'Checked every 6 hours'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {openFlags.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    {{ 1: isRTL ? 'تقصير المحامي' : 'Inactivity', 2: isRTL ? 'موعد فائت' : 'Missed deadline', 3: isRTL ? 'صمت مطوّل' : 'Extended silence' }[f.rule_id] ?? `Rule ${f.rule_id}`}
                  </p>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                    { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
                      medium:   'bg-amber-100 text-amber-700', low: 'bg-blue-100 text-blue-700' }[f.severity])}>
                    {f.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Escalation CTA */}
      <div className="flex items-center justify-between rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/5 dark:bg-[#1A3557]/10 px-5 py-3">
        <p className="text-sm font-medium text-[#1A3557] dark:text-blue-300">
          {isRTL ? 'هل تحتاج إلى تصعيد؟ استخدم قوالب الرسائل القانونية.' : 'Need to escalate? Use legal letter templates.'}
        </p>
        <Link href={`/escalation/${id}`}
          className="flex items-center gap-1.5 rounded-xl bg-[#1A3557] text-white px-4 py-2 text-xs font-semibold hover:bg-[#1e4a7a] transition shrink-0">
          <BarChart2 className="h-3.5 w-3.5" />
          {isRTL ? 'التصعيد' : 'Escalate'}
        </Link>
      </div>

      {/* Documents */}
      {documents.length > 0 && (
        <div className="page-section">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#1A3557]" />
              {isRTL ? 'المستندات' : 'Documents'}
              <span className="badge badge-neutral">{documents.length}</span>
            </h3>
            <Link href="/vault" className="text-xs text-[#0E7490] hover:underline font-medium">
              {isRTL ? 'عرض الكل في الخزنة' : 'View all in Vault'}
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {documents.slice(0, 4).map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/30 transition">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A3557]/10">
                  <FileText className="h-4 w-4 text-[#1A3557]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                    v{doc.version} · {doc.file_hash.slice(0, 10)}…
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="page-section">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#1A3557]" />
            {isRTL ? 'الجدول الزمني' : 'Case Timeline'}
            <span className="badge badge-neutral">{timelineEvents.length}</span>
          </h3>
          {timelineEvents.length > 0 && (
            <a
              href={`/api/cases/${id}/timeline/export?locale=${locale}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-[#1A3557]/20 bg-[#1A3557]/5 px-3 py-1.5 text-xs font-semibold text-[#1A3557] hover:bg-[#1A3557]/10 transition"
            >
              <Download className="h-3.5 w-3.5" />
              {isRTL ? 'تصدير PDF' : 'Export PDF'}
            </a>
          )}
        </div>

        {timelineEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {isRTL ? 'لا توجد أحداث بعد' : 'No events yet'}
          </p>
        ) : (
          <div className="relative">
            <div className="absolute start-4 top-4 bottom-4 w-px bg-border" aria-hidden />
            <ul className="space-y-4">
              {timelineEvents.map((ev) => {
                const Icon  = eventIcon(ev.event_type);
                const color = eventColor(ev.event_type);
                const isNDE = ev.event_type === 'nde_flag';
                return (
                  <li key={ev.id} className="relative flex items-start gap-4 ps-11">
                    <div className={cn(
                      'absolute start-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background shadow-sm',
                      color, isNDE && 'ring-2 ring-amber-200 dark:ring-amber-900/60'
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className={cn('text-sm font-semibold text-foreground', isNDE && 'text-amber-700 dark:text-amber-400')}>
                        {eventLabel(ev.event_type, ev.payload)}
                      </p>
                      {ev.is_system_generated && (
                        <span className="text-[10px] text-muted-foreground/60">
                          {isRTL ? 'نظام وكيلا' : 'Wakeela system'}
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{fmtDateTime(ev.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Add update button */}
        <div className="mt-5 pt-4 border-t border-border">
          <Link href={`/cases/${id}/chat`}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#1A3557]/20 py-2.5 text-sm font-medium text-[#1A3557] hover:bg-[#1A3557]/5 transition">
            <Plus className="h-4 w-4" />
            {isRTL ? 'إرسال رسالة أو تحديث' : 'Send message or update'}
          </Link>
        </div>
      </div>

      {/* Legal disclaimer */}
      <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed max-w-lg mx-auto">
        {isRTL
          ? 'تنبيهات وكيلا استرشادية فحسب ولا تُعدّ أحكاماً قانونية. استشر دائماً محامياً مرخّصاً.'
          : 'Wakeela alerts are informational only and do not constitute legal findings. Always consult a licensed professional.'}
      </p>
    </div>
  );
}
