'use client';

import { useState } from 'react';
import { Loader2, ChevronRight, ChevronLeft, Search, ShieldAlert, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: string; email: string; full_name: string; role: string;
  subscription_tier: string; created_at: string; last_seen_at?: string;
  locale: string; data_region: string;
}

interface AdminUsersTableProps {
  users: User[]; total: number; page: number; limit: number;
  q: string; role: string; locale: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin:  'bg-red-100    text-red-700    dark:bg-red-900/30',
  lawyer: 'bg-[#0E7490]/10 text-[#0E7490]',
  client: 'bg-muted      text-muted-foreground',
};
const TIER_COLORS: Record<string, string> = {
  premium: 'bg-amber-100 text-[#C89B3C]',
  pro:     'bg-blue-100  text-[#1A3557]',
  basic:   'bg-muted     text-muted-foreground',
};

export function AdminUsersTable({ users, total, page, limit, q, role, locale }: AdminUsersTableProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [localUsers, setLocalUsers] = useState<User[]>(users);
  const totalPages = Math.ceil(total / limit);

  const updateUser = async (id: string, changes: { role?: string; subscription_tier?: string }) => {
    setUpdating(id);
    try {
      const res = await fetch('/api/admin/users', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ target_id: id, ...changes }),
      });
      if (res.ok) {
        setLocalUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...changes } : u));
      }
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <form className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Search email or name…"
            className="rounded-xl border border-border bg-background ps-9 pe-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7490]/30" />
        </div>
        <select name="role" defaultValue={role}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none">
          <option value="">All roles</option>
          <option value="client">Client</option>
          <option value="lawyer">Lawyer</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="rounded-xl bg-[#0E7490] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0c6578] transition">
          Search
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['User', 'Role', 'Tier', 'Region', 'Last seen', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {localUsers.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground truncate max-w-[180px]">{u.full_name || '—'}</p>
                    <p className="text-muted-foreground font-mono" dir="ltr">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', ROLE_COLORS[u.role] ?? ROLE_COLORS.client)}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', TIER_COLORS[u.subscription_tier] ?? TIER_COLORS.basic)}>
                      {u.subscription_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground uppercase">{u.data_region}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {u.last_seen_at
                      ? new Date(u.last_seen_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {updating === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {/* Role change */}
                          <select
                            value={u.role}
                            onChange={(e) => updateUser(u.id, { role: e.target.value })}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] focus:outline-none"
                            title="Change role"
                          >
                            <option value="client">client</option>
                            <option value="lawyer">lawyer</option>
                            <option value="admin">admin</option>
                          </select>
                          {/* Tier change */}
                          <select
                            value={u.subscription_tier}
                            onChange={(e) => updateUser(u.id, { subscription_tier: e.target.value })}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] focus:outline-none"
                            title="Change tier"
                          >
                            <option value="basic">basic</option>
                            <option value="pro">pro</option>
                            <option value="premium">premium</option>
                          </select>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {localUsers.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No users found.</p>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          {page > 1 && (
            <a href={`?page=${page - 1}&q=${q}&role=${role}`}
              className="rounded-lg border border-border p-1.5 hover:bg-muted transition">
              <ChevronLeft className="h-3.5 w-3.5" />
            </a>
          )}
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a href={`?page=${page + 1}&q=${q}&role=${role}`}
              className="rounded-lg border border-border p-1.5 hover:bg-muted transition">
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
