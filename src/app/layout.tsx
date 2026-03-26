import type { ReactNode } from 'react';

/**
 * Minimal root layout — required by Next.js App Router so every route
 * has a layout ancestor.
 *
 * This project uses two distinct HTML-shell strategies:
 *
 *  • Localized routes  (/[locale]/…)
 *      → app/[locale]/layout.tsx renders the full <html lang dir> shell,
 *        loads fonts, wires up ThemeProvider / NextIntlClientProvider, etc.
 *
 *  • Public standalone routes  (/share/[token], /witness/[token])
 *      → Each page component renders its own self-contained HTML document
 *        (no auth, no i18n, watermarked read-only views).
 *
 * Because each branch owns its own <html> structure, this root layout is
 * intentionally a transparent pass-through — it does NOT add an extra
 * <html>/<body> wrapper that would conflict with the nested shells above.
 *
 * This follows the pattern recommended by next-intl for App Router projects
 * with locale-based routing:
 * https://next-intl-docs.vercel.app/docs/getting-started/app-router/with-i18n-routing
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
