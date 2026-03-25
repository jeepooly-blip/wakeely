import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import type { Locale } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale comes from the X-NEXT-INTL-LOCALE header set by intlMiddleware,
  // which reads the URL path segment (e.g. /en/... → 'en').
  // We await it and validate strictly — never silently fall through to Arabic.
  let locale = await requestLocale;

  // Guard: if middleware didn't set a valid locale (e.g. static asset edge case),
  // fall back to the configured default. Log so we can catch regressions.
  if (!locale || !routing.locales.includes(locale as Locale)) {
    if (locale) {
      console.warn(`[i18n] Unknown locale "${locale}" — falling back to "${routing.defaultLocale}"`);
    }
    locale = routing.defaultLocale;
  }

  // Dynamic import ensures each locale's JSON is loaded lazily and independently.
  // The explicit cast to Locale ensures no path traversal is possible.
  const safeLocale = locale as Locale;
  const messages = (await import(`../../messages/${safeLocale}.json`)).default;

  return {
    locale:   safeLocale,
    messages,
    timeZone: 'Asia/Dubai',
    now:      new Date(),
  };
});
