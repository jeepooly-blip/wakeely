'use client';

/**
 * OnboardingController
 * ---
 * Mounted once in the dashboard layout (client component).
 * Decides which onboarding layer to show:
 *   1. AI Chat → shown to new users who haven't completed onboarding
 *   2. Tooltip Guide → shown after first case created, on first dashboard visit
 *
 * State is driven by:
 *   - users.onboarding_completed
 *   - users.first_case_created_at
 *   - onboarding_tooltips_seen table
 */

import { useState, useEffect } from 'react';
import { AIChatOnboarding }    from './ai-chat';
import { TooltipGuide }        from './tooltip-guide';

interface OnboardingControllerProps {
  locale:               string;
  userName?:            string;
  onboardingCompleted:  boolean;
  firstCaseCreatedAt:   string | null;
}

export function OnboardingController({
  locale, userName, onboardingCompleted, firstCaseCreatedAt,
}: OnboardingControllerProps) {
  const [seenTooltips, setSeenTooltips] = useState<string[]>([]);
  const [showChat,     setShowChat]     = useState(!onboardingCompleted);
  const [showTooltips, setShowTooltips] = useState(false);
  const [loaded,       setLoaded]       = useState(false);

  useEffect(() => {
    // Fetch seen tooltips
    fetch('/api/onboarding/tooltip')
      .then(r => r.json())
      .then((ids: string[]) => {
        setSeenTooltips(ids);
        // Show tooltip tour if user has created a case but hasn't seen all tooltips
        if (firstCaseCreatedAt && ids.length < 4) setShowTooltips(true);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [firstCaseCreatedAt]);

  if (!loaded) return null;

  return (
    <>
      {showChat && !onboardingCompleted && (
        <AIChatOnboarding
          locale={locale}
          userName={userName}
          onComplete={(caseType) => {
            setShowChat(false);
            console.info('[onboarding] case type selected:', caseType);
          }}
        />
      )}

      {showTooltips && firstCaseCreatedAt && (
        <TooltipGuide
          locale={locale}
          seenIds={seenTooltips}
          onDone={() => setShowTooltips(false)}
        />
      )}
    </>
  );
}
