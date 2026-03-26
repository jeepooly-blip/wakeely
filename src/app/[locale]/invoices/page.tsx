import { redirect }      from 'next/navigation';
import { getLocale }     from 'next-intl/server';
import { createClient }  from '@/lib/supabase/server';
import { Link }          from '@/i18n/navigation';
import { cn }            from '@/lib/utils';
import {
  FileText, CheckCircle2, Clock, AlertTriangle, Send, Eye,
} from 'lucide-react';
import type { InvoiceStatus } from '@/types';

export default async function ClientInvoicesPage() {
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch all invoices sent to this client (exclude drafts)
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, status,
      total_amount, currency, matter_description, paid_at,
      cases(id, title),
      lawyer:users!invoices_lawyer_id_fkey(full_name)
    `)
    .eq('client_id', user.id)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });

  const all = invoices ?? [];

  const fmt = (n: number) =>
    n.toLocaleString('en-JO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-JO' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  const outstanding = all
    .filter((i) => ['sent','viewed','overdue'].includes(i.status))
    .reduce((s, i) => s + (i.total_amount ?? 0), 0);

  const statusConfig: Record<InvoiceStatus, { color: string; label: string }> = {
    draft:     { color: 'text-gray-500 bg-gray-100',                                 label: isRTL ? 'مسودة'        : 'Draft'     },
    sent:      { color: 'text-[#1A3557] bg-[#1A3557]/10',                           label: isRTL ? 'مُرسَلة'      : 'Sent'      },
    viewed:    { color: 'text-[#0E7490] bg-[#0E7490]/10',                           label: isRTL ? 'مشاهدة'       : 'Viewed'    },
    paid:      { color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',   label: isRTL ? 'مدفوعة'       : 'Paid'      },
    overdue:   { color: 'text-red-600   bg-red-100    dark:bg-red-900/30',          label: isRTL ? 'متأخرة'       : 'Overdue'   },
    cancelled: { color: 'text-gray-400 bg-gray-100',                                label: isRTL ? 'ملغاة'        : 'Cancelled' },
  };

  return (
    <div className="space-y-6 pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-[#1A3557]" />
          {isRTL ? 'فواتيري' : 'My Invoices'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isRTL ? 'جميع الفواتير الصادرة من محاميك' : 'All invoices issued by your lawyer'}
        </p>
      </div>

      {outstanding > 0 && (
        <div className="rounded-2xl border border-[#C89B3C]/30 bg-[#C89B3C]/5 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">
              {isRTL ? 'المبلغ المستحق' : 'Outstanding Balance'}
            </p>
            <p className="text-2xl font-black text-[#C89B3C] mt-0.5" dir="ltr">
              {fmt(outstanding)} {all[0]?.currency ?? 'JOD'}
            </p>
          </div>
          <AlertTriangle className="h-8 w-8 text-[#C89B3C] shrink-0" />
        </div>
      )}

      {all.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card py-20 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-lg font-semibold text-foreground mb-1">
            {isRTL ? 'لا توجد فواتير بعد' : 'No invoices yet'}
          </p>
          <p className="text-sm text-muted-foreground">
            {isRTL ? 'ستظهر هنا الفواتير الصادرة من محاميك' : "Your lawyer's invoices will appear here"}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {all.map((inv) => {
              const sc       = statusConfig[inv.status as InvoiceStatus] ?? statusConfig.sent;
              const caseRow  = inv.cases  as { id: string; title: string } | null;
              const lawyer   = inv.lawyer as { full_name: string } | null;
              const isOverdue = inv.status !== 'paid' && inv.status !== 'cancelled'
                && new Date(inv.due_date) < new Date();

              return (
                <Link
                  key={inv.id}
                  href={`/${locale}/invoices/${inv.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition"
                >
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
                    inv.status === 'paid'
                      ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30'
                      : isOverdue
                      ? 'text-red-600 bg-red-100 dark:bg-red-900/30'
                      : 'text-[#1A3557] bg-[#1A3557]/10'
                  )}>
                    {inv.status === 'paid'
                      ? <CheckCircle2 className="h-4 w-4" />
                      : isOverdue ? <AlertTriangle className="h-4 w-4" />
                      : <FileText className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground" dir="ltr">{inv.invoice_number}</span>
                      <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', sc.color)}>
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {lawyer?.full_name ?? '—'} · {caseRow?.title ?? '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5" dir="ltr">
                      {isRTL ? 'استحقاق:' : 'Due:'} {fmtDate(inv.due_date)}
                    </p>
                  </div>

                  <div className="text-end shrink-0">
                    <p className={cn(
                      'text-base font-black',
                      inv.status === 'paid' ? 'text-emerald-600' : isOverdue ? 'text-red-600' : 'text-foreground'
                    )} dir="ltr">
                      {fmt(inv.total_amount)} {inv.currency}
                    </p>
                    {inv.status !== 'paid' && !isOverdue && (
                      <p className="text-[10px] text-[#C89B3C] font-semibold mt-0.5">
                        {isRTL ? 'ادفع الآن' : 'Pay now →'}
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
