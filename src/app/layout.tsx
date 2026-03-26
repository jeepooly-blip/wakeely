import type { ReactNode } from 'react';

/**
 * Minimal root layout — required by Next.js App Router so every route
 * has a layout ancestor.
 *
 * Localized routes (/[locale]/…) use app/[locale]/layout.tsx for their
 * full HTML shell. Public standalone routes (/share/[token],
 * /witness/[token]) render their own self-contained HTML documents.
 * This pass-through avoids double-wrapping either branch.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
