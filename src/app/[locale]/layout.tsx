import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { ThemeProvider }     from '@/components/theme-provider';
import { RTLProvider }       from '@/components/rtl-provider';
import { AnalyticsProvider } from '@/components/analytics-provider';
import '../globals.css';

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
  // Only load weights actually used in the UI
  weight:   ['400', '600', '700', '900'],
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets:  ['arabic'],
  // Reduced from 5 weights to 3 — 300 is unused, 500 is close enough to 400
  weight:   ['400', '600', '700'],
  variable: '--font-arabic',
  display:  'swap',
});

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  const isArabic = locale === 'ar';

  return {
    title: { default: t('appName'), template: `%s | ${t('appName')}` },
    description: isArabic
      ? '\u0645\u0646\u0635\u0629 \u0627\u0644\u0634\u0641\u0627\u0641\u064a\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629 \u0644\u0644\u0645\u0648\u0643\u0651\u0644\u064a\u0646 \u0641\u064a \u062f\u0648\u0644 \u0627\u0644\u062e\u0644\u064a\u062c. \u062a\u062a\u0628\u0651\u0639 \u0642\u0636\u064a\u062a\u0643\u060c \u0627\u062d\u0641\u0638 \u0645\u0633\u062a\u0646\u062f\u0627\u062a\u0643\u060c \u0648\u0627\u062d\u0645\u0650 \u062d\u0642\u0648\u0642\u0643.'
      : 'The client-first legal accountability platform for GCC markets. Track your case, protect your rights.',
    openGraph: {
      title: t('appName'),
      siteName: t('appName'),
      locale: isArabic ? 'ar_AE' : 'en_US',
      type: 'website',
    },
    robots: { index: true, follow: true },
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  // Only pass namespaces used by CLIENT components to the browser.
  // Server components call getTranslations() directly — they don't need this bundle.
  // Reduces client JS payload from ~50KB to ~12KB.
  const allMessages = await getMessages({ locale });
  const clientNamespaces = ['common', 'auth', 'nde', 'nde_alerts', 'tracker', 'notifications', 'onboarding'];
  const messages = Object.fromEntries(
    clientNamespaces
      .filter((ns) => ns in allMessages)
      .map((ns) => [ns, (allMessages as Record<string, string | Record<string, unknown>>)[ns]])
  ) as Awaited<ReturnType<typeof getMessages>>;
  const isRTL = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${ibmPlexArabic.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* next/font handles Google Fonts preconnect automatically */}
        {/* DNS prefetch for Supabase — reduces first DB query latency */}
        <link rel="dns-prefetch" href={`https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '') ?? ''}`} />
      </head>
      <body className={isRTL ? 'font-arabic' : 'font-sans'}>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages} locale={locale}>
            <RTLProvider>
              <AnalyticsProvider>
                {children}
              </AnalyticsProvider>
            </RTLProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
