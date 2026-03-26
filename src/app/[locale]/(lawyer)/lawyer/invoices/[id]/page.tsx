import { notFound, redirect }  from 'next/navigation';
import { getLocale }           from 'next-intl/server';
import { createClient }        from '@/lib/supabase/server';
import { createAdminClient }   from '@/lib/supabase/server';
import { InvoicePortalView }   from '@/components/invoices/invoice-portal-view';
import type { Invoice }        from '@/types';

export default async function LawyerInvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const locale   = await getLocale();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const sb = createAdminClient();
  const { data: invoice } = await sb
    .from('invoices')
    .select(`
      *,
      cases(id, title, case_type, jurisdiction),
      lawyer:users!invoices_lawyer_id_fkey(id, full_name, email, phone),
      client:users!invoices_client_id_fkey(id, full_name, email, phone),
      invoice_items(*, disbursement_receipts(*))
    `)
    .eq('id', id)
    .eq('lawyer_id', user.id)   // RLS — lawyer only sees their own
    .order('sort_order', { referencedTable: 'invoice_items', ascending: true })
    .maybeSingle();

  if (!invoice) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';

  return (
    <InvoicePortalView
      invoice={invoice as unknown as Invoice}
      currentUserId={user.id}
      isLawyer={true}
      locale={locale}
      appUrl={appUrl}
    />
  );
}
