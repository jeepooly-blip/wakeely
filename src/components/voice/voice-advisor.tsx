'use client';

import {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, Loader2, Bot,
  AlertCircle, ChevronRight, ChevronLeft, X,
  RotateCcw, MessageSquare, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Browser speech API types ───────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
interface SpeechRecognitionInstance {
  lang:             string;
  interimResults:   boolean;
  maxAlternatives:  number;
  continuous:       boolean;
  onstart:  (() => void) | null;
  onend:    (() => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror:  ((e: any) => void) | null;
  start(): void;
  stop():  void;
}
declare global {
  interface Window {
    SpeechRecognition:       SpeechRecognitionCtor;
    webkitSpeechRecognition: SpeechRecognitionCtor;
  }
}

/* ─── Types ─────────────────────────────────────────────────────── */
interface Message {
  role:      'user' | 'assistant';
  content:   string;
  audioBlob?: Blob;
}

interface UsageInfo {
  used:      number;
  limit:     number;
  remaining: number;
  tier:      string;
}

interface VoiceAdvisorProps {
  locale:        string;
  caseId?:       string;
  caseTitle?:    string;
  caseContext?:  string;
  embedded?:     boolean;      // true = inline in page, false = floating widget
}

/* ─── Waveform animation ─────────────────────────────────────────── */
function Waveform({ active }: { active: boolean }) {
  const bars = [3, 5, 8, 6, 9, 5, 3, 7, 4, 6, 8, 3, 5];
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {bars.map((h, i) => (
        <div
          key={i}
          className={cn(
            'w-[3px] rounded-full transition-all duration-150',
            active
              ? 'bg-[#C89B3C]'
              : 'bg-white/30'
          )}
          style={{
            height: active
              ? `${Math.max(4, h * (0.5 + Math.random() * 0.5))}px`
              : '3px',
            animationDelay: active ? `${i * 60}ms` : '0ms',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Static waveform (no JS timing issues) ─────────────────────── */
function StaticWaveform({ listening }: { listening: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[3px] h-8">
      {[4,6,9,7,11,8,5,10,6,8,11,5,7,4,6].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-[#C89B3C]"
          style={{
            height: listening ? `${h}px` : '3px',
            transition: 'height 0.15s ease',
            animation: listening ? `voiceBar 0.8s ease-in-out infinite alternate` : 'none',
            animationDelay: `${i * 53}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1);   }
        }
      `}</style>
    </div>
  );
}

/* ─── Limit bar ──────────────────────────────────────────────────── */
function UsageBar({ usage, isRTL }: { usage: UsageInfo; isRTL: boolean }) {
  if (usage.limit === Infinity) return null;
  const pct = Math.min(100, (usage.used / usage.limit) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-white/60">
        <span>{isRTL ? `${usage.used} / ${usage.limit} استفسار اليوم` : `${usage.used} / ${usage.limit} queries today`}</span>
        <span className="capitalize">{usage.tier}</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-[#C89B3C] transition-all duration-500"
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── Single message bubble ─────────────────────────────────────── */
function VoiceBubble({ msg, isRTL, onSpeak }: {
  msg: Message; isRTL: boolean; onSpeak: (text: string, lang: string) => void;
}) {
  const isBot = msg.role === 'assistant';
  const lang  = isRTL ? 'ar-SA' : 'en-US';

  return (
    <div className={cn('flex items-end gap-2', isBot ? 'justify-start' : 'justify-end')}>
      {isBot && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 mb-0.5">
          <Bot className="h-3.5 w-3.5 text-[#C89B3C]" />
        </div>
      )}
      <div className="group relative max-w-[80%]">
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isBot
            ? 'rounded-ss-none bg-white/15 text-white'
            : 'rounded-se-none bg-[#C89B3C] text-[#1A3557] font-semibold'
        )} dir={isRTL ? 'rtl' : 'ltr'}>
          {msg.content}
        </div>
        {/* Replay button for bot messages */}
        {isBot && (
          <button
            onClick={() => onSpeak(msg.content, lang)}
            className="absolute -bottom-1 end-0 hidden group-hover:flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition"
            title={isRTL ? 'إعادة التشغيل' : 'Replay'}
          >
            <Volume2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function VoiceAdvisor({
  locale, caseId, caseTitle, caseContext, embedded = false,
}: VoiceAdvisorProps) {
  const isRTL      = locale === 'ar';
  const lang       = isRTL ? 'ar-SA' : 'en-US';
  const Chev       = isRTL ? ChevronLeft : ChevronRight;

  /* ─── State ─── */
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [listening,   setListening]   = useState(false);
  const [processing,  setProcessing]  = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [partialText, setPartialText] = useState('');
  const [error,       setError]       = useState('');
  const [usage,       setUsage]       = useState<UsageInfo | null>(null);
  const [muted,       setMuted]       = useState(false);
  const [dismissed,   setDismissed]   = useState(false);
  const [supported,   setSupported]   = useState(true);
  const [permDenied,  setPermDenied]  = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef       = useRef<SpeechSynthesisUtterance | null>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const historyRef     = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  /* ─── Init ─── */
  useEffect(() => {
    // Check browser support
    const SpeechRecCheck = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecCheck) { setSupported(false); return; }

    // Fetch usage
    fetch('/api/voice/usage')
      .then(r => r.json())
      .then(setUsage)
      .catch(() => {});

    // Opening greeting
    const greeting: Message = {
      role:    'assistant',
      content: isRTL
        ? 'مرحباً! 👋 أنا مساعدك القانوني الصوتي. اضغط على الميكروفون وتحدث عن قضيتك.'
        : 'Hello! 👋 I\'m your voice legal advisor. Tap the mic and tell me about your case.',
    };
    setMessages([greeting]);

    // Auto-speak greeting
    setTimeout(() => speakText(greeting.content, lang), 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Scroll to bottom ─── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialText]);

  /* ─── TTS helper ─── */
  const speakText = useCallback((text: string, voiceLang: string) => {
    if (muted || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utt   = new SpeechSynthesisUtterance(text);
    utt.lang    = voiceLang;
    utt.rate    = 0.95;
    utt.pitch   = 1.0;
    utt.volume  = 1.0;

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v =>
      v.lang.startsWith(voiceLang.split('-')[0]) && !v.name.includes('Google')
    ) ?? voices.find(v => v.lang.startsWith(voiceLang.split('-')[0]));
    if (match) utt.voice = match;

    utt.onstart = () => setSpeaking(true);
    utt.onend   = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);

    synthRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [muted]);

  /* ─── STT ─── */
  const startListening = useCallback(() => {
    if (processing || speaking) return;
    setError('');

    const SpeechRecCheck = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecCheck) { setSupported(false); return; }

    // Stop any ongoing speech
    window.speechSynthesis?.cancel();
    setSpeaking(false);

    const rec         = new SpeechRecCheck() as SpeechRecognitionInstance;
    rec.lang          = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous    = false;

    rec.onstart = () => { setListening(true); setPartialText(''); };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = '';
      let final   = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setPartialText(interim);
      if (final) setTranscript(final);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setListening(false);
      setPartialText('');
      if (e.error === 'not-allowed') {
        setPermDenied(true);
        setError(isRTL
          ? 'لم يُسمح بالوصول إلى الميكروفون. يرجى السماح من إعدادات المتصفح.'
          : 'Microphone access denied. Please allow it in browser settings.');
      } else if (e.error !== 'no-speech') {
        setError(isRTL ? 'لم يتم التعرف على الصوت. حاول مرة أخرى.' : 'Could not hear you. Please try again.');
      }
    };

    rec.onend = () => {
      setListening(false);
      setPartialText('');
      // Auto-submit if we got a transcript
      setTranscript(prev => {
        if (prev.trim()) {
          sendToAI(prev);
          return '';
        }
        return prev;
      });
    };

    recognitionRef.current = rec;
    try { rec.start(); }
    catch { setError(isRTL ? 'تعذّر تشغيل الميكروفون.' : 'Could not start microphone.'); }
  }, [lang, processing, speaking, isRTL]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  /* ─── Send to AI ─── */
  const sendToAI = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setProcessing(true);
    setError('');

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/voice/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript:   text,
          history:      historyRef.current,
          case_id:      caseId,
          case_context: caseContext ?? caseTitle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'daily_limit_reached') {
          const limitMsg = isRTL
            ? `لقد استنفدت حصتك اليومية (${data.limit} استفسار). يرجى الترقية للمزيد.`
            : `Daily limit reached (${data.limit} queries). Please upgrade for more.`;
          setMessages(prev => [...prev, { role: 'assistant', content: limitMsg }]);
          speakText(limitMsg, lang);
          return;
        }
        throw new Error(data.error ?? 'Error');
      }

      const botMsg: Message = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, botMsg]);

      // Update history ref
      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const,      content: text           },
        { role: 'assistant' as const, content: data.response  },
      ].slice(-12); // keep 6 exchanges

      // Update usage
      if (data.queries_remaining !== undefined) {
        setUsage(prev => prev ? {
          ...prev,
          used:      data.queries_used,
          remaining: data.queries_remaining,
        } : prev);
      }

      // Auto-speak response
      if (!muted) speakText(data.response, lang);

    } catch (e) {
      const errMsg = isRTL ? 'عذراً، حدث خطأ. حاول مرة أخرى.' : 'Sorry, something went wrong. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      setError(e instanceof Error ? e.message : errMsg);
    } finally {
      setProcessing(false);
    }
  }, [caseId, caseContext, caseTitle, lang, muted, isRTL, speakText]);

  const reset = useCallback(() => {
    window.speechSynthesis?.cancel();
    setMessages([{
      role:    'assistant',
      content: isRTL
        ? 'تمت إعادة المحادثة. اضغط على الميكروفون للبدء.'
        : 'Conversation reset. Tap the mic to start.',
    }]);
    historyRef.current = [];
    setError('');
    setTranscript('');
  }, [isRTL]);

  /* ─── Not supported ─── */
  if (!supported) return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#1A3557] p-8 text-center"
      dir={isRTL ? 'rtl' : 'ltr'}>
      <MicOff className="h-10 w-10 text-white/40" />
      <div>
        <p className="text-sm font-bold text-white">
          {isRTL ? 'المتصفح لا يدعم التعرف على الصوت' : 'Voice not supported in this browser'}
        </p>
        <p className="text-xs text-white/60 mt-1">
          {isRTL ? 'استخدم Chrome أو Edge أو Safari' : 'Use Chrome, Edge, or Safari'}
        </p>
      </div>
    </div>
  );

  if (dismissed && !embedded) return null;

  const containerClass = embedded
    ? 'rounded-2xl overflow-hidden'
    : cn(
        'fixed z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl animate-scale-in',
        'bottom-4 end-4 w-[380px] max-w-[calc(100vw-32px)]'
      );

  return (
    <div className={containerClass}
      style={{ background: 'linear-gradient(160deg,#0B1D35 0%,#112340 60%,#0c1e38 100%)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#C89B3C]/20">
            <Mic className="h-4 w-4 text-[#C89B3C]" />
            {(listening || speaking) && (
              <span className="absolute inset-0 rounded-full bg-[#C89B3C]/20 animate-ping" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {isRTL ? 'المستشار القانوني الصوتي' : 'Voice Legal Advisor'}
            </p>
            <p className="text-[10px] text-white/50">
              {listening  ? (isRTL ? '🔴 يستمع…'           : '🔴 Listening…')
               : speaking ? (isRTL ? '🔊 يتحدث…'           : '🔊 Speaking…')
               : processing ? (isRTL ? '⏳ يفكر…'          : '⏳ Thinking…')
               :              (isRTL ? 'مدعوم بالذكاء الاصطناعي' : 'AI-powered · Arabic + English')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { setMuted(m => !m); window.speechSynthesis?.cancel(); setSpeaking(false); }}
            className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition"
            title={muted ? (isRTL ? 'تشغيل الصوت' : 'Unmute') : (isRTL ? 'كتم الصوت' : 'Mute')}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button onClick={reset}
            className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition"
            title={isRTL ? 'إعادة' : 'Reset'}>
            <RotateCcw className="h-4 w-4" />
          </button>
          {!embedded && (
            <button onClick={() => setDismissed(true)}
              className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Case context pill ── */}
      {caseTitle && (
        <div className="px-5 py-2 border-b border-white/5">
          <p className="text-[10px] text-white/40 truncate">
            {isRTL ? `📋 ${caseTitle}` : `📋 Case: ${caseTitle}`}
          </p>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4 min-h-[180px] max-h-[280px] no-scrollbar">
        {messages.map((msg, i) => (
          <VoiceBubble key={i} msg={msg} isRTL={isRTL}
            onSpeak={(text, l) => speakText(text, l)} />
        ))}

        {/* Partial transcript preview */}
        {partialText && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-se-none bg-[#C89B3C]/30 px-4 py-2.5 text-sm text-white/70 italic"
              dir={isRTL ? 'rtl' : 'ltr'}>
              {partialText}
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {processing && (
          <div className="flex items-end gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-3.5 w-3.5 text-[#C89B3C]" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-ss-none bg-white/15 px-4 py-3">
              {[0,1,2].map(i => (
                <span key={i} className="h-2 w-2 rounded-full bg-white/50 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-5 mb-2 flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/30 px-4 py-2.5">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* ── Mic button + waveform ── */}
      <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-3">

        {/* Waveform */}
        <StaticWaveform listening={listening} />

        {/* Big mic button */}
        <button
          onClick={listening ? stopListening : startListening}
          disabled={processing || permDenied}
          className={cn(
            'relative flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-all duration-200',
            listening
              ? 'bg-red-500 scale-110 shadow-red-500/40'
              : processing
              ? 'bg-[#1A3557] opacity-60 cursor-not-allowed'
              : permDenied
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-br from-[#C89B3C] to-[#E8B84B] hover:scale-105 active:scale-95 cursor-pointer',
          )}
          aria-label={listening ? (isRTL ? 'إيقاف الاستماع' : 'Stop listening') : (isRTL ? 'ابدأ التحدث' : 'Start speaking')}
        >
          {/* Pulse rings when listening */}
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
              <span className="absolute -inset-3 rounded-full border border-red-500/20 animate-pulse" />
            </>
          )}
          {processing
            ? <Loader2 className="h-8 w-8 text-white animate-spin" />
            : listening
            ? <MicOff className="h-8 w-8 text-white" />
            : <Mic className="h-8 w-8 text-[#1A3557]" />}
        </button>

        <p className="text-xs text-white/50 text-center">
          {permDenied
            ? (isRTL ? 'يرجى السماح بالوصول إلى الميكروفون في المتصفح' : 'Allow microphone access in browser settings')
            : listening
            ? (isRTL ? 'اضغط للإيقاف' : 'Tap to stop · We\'re listening')
            : processing
            ? (isRTL ? 'جارٍ المعالجة…' : 'Processing…')
            : (isRTL ? 'اضغط للتحدث' : 'Tap mic to speak')}
        </p>

        {/* Usage */}
        {usage && (
          <div className="w-full">
            <UsageBar usage={usage} isRTL={isRTL} />
          </div>
        )}
      </div>

      {/* ── Legal footer ── */}
      <p className="px-5 pb-4 text-center text-[9px] text-white/30">
        {isRTL ? 'وكيلا لا تقدم استشارات قانونية' : 'Wakeela does not provide legal advice'}
      </p>
    </div>
  );
}
