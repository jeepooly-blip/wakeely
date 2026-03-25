import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-guard';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Shield, LayoutDashboard, Users, FileText,
  AlertTriangle, Settings, Activity, LogOut,
} from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  await requireAdmin(locale); // redirects if not admin

  const navItems = [
    { href: `/${locale}/admin`,        icon: LayoutDashboard, label: 'Overview'  },
    { href: `/${locale}/admin/users`,  icon: Users,           label: 'Users'     },
    { href: `/${locale}/admin/cases`,  icon: FileText,        label: 'Cases'     },
    { href: `/${locale}/admin/audit`,  icon: Activity,        label: 'Audit Log' },
    { href: `/${locale}/admin/system`, icon: Settings,        label: 'System'    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Admin sidebar — distinct teal color to visually separate from client UI */}
      <aside className="hidden lg:flex flex-col w-56 bg-[#0E7490] shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
          <Shield className="h-5 w-5 text-white" />
          <div>
            <p className="text-sm font-black text-white">Wakeela</p>
            <p className="text-[10px] text-white/60 font-medium uppercase tracking-widest">Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {navItems.map(({ href, icon: Icon, label }) => (
            <a key={href} href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors">
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </a>
          ))}
        </nav>

        <div className="px-2 py-4 border-t border-white/10 space-y-1">
          <ThemeToggle />
          <a href={`/${locale}/dashboard`}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />
            Back to App
          </a>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Admin top bar */}
        <header className="flex items-center justify-between px-6 py-3 bg-[#0E7490] lg:bg-transparent border-b border-[#0E7490]/20">
          <div className="flex items-center gap-2 lg:hidden">
            <Shield className="h-5 w-5 text-white" />
            <span className="text-sm font-black text-white">Admin Portal</span>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Founder-only area. All actions are logged.
            </p>
          </div>
          <div className="lg:hidden"><ThemeToggle /></div>
        </header>

        <main className="flex-1 p-5 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
