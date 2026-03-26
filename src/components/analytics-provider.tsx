'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// ──────────────────────────────────────────────────────────────────
// PostHog Analytics Provider (PRD §9 — Gap Analysis Task 8)
//
// Initialises PostHog on mount, tracks page views on route changes,
// and exposes a `posthog` singleton for event tracking.
//
// Env vars required (add to Vercel + .env.local):
//   NEXT_PUBLIC_POSTHOG_KEY=phc_...
//   NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com  (or app.posthog.com)
//
// GDPR compliance: person_profiles='identified_only' — profiles
// are only created after posthog.identify() is called on login.
// ──────────────────────────────────────────────────────────────────

// We load PostHog lazily via the browser snippet to avoid adding
// it to the server bundle and to keep the initial page payload small.

declare global {
  interface Window {
    posthog?: {
      init:       (key: string, opts: Record<string, unknown>) => void;
      capture:    (event: string, props?: Record<string, unknown>) => void;
      identify:   (id: string,   props?: Record<string, unknown>) => void;
      reset:      ()                                               => void;
      page:       ()                                               => void;
      opt_in_capturing:  () => void;
      opt_out_capturing: () => void;
    };
  }
}

const POSTHOG_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.posthog.com';

/** Initialise PostHog via the async snippet (no npm install needed) */
function initPostHog() {
  if (typeof window === 'undefined' || !POSTHOG_KEY || window.posthog) return;

  // Minimal PostHog snippet — loads posthog-js asynchronously
  // so it never blocks the main thread.
  const script = document.createElement('script');
  script.defer = true;
  script.src   = `${POSTHOG_HOST}/static/array.js`;
  script.onload = () => {
    window.posthog?.init(POSTHOG_KEY!, {
      api_host:                POSTHOG_HOST,
      person_profiles:         'identified_only',   // GDPR: no anon profiles
      capture_pageview:        false,               // we handle manually
      capture_pageleave:       true,
      persistence:             'localStorage+cookie',
      autocapture:             false,               // opt-in only
      disable_session_recording: true,              // enable in PostHog dashboard if needed
    });
  };
  document.head.appendChild(script);
}

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const pathname = usePathname();

  // Initialise on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views on route changes
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    // Small delay so page title is updated before capture
    const t = setTimeout(() => {
      window.posthog?.capture('$pageview', { $current_url: window.location.href });
    }, 100);
    return () => clearTimeout(t);
  }, [pathname]);

  return <>{children}</>;
}

// ── Typed event tracker ───────────────────────────────────────────
// Import and call track() from any client component to capture events.

type WakeelaEvent =
  | 'case_created'
  | 'document_uploaded'
  | 'nde_flag_viewed'
  | 'escalation_exported'
  | 'subscription_upgraded'
  | 'lawyer_invited'
  | 'language_switched'
  | 'invoice_created'
  | 'invoice_paid'
  | 'vault_share_created'
  | 'timeline_exported'
  | 'chat_export'
  | 'witness_link_created'
  | 'ai_summary_generated';

export function track(
  event:      WakeelaEvent,
  properties?: Record<string, string | number | boolean | null | undefined>
) {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return;
  window.posthog?.capture(event, properties);
}

/**
 * Identify the current user after login.
 * Call this in the useUser hook or on session change.
 */
export function identifyUser(opts: {
  userId:      string;
  role?:       string;
  tier?:       string;
  locale?:     string;
  data_region?: string;
}) {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return;
  window.posthog?.identify(opts.userId, {
    role:        opts.role,
    tier:        opts.tier,
    locale:      opts.locale,
    data_region: opts.data_region,
  });
}

/** Reset on sign-out to disassociate future events from the user */
export function resetAnalytics() {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return;
  window.posthog?.reset();
}
