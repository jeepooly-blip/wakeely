import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-guard';
import { createAdminClient } from '@/lib/supabase/server';
import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const locale = await getLocale();
  await requireAdmin(locale);

  const sp    = await searchParams;
  const page  = Math.max(1, parseInt(sp.page ?? '1', 10));
  const limit = 30;
  const q     = sp.q?.trim().slice(0, 100) ?? '';
  const type  = sp.type ?? '';
  const from  = (page - 1) * limit;

  const supabase = createAdminClient();
  let query = supabase
    .from('cases')
    .select('id,title,case_type,jurisdiction,status,health_score,created_at,client_id,lawyer_name,users!cases_client_id_fkey(email,full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (q)    query = query.ilike('title', `%${q}%`);
  if (type) query = query.eq('case_type', type);

  const { data: cases, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  const healthColor = (s: number) =>
    s >= 70 ? 'text-emerald-600' : s >= 40 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <FolderOpen className="h-6 w-6 text-[#0E7490]" />
          All Cases
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{count ?? 0} total cases</p>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search by title…"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none" />
        <select name="type" defaultValue={type}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none">
          <option value="">All types</option>
          {['employment','family','commercial','property','criminal','other'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-[#0E7490] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0c6578] transition">
          Filter
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Title','Type','Client','Lawyer','Health','Status','Created'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(cases ?? []).map((c) => {
                const client = c.users as unknown as { email: string; full_name: string } | null;
                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition">
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[180px] truncate">{c.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{c.case_type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate">{client?.email ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.lawyer_name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('font-bold', healthColor(c.health_score))}>{c.health_score}%</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
                        c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap" dir="ltr">
                      {new Date(c.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(cases ?? []).length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No cases found.</p>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <a key={p} href={`?page=${p}&q=${q}&type=${type}`}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition',
                p === page ? 'bg-[#0E7490] text-white' : 'border border-border text-muted-foreground hover:bg-muted')}>
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
