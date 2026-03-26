import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { ActionLogForm } from '@/components/lawyer/action-log-form';
import { SecureChat } from '@/components/chat/secure-chat';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, Scale, Calendar, FileText, Clock,
  CheckCircle2, AlertTriangle, User, ClipboardList, MessageCircle, Hash, Receipt,
} from 'lucide-react';

export default async function LawyerCaseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const supabase = await createClient();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Verify lawyer is assigned
  const { data: assignment } = await supabase
    .from('case_lawyers')
    .select('id, created_at')
    .eq('case_id', id)
    .eq('lawyer_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!assignment) notFound();

  // Fetch case data
  const { data: c } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, jurisdiction, city, status, health_score,
      description, created_at, updated_at,
      deadlines(id, title, due_date, type, status),
      documents(id, file_name, file_size, version, created_at),
      users!cases_client_id_fkey(id, full_name, email, phone)
    `)
    .eq('id', id)
    .maybeSingle();
  if (!c) notFound();

  // Fetch lawyer's own action logs for this case
  const { data: actionLogs } = await supabase
    .from('action_logs')
    .select('*')
    .eq('case_id', id)
    .eq('lawyer_id', user.id)
    .order('action_date', { ascending: false });

  type DeadlineRow = { id: string; title: string; due_date: string; type: string; status: string };
  type DocRow = { id: string; file_name: string; file_size: number; version: number; created_at: string };

  const deadlines  = c.deadlines as unknown as DeadlineRow[];
  const documents  = c.documents as unknown as DocRow[];
  const client     = c.users as unknown as { id: string; full_name: string; email: string; phone?: string };
  const logs       = actionLogs ?? [];
  const pendingDLs = deadlines.filter((d) => d.status === 'pending');

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'long', year: 'numeric' });

  const daysUntil = (d: string) =>
    Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);

  const caseTypeLabel: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  const actionTypeLabel: Record<string, string> = isRTL
    ? { court_hearing: 'جلسة', document_filed: 'مستند', client_contacted: 'تواصل', research: 'بحث', negotiation: 'مفاوضة', correspondence: 'مراسلة', other: 'أخرى' }
    : { court_hearing: 'Court', document_filed: 'Document', client_contacted: 'Contact', research: 'Research', negotiation: 'Negotiation', correspondence: 'Correspondence', other: 'Other' };

  return (
    <div className="space-y-6 pb-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/lawyer/cases"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
          <BackIcon className="h-4 w-4" />
          {isRTL ? 'قضاياي' : 'My Cases'}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{c.title}</span>
      </div>

      {/* Case header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="rounded-full bg-[#0E7490]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0E7490]">
                {caseTypeLabel[c.case_type] ?? c.case_type}
              </span>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {isRTL ? 'نشطة' : 'Active'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">{c.title}</h1>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {c.jurisdiction && (
                <span className="flex items-center gap-1"><Scale className="h-3 w-3" />{c.jurisdiction}</span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />{fmtDate(c.created_at)}
              </span>
            </div>
          </div>
          {/* Chat button */}
          <Link href={`/cases/${id}/chat`}
            className="flex items-center gap-2 rounded-xl bg-[#0E7490] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#0c6578] transition shrink-0">
            <MessageCircle className="h-4 w-4" />
            {isRTL ? 'فتح المحادثة' : 'Open Chat'}
          </Link>
        </div>
        {c.description && (
          <p className="mt-4 text-sm text-muted-foreground border-t border-border pt-4">{c.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Client info */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <User className="h-3.5 w-3.5" />{isRTL ? 'الموكّل' : 'Client'}
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-[#1A3557]/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[#1A3557]">
                {client?.full_name?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{client?.full_name}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{client?.email}</p>
            </div>
          </div>
          {client?.phone && (
            <p className="text-xs text-muted-foreground" dir="ltr">📱 {client.phone}</p>
          )}
        </div>

        {/* Deadlines */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />{isRTL ? 'المواعيد' : 'Deadlines'}
            <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">{pendingDLs.length}</span>
          </h3>
          {pendingDLs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {isRTL ? 'لا توجد مواعيد قادمة' : 'No upcoming deadlines'}
            </p>
          ) : (
            <ul className="space-y-2">
              {pendingDLs.slice(0, 4).map((d) => {
                const days = daysUntil(d.due_date);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(d.due_date)}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                      days <= 1 ? 'bg-red-100 text-red-700'
                        : days <= 7 ? 'bg-amber-100 text-amber-700'
                        : 'bg-muted text-muted-foreground'
                    )} dir="ltr">{days}d</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Documents */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />{isRTL ? 'المستندات' : 'Documents'}
            <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">{documents.length}</span>
          </h3>
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {isRTL ? 'لا توجد مستندات' : 'No documents'}
            </p>
          ) : (
            <ul className="space-y-2">
              {documents.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{d.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">v{d.version}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Action log form */}
      <ActionLogForm caseId={id} locale={locale} />

      {/* Past action logs */}
      {logs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#0E7490]" />
            {isRTL ? 'الإجراءات المسجّلة' : 'Logged Actions'}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{logs.length}</span>
          </h3>
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0E7490]/10">
                  <ClipboardList className="h-3.5 w-3.5 text-[#0E7490]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {actionTypeLabel[log.action_type] ?? log.action_type}
                    </span>
                    <span className="text-[10px] text-muted-foreground" dir="ltr">
                      {new Date(log.action_date).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{log.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice CTA */}
      <div className="flex items-center justify-between rounded-2xl border border-[#C89B3C]/30 bg-[#C89B3C]/5 dark:bg-[#C89B3C]/10 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4 text-[#C89B3C]" />
            {isRTL ? 'الفواتير' : 'Invoices'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isRTL ? 'أنشئ فاتورة ضريبية متوافقة مع JoFotara وأرسلها للموكّل' : 'Create a JoFotara-compliant tax invoice and send it to the client'}
          </p>
        </div>
        <Link
          href={`/${locale}/lawyer/cases/${id}/invoices/new`}
          className="flex items-center gap-1.5 rounded-xl bg-[#C89B3C] text-white px-4 py-2.5 text-xs font-bold hover:bg-[#b8892f] transition shrink-0"
        >
          <Receipt className="h-3.5 w-3.5" />
          {isRTL ? 'إنشاء فاتورة' : 'Create Invoice'}
        </Link>
      </div>

      {/* Secure chat */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#0E7490]" />
          {isRTL ? 'المحادثة مع الموكّل' : 'Chat with Client'}
        </h3>
        <SecureChat caseId={id} caseTitle={c.title} userId={user.id} userRole="lawyer" locale={locale} />
      </div>
    </div>
  );
}
