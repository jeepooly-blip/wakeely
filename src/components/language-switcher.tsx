'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'pill' | 'dropdown';
}

export function LanguageSwitcher({ className, variant = 'pill' }: LanguageSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale });
  };

  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-full border border-border bg-muted p-1 gap-1',
          className
        )}
        role="group"
        aria-label="Language selector"
      >
        {(['en', 'ar'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => switchLocale(lang)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200',
              locale === lang
                ? 'bg-[#1A3557] text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={locale === lang}
          >
            {lang === 'en' ? 'EN' : '\u0627\u0644\u0639\u0631\u0628\u064a\u0629'}
          </button>
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => switchLocale(locale === 'en' ? 'ar' : 'en')}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
        'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
        className
      )}
      aria-label="Switch language"
    >
      <span className="text-base">\uD83C\uDF10</span>
      <span>{locale === 'en' ? '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' : 'English'}</span>
    </button>
  );
}
