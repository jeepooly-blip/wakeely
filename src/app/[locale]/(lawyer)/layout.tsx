import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Shield, FolderOpen, Settings, MessageCircle } from 'lucide-react';

export default async function LawyerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Verify lawyer role
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'lawyer' && profile?.role !== 'admin') redirect(`/${locale}/dashboard`);

  const navItems = [
    { href: `/${locale}/lawyer/cases`,    icon: FolderOpen,    label: isRTL ? 'قضاياي' : 'My Cases' },
    { href: `/${locale}/settings`,        icon: Settings,      label: isRTL ? 'الإعدادات' : 'Settings' },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden lg:flex flex-col w-64 border-e border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0E7490]">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-base font-bold text-[#0E7490] dark:text-foreground block">
              {isRTL ? 'وكيلا' : 'Wakeela'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isRTL ? 'بوابة المحامي' : 'Lawyer Portal'}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <a key={href} href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </a>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher variant="dropdown" />
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground">
            <div className="h-6 w-6 rounded-full bg-[#0E7490]/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-[#0E7490]">{user.email?.[0].toUpperCase()}</span>
            </div>
            <span className="truncate">{user.email}</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0E7490]">
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-[#0E7490]">
              {isRTL ? 'بوابة المحامي' : 'Lawyer Portal'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher variant="pill" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>

        <nav className="lg:hidden flex items-center justify-around border-t border-border bg-card py-2 px-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <a key={href} href={href}
              className="flex flex-col items-center gap-1 rounded-lg p-2 text-muted-foreground hover:text-[#0E7490] transition-colors">
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
