'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TooltipStep {
  id:         string;
  target:     string;            // CSS selector of element to highlight
  titleEn:    string;
  titleAr:    string;
  descEn:     string;
  descAr:     string;
  position:   'top' | 'bottom' | 'left' | 'right';
}

export const DASHBOARD_TOOLTIPS: TooltipStep[] = [
  {
    id:       'timeline',
    target:   '[data-tooltip="timeline"]',
    titleEn:  'Case Timeline',
    titleAr:  'الجدول الزمني للقضية',
    descEn:   'This is your case timeline. Every action will appear here — nothing is hidden.',
    descAr:   'هذا هو تسلسل الأحداث في قضيتك. كل خطوة ستظهر هنا — لا شيء مخفي.',
    position: 'bottom',
  },
  {
    id:       'deadlines',
    target:   '[data-tooltip="deadlines"]',
    titleEn:  'Deadline Tracker',
    titleAr:  'متتبع المواعيد',
    descEn:   'Track important dates here. We alert you before anything is missed.',
    descAr:   'تابع المواعيد المهمة هنا. سنُنبهك قبل فوات أي موعد.',
    position: 'bottom',
  },
  {
    id:       'vault',
    target:   '[data-tooltip="vault"]',
    titleEn:  'Document Vault',
    titleAr:  'خزنة المستندات',
    descEn:   'Upload and store your documents securely — SHA-256 verified.',
    descAr:   'قم برفع وحفظ مستنداتك بأمان — مُحقَّق بـ SHA-256.',
    position: 'right',
  },
  {
    id:       'chat',
    target:   '[data-tooltip="chat"]',
    titleEn:  'Accountable Chat',
    titleAr:  'المحادثة الموثَّقة',
    descEn:   'Communicate with full transparency. Every message is logged permanently.',
    descAr:   'تواصل بكل شفافية. كل رسالة مُسجَّلة دائماً.',
    position: 'left',
  },
];

interface TooltipGuideProps {
  locale:      string;
  seenIds:     string[];
  onDone?:     () => void;
}

export function TooltipGuide({ locale, seenIds, onDone }: TooltipGuideProps) {
  const isRTL = locale === 'ar';
  const Chev  = isRTL ? ChevronLeft : ChevronRight;

  // Only show tooltips the user hasn't seen
  const unseen = DASHBOARD_TOOLTIPS.filter(t => !seenIds.includes(t.id));

  const [stepIndex, setStepIndex] = useState(0);
  const [visible,   setVisible]   = useState(true);
  const [pos,       setPos]       = useState({ top: 0, left: 0, width: 0, height: 0 });

  const current = unseen[stepIndex];

  // Find target element position
  useEffect(() => {
    if (!current) return;
    const el = document.querySelector(current.target);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current]);

  const markSeen = useCallback(async (id: string) => {
    await fetch('/api/onboarding/tooltip', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tooltip_id: id }),
    }).catch(() => {});
  }, []);

  const next = useCallback(async () => {
    if (current) await markSeen(current.id);
    if (stepIndex < unseen.length - 1) {
      setStepIndex(i => i + 1);
    } else {
      setVisible(false);
      onDone?.();
    }
  }, [current, stepIndex, unseen.length, markSeen, onDone]);

  const skip = useCallback(async () => {
    // Mark all remaining as seen
    for (const t of unseen.slice(stepIndex)) await markSeen(t.id);
    setVisible(false);
    onDone?.();
  }, [unseen, stepIndex, markSeen, onDone]);

  if (!visible || !current || unseen.length === 0) return null;

  // Tooltip position relative to target
  const tipStyle = (() => {
    const gap = 12;
    if (current.position === 'bottom')
      return { top: pos.top + pos.height + gap, left: pos.left + pos.width / 2, transform: 'translateX(-50%)' };
    if (current.position === 'top')
      return { top: pos.top - gap - 120, left: pos.left + pos.width / 2, transform: 'translateX(-50%)' };
    if (current.position === 'right')
      return { top: pos.top + pos.height / 2, left: pos.left + pos.width + gap, transform: 'translateY(-50%)' };
    return { top: pos.top + pos.height / 2, left: pos.left - gap - 260, transform: 'translateY(-50%)' };
  })();

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={skip} />

      {/* Spotlight */}
      <div
        className="fixed z-41 rounded-xl ring-4 ring-[#C89B3C] ring-offset-2 ring-offset-transparent pointer-events-none"
        style={{
          top:    pos.top    - 4,
          left:   pos.left   - 4,
          width:  pos.width  + 8,
          height: pos.height + 8,
        }}
      />

      {/* Tooltip card */}
      <div
        className="fixed z-50 w-64 rounded-2xl border border-border bg-card p-4 shadow-2xl animate-scale-in"
        style={tipStyle}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1">
            {unseen.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all', i === stepIndex ? 'w-5 bg-[#1A3557]' : 'w-1.5 bg-muted-foreground/30')} />
            ))}
          </div>
          <button onClick={skip} className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <h3 className="text-sm font-bold text-foreground mb-1">
          {isRTL ? current.titleAr : current.titleEn}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          {isRTL ? current.descAr : current.descEn}
        </p>

        <div className="flex items-center justify-between">
          <button onClick={skip} className="text-xs text-muted-foreground hover:text-foreground transition">
            {isRTL ? 'تخطّي الجولة' : 'Skip tour'}
          </button>
          <button onClick={next}
            className="flex items-center gap-1.5 rounded-xl bg-[#1A3557] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e4a7a] transition">
            {stepIndex < unseen.length - 1
              ? (isRTL ? 'التالي' : 'Next')
              : (isRTL ? 'تم!'   : 'Done!')}
            <Chev className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
