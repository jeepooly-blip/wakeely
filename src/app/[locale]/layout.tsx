import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/theme-provider';
import { RTLProvider } from '@/components/rtl-provider';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
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

  // Pass locale explicitly so messages always match the URL segment,
  // not the middleware-set header (which can be stale on client navigation).
  const messages = await getMessages({ locale });
  const isRTL = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${ibmPlexArabic.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={isRTL ? 'font-arabic' : 'font-sans'}>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages} locale={locale}>
            <RTLProvider>{children}</RTLProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
