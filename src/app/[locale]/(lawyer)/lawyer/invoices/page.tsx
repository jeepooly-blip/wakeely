import { redirect }         from 'next/navigation';
import { getLocale }        from 'next-intl/server';
import { createClient }     from '@/lib/supabase/server';
import { Link }             from '@/i18n/navigation';
import { cn }               from '@/lib/utils';
import {
  FileText, Plus, CheckCircle2, Clock, AlertTriangle,
  Send, Eye, XCircle, DollarSign,
} from 'lucide-react';
import type { InvoiceStatus } from '@/types';

export default async function LawyerInvoicesPage() {
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch all invoices the lawyer created
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, status,
      total_amount, currency, matter_description, sent_at, paid_at,
      cases(id, title),
      client:users!invoices_client_id_fkey(full_name)
    `)
    .eq('lawyer_id', user.id)
    .order('created_at', { ascending: false });

  const all = invoices ?? [];

  // Summary stats
  const stats = {
    total:   all.length,
    draft:   all.filter((i) => i.status === 'draft').length,
    pending: all.filter((i) => ['sent', 'viewed'].includes(i.status)).length,
    paid:    all.filter((i) => i.status === 'paid').length,
    overdue: all.filter((i) => i.status === 'overdue').length,
    revenue: all.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.total_amount ?? 0), 0),
    outstanding: all.filter((i) => ['sent','viewed','overdue'].includes(i.status))
                    .reduce((s, i) => s + (i.total_amount ?? 0), 0),
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-JO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-JO' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  const statusConfig: Record<InvoiceStatus, { icon: React.ElementType; color: string; label: string }> = {
    draft:     { icon: FileText,    color: 'text-gray-500  bg-gray-100',                                    label: isRTL ? 'مسودة'        : 'Draft'     },
    sent:      { icon: Send,        color: 'text-[#1A3557] bg-[#1A3557]/10',                                label: isRTL ? 'مُرسَلة'      : 'Sent'      },
    viewed:    { icon: Eye,         color: 'text-[#0E7490] bg-[#0E7490]/10',                                label: isRTL ? 'مشاهدة'       : 'Viewed'    },
    paid:      { icon: CheckCircle2,color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',        label: isRTL ? 'مدفوعة'       : 'Paid'      },
    overdue:   { icon: AlertTriangle,color:'text-red-600   bg-red-100    dark:bg-red-900/30',               label: isRTL ? 'متأخرة'       : 'Overdue'   },
    cancelled: { icon: XCircle,     color: 'text-gray-400  bg-gray-100',                                    label: isRTL ? 'ملغاة'        : 'Cancelled' },
  };

  const currency = all[0]?.currency ?? 'JOD';

  return (
    <div className="space-y-6 pb-10" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-[#1A3557]" />
            {isRTL ? 'الفواتير' : 'Invoices'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRTL ? 'إدارة جميع فواتيرك' : 'Manage all your invoices'}
          </p>
        </div>
        <Link href={`/${locale}/lawyer/cases`}
          className="flex items-center gap-1.5 rounded-xl bg-[#1A3557] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition">
          <Plus className="h-4 w-4" />
          {isRTL ? 'فاتورة جديدة' : 'New Invoice'}
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: isRTL ? 'مستحق' : 'Outstanding',
            value: `${fmt(stats.outstanding)} ${currency}`,
            icon: DollarSign,
            color: 'text-[#1A3557] bg-[#1A3557]/10',
            highlight: stats.outstanding > 0,
          },
          {
            label: isRTL ? 'محصّل' : 'Collected',
            value: `${fmt(stats.revenue)} ${currency}`,
            icon: CheckCircle2,
            color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/20',
            highlight: false,
          },
          {
            label: isRTL ? 'قيد الانتظار' : 'Pending',
            value: stats.pending,
            icon: Clock,
            color: 'text-[#0E7490] bg-[#0E7490]/10',
            highlight: false,
          },
          {
            label: isRTL ? 'متأخرة' : 'Overdue',
            value: stats.overdue,
            icon: AlertTriangle,
            color: 'text-red-600 bg-red-100 dark:bg-red-900/20',
            highlight: stats.overdue > 0,
          },
        ].map(({ label, value, icon: Icon, color, highlight }) => (
          <div key={label} className={cn(
            'rounded-2xl border bg-card p-5',
            highlight ? 'border-[#1A3557]/30 dark:border-[#1A3557]/50' : 'border-border'
          )}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', color)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      {all.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card py-20 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-lg font-semibold text-foreground mb-1">
            {isRTL ? 'لا توجد فواتير بعد' : 'No invoices yet'}
          </p>
          <p className="text-sm text-muted-foreground mb-5">
            {isRTL ? 'أنشئ فاتورة من صفحة القضية' : 'Create an invoice from any case page'}
          </p>
          <Link href={`/${locale}/lawyer/cases`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1A3557] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition">
            <Plus className="h-4 w-4" />
            {isRTL ? 'الذهاب إلى القضايا' : 'Go to Cases'}
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {all.map((inv) => {
              const sc     = statusConfig[inv.status as InvoiceStatus] ?? statusConfig.draft;
              const Icon   = sc.icon;
              const caseRow = inv.cases as { id: string; title: string } | null;
              const client  = inv.client as { full_name: string } | null;
              const isOverdue = inv.status !== 'paid' && inv.status !== 'cancelled'
                && new Date(inv.due_date) < new Date();

              return (
                <Link
                  key={inv.id}
                  href={`/${locale}/lawyer/invoices/${inv.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition"
                >
                  {/* Status icon */}
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
                    sc.color
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Main info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground" dir="ltr">{inv.invoice_number}</span>
                      <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', sc.color)}>
                        {sc.label}
                      </span>
                      {isOverdue && inv.status !== 'paid' && (
                        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                          {isRTL ? 'متأخرة' : 'OVERDUE'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {client?.full_name ?? '—'} · {caseRow?.title ?? '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5" dir="ltr">
                      {fmtDate(inv.invoice_date)} → {fmtDate(inv.due_date)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-end shrink-0">
                    <p className={cn(
                      'text-base font-black',
                      inv.status === 'paid' ? 'text-emerald-600' : 'text-foreground'
                    )} dir="ltr">
                      {fmt(inv.total_amount)} {inv.currency}
                    </p>
                    {inv.paid_at && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">
                        {isRTL ? `دُفعت ${fmtDate(inv.paid_at)}` : `Paid ${fmtDate(inv.paid_at)}`}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
