import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { AdminUsersTable } from '@/components/admin/users-table';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const locale = await getLocale();
  await requireAdmin(locale);

  const sp    = await searchParams;
  const page  = Math.max(1, parseInt(sp.page ?? '1', 10));
  const limit = 25;
  const q     = sp.q?.trim().slice(0, 100) ?? '';
  const role  = sp.role ?? '';
  const from  = (page - 1) * limit;

  const supabase = createAdminClient();
  let query = supabase
    .from('users')
    .select('id,email,full_name,role,subscription_tier,created_at,last_seen_at,locale,data_region', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (q)    query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (role) query = query.eq('role', role);

  const { data: users, count } = await query;

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-black text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{count ?? 0} total users</p>
      </div>
      <AdminUsersTable
        users={users ?? []}
        total={count ?? 0}
        page={page}
        limit={limit}
        q={q}
        role={role}
        locale={locale}
      />
    </div>
  );
}
