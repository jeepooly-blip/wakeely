'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, Lock, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { ChatMessage } from '@/types';

interface SecureChatProps {
  caseId:  string;
  userId:  string;
  locale:  string;
}

export function SecureChat({ caseId, userId, locale }: SecureChatProps) {
  const isRTL   = locale === 'ar';
  const supabase = createClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content,  setContent]  = useState('');
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}/chat`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
      setLoading(false);
      setTimeout(scrollBottom, 50);
    }
  }, [caseId]);

  useEffect(() => {
    fetchMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`chat:${caseId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',
        filter: `case_id=eq.${caseId}`,
      }, () => { fetchMessages(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [caseId, supabase, fetchMessages]);

  const send = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    const text = content.trim();
    setContent('');
    try {
      await fetch(`/api/cases/${caseId}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: text }),
      });
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString(isRTL ? 'ar-AE' : 'en-AE', { hour: '2-digit', minute: '2-digit' });

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short' });

  // Group messages by date
  const grouped: { date: string; msgs: ChatMessage[] }[] = [];
  messages.forEach((m) => {
    const d = m.created_at.split('T')[0];
    const last = grouped[grouped.length - 1];
    if (last?.date === d) { last.msgs.push(m); }
    else { grouped.push({ date: d, msgs: [m] }); }
  });

  return (
    <div className="flex flex-col h-[520px] rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
        <Lock className="h-3.5 w-3.5 text-[#1A3557]" />
        <h3 className="text-sm font-semibold text-foreground">
          {isRTL ? 'المحادثة الآمنة' : 'Secure Chat'}
        </h3>
        <span className="ms-auto text-[10px] rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 font-medium">
          {isRTL ? 'مشفّرة' : 'Encrypted'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <MessageCircle className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'لا توجد رسائل بعد. ابدأ المحادثة!' : 'No messages yet. Start the conversation!'}
            </p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date}>
              {/* Date divider */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground px-2">
                  {fmtDate(date)}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {msgs.map((m) => {
                const isMine = m.sender_id === userId;
                return (
                  <div key={m.id} className={cn('flex gap-2 mb-2', isMine && 'flex-row-reverse')}>
                    {/* Avatar */}
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5',
                      isMine
                        ? 'bg-[#1A3557] text-white'
                        : 'bg-[#0E7490]/20 text-[#0E7490]'
                    )}>
                      {(m.sender?.full_name?.[0] ?? '?').toUpperCase()}
                    </div>

                    <div className={cn('max-w-[72%]', isMine && 'items-end flex flex-col')}>
                      {/* Sender name */}
                      <p className="text-[10px] text-muted-foreground mb-1 px-1">
                        {isMine
                          ? (isRTL ? 'أنت' : 'You')
                          : (m.sender?.full_name ?? (m.sender?.role === 'lawyer' ? (isRTL ? 'المحامي' : 'Lawyer') : (isRTL ? 'الموكّل' : 'Client')))}
                      </p>
                      <div className={cn(
                        'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                        isMine
                          ? 'bg-[#1A3557] text-white rounded-tr-sm'
                          : 'bg-muted text-foreground rounded-tl-sm'
                      )}>
                        {m.content}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 px-1">{fmtTime(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder={isRTL ? 'اكتب رسالتك…' : 'Type a message…'}
          className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30 max-h-24"
          style={{ minHeight: '42px' }}
        />
        <button
          onClick={send}
          disabled={!content.trim() || sending}
          className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A3557] text-white disabled:opacity-40 hover:bg-[#1e4a7a] transition"
        >
          {sending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className={cn('h-4 w-4', isRTL && 'rotate-180')} />}
        </button>
      </div>
    </div>
  );
}
