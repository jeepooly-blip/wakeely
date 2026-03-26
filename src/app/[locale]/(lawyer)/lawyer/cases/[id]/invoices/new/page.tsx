import { notFound, redirect } from 'next/navigation';
import { getLocale }           from 'next-intl/server';
import { createClient }        from '@/lib/supabase/server';
import { InvoiceCreateForm }   from '@/components/invoices/invoice-create-form';

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id: caseId } = await params;
  const locale   = await getLocale();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // ── Parallel: verify assignment + fetch case ─────────────────
  const [{ data: assignment }, { data: caseRow }] = await Promise.all([
    supabase
      .from('case_lawyers')
      .select('id')
      .eq('case_id', caseId)
      .eq('lawyer_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('cases')
      .select('id, title, users!cases_client_id_fkey(full_name)')
      .eq('id', caseId)
      .maybeSingle(),
  ]);

  if (!assignment) notFound();
  if (!caseRow) notFound();

  const clientName = (caseRow.users as unknown as { full_name: string } | null)?.full_name ?? 'Client';

  return (
    <InvoiceCreateForm
      caseId={caseId}
      caseTitle={caseRow.title}
      clientName={clientName}
    />
  );
}
