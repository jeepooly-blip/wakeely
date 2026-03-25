'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

/**
 * RTLProvider — handles font class switching on client-side locale changes.
 * NOTE: The <html dir> and lang attributes are set server-side in layout.tsx.
 * This component ONLY updates font classes to avoid hydration mismatches.
 */
export function RTLProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const isRTL  = locale === 'ar';

  useEffect(() => {
    // Update dir on client-side navigation (next-intl changes locale without full reload)
    document.documentElement.dir  = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    // Font class
    document.body.classList.toggle('font-arabic', isRTL);
    document.body.classList.toggle('font-sans',   !isRTL);
  }, [locale, isRTL]);

  return <>{children}</>;
}
