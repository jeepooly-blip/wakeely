import Link from 'next/link';
import { Shield } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A3557]">
            <Shield className="h-4 w-4 text-[#C89B3C]" />
          </div>
          <span className="text-base font-bold text-[#1A3557] dark:text-foreground">Wakeela</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher variant="pill" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="py-4 px-6 text-center">
        <p className="text-[10px] text-muted-foreground/50 max-w-md mx-auto">
          Wakeela does not provide legal advice. Platform flags are informational only and do not constitute legal findings of negligence.
        </p>
      </footer>
    </div>
  );
}
