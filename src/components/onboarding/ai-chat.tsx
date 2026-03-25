'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, X, Bot, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message { role: 'user' | 'assistant'; content: string; }
interface Action  { action: string; case_type: string; }

interface AIChatOnboardingProps {
  locale:      string;
  userName?:   string;
  onComplete?: (caseType: string) => void;
}

/* ─── Quick-pick chips ─────────────────────────────────────────── */
const QUICK_PICKS = {
  en: [
    { label: '🏦 Bank / Loan',      value: 'bank loan issue'  },
    { label: '💼 Employment',        value: 'employment case'  },
    { label: '✈️ Travel / Visa',     value: 'travel visa case' },
    { label: '📋 Other',             value: 'other legal case' },
  ],
  ar: [
    { label: '🏦 قرض / بنك',       value: 'قضية قرض بنكي'    },
    { label: '💼 عمل',              value: 'قضية عمل'          },
    { label: '✈️ سفر / تأشيرة',    value: 'قضية سفر وتأشيرة'  },
    { label: '📋 أخرى',             value: 'قضية أخرى'         },
  ],
};

/* ─── Typing indicator ─────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0,1,2].map(i => (
        <span key={i} className="h-2 w-2 rounded-full bg-[#1A3557]/40 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

/* ─── Single message bubble ─────────────────────────────────────── */
function Bubble({ msg, isRTL }: { msg: Message; isRTL: boolean }) {
  const isBot = msg.role === 'assistant';
  return (
    <div className={cn('flex items-end gap-2', isBot ? 'justify-start' : 'justify-end')}>
      {isBot && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A3557] mb-0.5">
          <Bot className="h-3.5 w-3.5 text-[#C89B3C]" />
        </div>
      )}
      <div className={cn(
        'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
        isBot
          ? 'rounded-ss-none bg-[#1A3557]/8 dark:bg-[#1A3557]/20 text-foreground'
          : 'rounded-se-none bg-[#1A3557] text-white'
      )} dir={isRTL ? 'rtl' : 'ltr'}>
        {msg.content}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function AIChatOnboarding({ locale, userName, onComplete }: AIChatOnboardingProps) {
  const isRTL = locale === 'ar';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [showPicks,   setShowPicks]   = useState(true);
  const [action,      setAction]      = useState<Action | null>(null);
  const [creating,    setCreating]    = useState(false);
  const [dismissed,   setDismissed]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const picks     = isRTL ? QUICK_PICKS.ar : QUICK_PICKS.en;
  const Chev      = isRTL ? ChevronLeft : ChevronRight;

  // Open with bot greeting
  useEffect(() => {
    const greeting: Message = {
      role:    'assistant',
      content: isRTL
        ? `مرحباً ${userName ? userName.split(' ')[0] : ''}! 👋 سأساعدك في إعداد قضيتك خلال أقل من دقيقة. ما نوع قضيتك؟`
        : `Welcome ${userName ? userName.split(' ')[0] : ''}! 👋 I'll help you set up your case in less than a minute. What type of case are you dealing with?`,
    };
    setMessages([greeting]);
  }, [isRTL, userName]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setShowPicks(false);
    setLoading(true);

    try {
      const res = await fetch('/api/onboarding/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trimmed, history: messages }),
      });
      const data = await res.json();

      const botMsg: Message = { role: 'assistant', content: data.reply };
      setMessages([...newHistory, botMsg]);

      if (data.action?.action === 'create_case') {
        setAction(data.action);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isRTL ? 'عذراً، حدث خطأ. حاول مرة أخرى.' : 'Sorry, something went wrong. Please try again.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, loading, isRTL]);

  const handleCreateCase = useCallback(async () => {
    if (!action) return;
    setCreating(true);

    // Navigate to cases/new with pre-filled case type
    const caseType = action.case_type;
    onComplete?.(caseType);

    // Mark onboarding complete
    await fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});

    // Add success message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: isRTL
        ? 'تم إنشاء قضيتك بنجاح ✅ يمكنك الآن متابعة كل التحديثات.'
        : 'Your case is now active ✅ You can see all updates here.',
    }]);

    startTransition(() => {
      router.push(`/${locale}/cases/new?type=${caseType}&from=onboarding`);
    });
  }, [action, locale, router, isRTL, onComplete]);

  if (dismissed) return null;

  return (
    <div className={cn(
      'fixed z-50 flex flex-col',
      'bottom-4 end-4',                                    // floating bottom-right (RTL-aware)
      'w-[360px] max-w-[calc(100vw-32px)]',
      'rounded-2xl border border-border bg-card shadow-2xl',
      'animate-scale-in origin-bottom-end'
    )}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-[#1A3557] to-[#0E7490] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <Sparkles className="h-4 w-4 text-[#C89B3C]" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">
              {isRTL ? 'مساعد وكيلا' : 'Wakeela Assistant'}
            </p>
            <p className="text-[10px] text-white/60 mt-0.5">
              {isRTL ? 'مدعوم بالذكاء الاصطناعي' : 'AI-powered · Online'}
            </p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)}
          className="rounded-lg p-1.5 text-white/60 hover:text-white hover:bg-white/10 transition"
          aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex flex-col gap-3 overflow-y-auto p-4 min-h-[200px] max-h-[340px] no-scrollbar">
        {messages.map((msg, i) => (
          <Bubble key={i} msg={msg} isRTL={isRTL} />
        ))}
        {loading && (
          <div className="flex items-end gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A3557]">
              <Bot className="h-3.5 w-3.5 text-[#C89B3C]" />
            </div>
            <div className="rounded-2xl rounded-ss-none bg-[#1A3557]/8 dark:bg-[#1A3557]/20">
              <TypingDots />
            </div>
          </div>
        )}

        {/* Action CTA — create case */}
        {action && !creating && (
          <button onClick={handleCreateCase}
            className="mt-1 flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-[#C89B3C] to-[#E8B84B] px-4 py-3 text-sm font-black text-[#1A3557] hover:-translate-y-0.5 transition-all shadow-md">
            <span>{isRTL ? 'إنشاء قضيتي الآن' : 'Create My Case Now'}</span>
            <Chev className="h-4 w-4" />
          </button>
        )}
        {creating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{isRTL ? 'جارٍ الإنشاء…' : 'Setting up your case…'}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick picks ── */}
      {showPicks && !action && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            {isRTL ? 'اختر نوع القضية' : 'Quick select'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {picks.map(p => (
              <button key={p.value} onClick={() => sendMessage(p.value)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-[#1A3557]/50 hover:bg-[#1A3557]/5 transition">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ── */}
      {!action && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
            placeholder={isRTL ? 'اكتب رسالتك…' : 'Type a message…'}
            dir={isRTL ? 'rtl' : 'ltr'}
            disabled={loading}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#1A3557]/20 disabled:opacity-50 transition"
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A3557] text-white hover:bg-[#1e4a7a] disabled:opacity-40 transition">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}

      <p className="px-4 pb-3 text-center text-[9px] text-muted-foreground/50">
        {isRTL ? 'وكيلا لا تقدم استشارات قانونية' : 'Wakeela does not provide legal advice'}
      </p>
    </div>
  );
}
