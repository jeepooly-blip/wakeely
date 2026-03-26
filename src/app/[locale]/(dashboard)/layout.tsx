import { redirect }        from 'next/navigation';
import { createClient }    from '@/lib/supabase/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle }     from '@/components/theme-toggle';
import dynamic             from 'next/dynamic';

// Lazy-load heavy client components — they're not needed for initial HTML render.
// This splits them into separate JS chunks that only load after hydration.
const NotificationsHub    = dynamic(() => import('@/components/notifications/notifications-hub').then(m => ({ default: m.NotificationsHub })), { ssr: false });
const OnboardingController = dynamic(() => import('@/components/onboarding/onboarding-controller').then(m => ({ default: m.OnboardingController })), { ssr: false });
import {
  Shield, LayoutDashboard, FolderOpen, Lock,
  Calendar, Bell, Settings, CreditCard, Mic, LogOut, FileText,
} from 'lucide-react';

// ── Server action to sign out ────────────────────────────────
async function signOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Redirect to the landing page (will go to /ar or /en based on current locale)
  // We'll redirect to the root; next.config.mjs will redirect to /ar.
  redirect('/');
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const isRTL    = locale === 'ar';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // ── Parallelise DB queries — was 2 serial round-trips, now 1 ──
  const [{ count: unreadCount }, { data: profile }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
    supabase
      .from('users')
      .select('full_name, onboarding_completed, first_case_created_at')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const initials = (profile?.full_name ?? user.email ?? '?')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const navItems = [
    { href: `/${locale}/dashboard`,    icon: LayoutDashboard, label: isRTL ? 'لوحة التحكم'    : 'Dashboard'       },
    { href: `/${locale}/cases`,         icon: FolderOpen,      label: isRTL ? 'قضاياي'          : 'My Cases'        },
    { href: `/${locale}/vault`,         icon: Lock,            label: isRTL ? 'خزنة المستندات' : 'Evidence Vault'  },
    { href: `/${locale}/deadlines`,     icon: Calendar,        label: isRTL ? 'المواعيد'        : 'Deadlines'       },
    { href: `/${locale}/alerts`,        icon: Bell,            label: isRTL ? 'التنبيهات'       : 'Alerts'          },
    { href: `/${locale}/notifications`, icon: Bell,            label: isRTL ? 'الإشعارات'       : 'Notifications', badge: unreadCount ?? 0 },
    { href: `/${locale}/invoices`,      icon: FileText,        label: isRTL ? 'الفواتير'        : 'Invoices'        },
    { href: `/${locale}/billing`,       icon: CreditCard,      label: isRTL ? 'الاشتراك'        : 'Billing'         },
    { href: `/${locale}/voice`,         icon: Mic,             label: isRTL ? 'المستشار الصوتي' : 'Voice Advisor'   },
    { href: `/${locale}/settings`,      icon: Settings,        label: isRTL ? 'الإعدادات'       : 'Settings'        },
  ];

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 border-e border-border bg-card shrink-0 shadow-card">

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1A3557] shadow-brand shrink-0">
            <Shield className="h-4.5 w-4.5 text-[#C89B3C]" />
          </div>
          <div>
            <span className="text-base font-black text-[#1A3557] dark:text-foreground tracking-tight">
              {isRTL ? 'وكيلا' : 'Wakeela'}
            </span>
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">
              {isRTL ? 'حامي حقوقك' : 'Legal Shield'}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
          {navItems.map(({ href, icon: Icon, label, badge }) => (
            <a key={href} href={href}
              className="nav-item group relative">
              <Icon className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110" />
              <span className="flex-1">{label}</span>
              {(badge ?? 0) > 0 && (
                <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
                  {(badge ?? 0) > 9 ? '9+' : badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        {/* Footer with user info and sign out */}
        <div className="border-t border-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher variant="dropdown" />
            <NotificationsHub locale={locale} />
          </div>

          {/* User profile + Sign out button */}
          <form action={signOut}>
            <button type="submit" className="w-full">
              <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5 hover:bg-muted/80 transition-colors cursor-pointer">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#1A3557] to-[#0E7490] flex items-center justify-center shrink-0 shadow-sm">
                  <span className="text-[10px] font-black text-white">{initials}</span>
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {profile?.full_name || user.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{user.email}</p>
                </div>
                <LogOut className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur-sm shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1A3557] shadow-brand">
              <Shield className="h-4 w-4 text-[#C89B3C]" />
            </div>
            <span className="text-sm font-black text-[#1A3557] dark:text-foreground">
              {isRTL ? 'وكيلا' : 'Wakeela'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsHub locale={locale} />
            <ThemeToggle />
            <LanguageSwitcher variant="pill" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>

        {/* Mobile bottom navigation with sign out */}
        <nav className="lg:hidden sticky bottom-0 z-40 flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-sm py-2 px-1 shadow-[0_-1px_3px_rgba(0,0,0,0.06)]">
          {navItems.slice(0, 4).map(({ href, icon: Icon, label, badge }) => (
            <a key={href} href={href}
              className="relative flex flex-col items-center gap-0.5 rounded-xl p-2 text-muted-foreground hover:text-[#1A3557] dark:hover:text-blue-300 transition-colors">
              <Icon className="h-5 w-5" />
              <span className="text-[9px] font-medium">{label}</span>
              {(badge ?? 0) > 0 && (
                <span className="absolute -top-0.5 end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">
                  {badge}
                </span>
              )}
            </a>
          ))}
          {/* Sign out button for mobile */}
          <form action={signOut}>
            <button type="submit"
              className="relative flex flex-col items-center gap-0.5 rounded-xl p-2 text-muted-foreground hover:text-[#1A3557] dark:hover:text-blue-300 transition-colors">
              <LogOut className="h-5 w-5" />
              <span className="text-[9px] font-medium">
                {isRTL ? 'خروج' : 'Sign out'}
              </span>
            </button>
          </form>
        </nav>
      </div>

      {/* ── Onboarding ─────────────────────────────────────────── */}
      <OnboardingController
        locale={locale}
        userName={profile?.full_name ?? undefined}
        onboardingCompleted={profile?.onboarding_completed ?? false}
        firstCaseCreatedAt={profile?.first_case_created_at ?? null}
      />
    </div>
  );
}
