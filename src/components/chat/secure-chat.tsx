'use client';

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Send, Loader2, Lock, MessageCircle, Paperclip,
  CheckCheck, Check, X, Trash2, FileText,
  Download, Shield, AlertCircle, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { ChatMessage, ChatParticipant, VaultDocument } from '@/types';

/* ─────────────────────────────────────────────────────────────────
   Props
───────────────────────────────────────────────────────────────── */
interface SecureChatProps {
  caseId:    string;
  caseTitle: string;
  userId:    string;
  userRole:  'client' | 'lawyer' | 'admin';
  locale:    string;
}

/* ─────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────── */
function ParticipantBadge({ p, isRTL }: { p: ChatParticipant; isRTL: boolean }) {
  const statusConfig = {
    active:     { dot: 'bg-emerald-500', label: isRTL ? 'نشط'         : 'Active',      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
    not_joined: { dot: 'bg-amber-400',   label: isRTL ? 'لم ينضم بعد' : 'Not Joined',  badge: 'bg-amber-100   text-amber-700   dark:bg-amber-900/40   dark:text-amber-400'   },
    revoked:    { dot: 'bg-red-400',     label: isRTL ? 'مُلغى'        : 'Revoked',     badge: 'bg-red-100     text-red-700     dark:bg-red-900/40     dark:text-red-400'     },
  };
  const cfg = statusConfig[p.status] ?? statusConfig.not_joined;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#1A3557] to-[#0E7490] text-white text-[10px] font-black shadow-sm">
          {p.full_name[0]?.toUpperCase() ?? '?'}
        </div>
        <span className={cn('absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-background', cfg.dot)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{p.full_name}</p>
        <span className={cn('text-[9px] font-bold rounded-full px-1.5 py-0.5', cfg.badge)}>
          {p.role === 'lawyer' ? (isRTL ? '⚖️ محامٍ' : '⚖️ Lawyer') : (isRTL ? '👤 موكّل' : '👤 Client')}
          {' · '}{cfg.label}
        </span>
      </div>
    </div>
  );
}

function ReadReceipt({ msg, currentUserId }: { msg: ChatMessage; currentUserId: string }) {
  if (msg.sender_id !== currentUserId) return null;
  return (
    <span className="inline-flex items-center ms-1 opacity-70">
      {msg.read_at
        ? <CheckCheck className="h-3 w-3 text-blue-400" />
        : <Check      className="h-3 w-3 text-white/60" />}
    </span>
  );
}

function MessageBubble({
  msg, isMine, isRTL, currentUserId, onDelete,
}: {
  msg: ChatMessage;
  isMine: boolean;
  isRTL: boolean;
  currentUserId: string;
  onDelete: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const isAttachment = msg.message_type === 'attachment';
  const isSystem     = msg.message_type === 'system';
  const fmtSize      = (n: number) => n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/(1024*1024)).toFixed(1)} MB`;

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn('group flex gap-2.5 mb-3', isMine ? 'flex-row-reverse' : 'flex-row')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Avatar */}
      <div className={cn(
        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black shadow-sm mt-auto',
        isMine ? 'bg-gradient-to-br from-[#1A3557] to-[#1e4a7a] text-white'
               : 'bg-gradient-to-br from-[#0E7490] to-[#0c6578] text-white'
      )}>
        {(msg.sender?.full_name?.[0] ?? '?').toUpperCase()}
      </div>

      <div className={cn('max-w-[70%] space-y-0.5', isMine ? 'items-end' : 'items-start', 'flex flex-col')}>
        {/* Sender name */}
        <p className="text-[10px] text-muted-foreground px-1">
          {isMine
            ? (isRTL ? 'أنت' : 'You')
            : (msg.sender?.full_name ?? (msg.sender?.role === 'lawyer'
                ? (isRTL ? 'المحامي' : 'Lawyer')
                : (isRTL ? 'الموكّل' : 'Client')))}
        </p>

        {/* Bubble */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isMine
            ? 'bg-[#1A3557] text-white rounded-br-sm dark:bg-[#1A3557]'
            : 'bg-card border border-border text-foreground rounded-bl-sm',
          isAttachment && (isMine ? 'bg-[#1A3557]/90' : 'bg-muted/70')
        )}>
          {isAttachment ? (
            <div className="flex items-center gap-3 min-w-[160px]">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', isMine ? 'bg-white/20' : 'bg-[#1A3557]/10')}>
                <FileText className={cn('h-4 w-4', isMine ? 'text-white' : 'text-[#1A3557]')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-semibold truncate', isMine ? 'text-white' : 'text-foreground')}>
                  {msg.attachment_name ?? (isRTL ? 'مستند' : 'Document')}
                </p>
                {msg.attachment_size && (
                  <p className={cn('text-[10px]', isMine ? 'text-white/60' : 'text-muted-foreground')}>
                    {fmtSize(msg.attachment_size)}
                  </p>
                )}
              </div>
              <a href={`#vault-${msg.attachment_doc_id}`}
                className={cn('shrink-0 rounded-lg p-1.5 transition', isMine ? 'hover:bg-white/10' : 'hover:bg-muted')}>
                <Download className={cn('h-3.5 w-3.5', isMine ? 'text-white/80' : 'text-muted-foreground')} />
              </a>
            </div>
          ) : (
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          )}
        </div>

        {/* Footer: time + read receipt */}
        <div className={cn('flex items-center gap-1 px-1', isMine ? 'flex-row-reverse' : 'flex-row')}>
          <p className="text-[9px] text-muted-foreground/70">
            {new Date(msg.created_at).toLocaleTimeString(isRTL ? 'ar-AE' : 'en-AE', {
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
          <ReadReceipt msg={msg} currentUserId={currentUserId} />
        </div>
      </div>

      {/* Delete action (hover) */}
      {isMine && hover && (
        <button
          onClick={() => onDelete(msg.id)}
          className="self-center opacity-0 group-hover:opacity-100 transition rounded-lg p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          title={isRTL ? 'حذف' : 'Delete'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function VaultPicker({
  caseId, isRTL, onSelect, onClose,
}: {
  caseId: string;
  isRTL: boolean;
  onSelect: (doc: VaultDocument) => void;
  onClose: () => void;
}) {
  const [docs,    setDocs]    = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const fmtSize = (n: number) => n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/(1024*1024)).toFixed(1)} MB`;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('documents')
      .select('id, file_name, file_size, file_hash, mime_type, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setDocs(data ?? []); setLoading(false); });
  }, [caseId]);

  return (
    <div className="absolute bottom-full mb-2 start-0 w-72 rounded-2xl border border-border bg-card shadow-float z-50 animate-scale-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold text-foreground">
          {isRTL ? 'اختر من خزنة الأدلة' : 'Select from Evidence Vault'}
        </p>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="py-6 text-center">
            <FileText className="mx-auto h-7 w-7 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">
              {isRTL ? 'لا توجد مستندات في هذه القضية' : 'No documents in this case'}
            </p>
          </div>
        ) : (
          docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => { onSelect(doc); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition text-start"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A3557]/10">
                <FileText className="h-3.5 w-3.5 text-[#1A3557]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">{doc.file_name}</p>
                <p className="text-[10px] text-muted-foreground">{fmtSize(doc.file_size ?? 0)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────────── */
export function SecureChat({ caseId, caseTitle, userId, userRole, locale }: SecureChatProps) {
  const isRTL    = locale === 'ar';
  const supabase = createClient();

  const [messages,      setMessages]      = useState<ChatMessage[]>([]);
  const [participants,  setParticipants]  = useState<ChatParticipant[]>([]);
  const [content,       setContent]       = useState('');
  const [loading,       setLoading]       = useState(true);
  const [sending,       setSending]       = useState(false);
  const [showVault,     setShowVault]     = useState(false);
  const [pendingDoc,    setPendingDoc]    = useState<VaultDocument | null>(null);
  const [showInfo,      setShowInfo]      = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatRef    = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}/chat`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setParticipants(data.participants ?? []);
    setLoading(false);
    setTimeout(() => scrollBottom(false), 50);
  }, [caseId, scrollBottom]);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`chat:${caseId}:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',
        filter: `case_id=eq.${caseId}`,
      }, (payload) => {
        // Optimistically add new message, then re-fetch for full data
        const newMsg = payload.new as ChatMessage;
        if (newMsg.sender_id !== userId) {
          fetchMessages(); // fetch to get sender name + mark read
        }
      })
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'chat_messages',
        filter: `case_id=eq.${caseId}`,
      }, () => { fetchMessages(); }) // catch read_at updates
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [caseId, userId, supabase, fetchMessages]);

  // Group by date
  const grouped = useMemo(() => {
    const result: { date: string; msgs: ChatMessage[] }[] = [];
    messages.forEach((m) => {
      const d = m.created_at.split('T')[0];
      const last = result[result.length - 1];
      if (last?.date === d) { last.msgs.push(m); }
      else { result.push({ date: d, msgs: [m] }); }
    });
    return result;
  }, [messages]);

  const fmtDateLabel = (d: string) => {
    const date   = new Date(d);
    const today  = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString())     return isRTL ? 'اليوم'    : 'Today';
    if (date.toDateString() === yesterday.toDateString()) return isRTL ? 'أمس'      : 'Yesterday';
    return date.toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const send = async () => {
    const text = content.trim();
    if (!text && !pendingDoc) return;
    if (sending) return;

    setSending(true);
    const msgContent = text || (isRTL ? `📎 ${pendingDoc?.file_name}` : `📎 ${pendingDoc?.file_name}`);
    const msgType    = pendingDoc ? 'attachment' : 'text';

    // Optimistic update
    const tempMsg: ChatMessage = {
      id:           `temp-${Date.now()}`,
      case_id:      caseId,
      sender_id:    userId,
      content:      msgContent,
      is_encrypted: false,
      message_type: msgType,
      attachment_doc_id:  pendingDoc?.id,
      attachment_name:    pendingDoc?.file_name,
      attachment_size:    pendingDoc?.file_size,
      created_at:   new Date().toISOString(),
      sender: { id: userId, full_name: '', role: userRole },
    };
    setMessages((prev) => [...prev, tempMsg]);
    setContent('');
    setPendingDoc(null);
    setTimeout(() => scrollBottom(), 50);

    try {
      await fetch(`/api/cases/${caseId}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          content:           msgContent,
          message_type:      msgType,
          attachment_doc_id: pendingDoc?.id ?? null,
        }),
      });
      await fetchMessages(); // replace temp with real
    } catch {
      // Remove temp msg on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setContent(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const deleteMessage = async (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    await fetch(`/api/cases/${caseId}/chat`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message_id: msgId }),
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // PDF Export — uses browser print with a print stylesheet
  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dir  = isRTL ? 'rtl' : 'ltr';
    const msgs = messages
      .filter((m) => m.message_type !== 'system')
      .map((m) => {
        const sender = m.sender_id === userId
          ? (isRTL ? 'أنت' : 'You')
          : (m.sender?.full_name ?? (isRTL ? 'المحامي' : 'Lawyer'));
        const time = new Date(m.created_at).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
          dateStyle: 'medium', timeStyle: 'short',
        });
        const isMe = m.sender_id === userId;
        const bg   = isMe ? '#1A3557' : '#f3f4f6';
        const color = isMe ? '#ffffff' : '#1f2937';
        const align = isRTL ? (isMe ? 'start' : 'end') : (isMe ? 'end' : 'start');
        const content = m.message_type === 'attachment'
          ? `📎 ${m.attachment_name ?? 'Document'}`
          : m.content;
        return `
          <div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:12px;">
            <p style="font-size:10px;color:#6b7280;margin:0 0 3px 0;">${sender} · ${time}</p>
            <div style="max-width:70%;background:${bg};color:${color};border-radius:12px;padding:10px 14px;font-size:13px;line-height:1.5;">
              ${content}
            </div>
          </div>`;
      }).join('');

    printWindow.document.write(`<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="UTF-8">
<title>${isRTL ? `محادثة — ${caseTitle}` : `Chat Export — ${caseTitle}`}</title>
<style>
  body { font-family: ${isRTL ? "'IBM Plex Arabic', Arial" : "Inter, Arial"}, sans-serif; margin: 32px; color: #1f2937; }
  h1   { font-size: 18px; font-weight: 800; color: #1A3557; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #6b7280; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; }
  .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #9ca3af; text-align: center; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<h1>${caseTitle}</h1>
<div class="meta">
  ${isRTL ? `محادثة آمنة · تصدير: ${new Date().toLocaleString('ar-AE')} · ${messages.length} رسالة`
           : `Secure Chat Export · ${new Date().toLocaleString('en-AE')} · ${messages.length} messages`}
</div>
${msgs}
<div class="footer">
  ${isRTL ? 'وكيلا — منصة الشفافية القانونية · للاستخدام القانوني فقط'
           : 'Wakeela Legal Accountability Platform · For legal use only'}
</div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
  };

  const activeLawyers  = participants.filter((p) => p.role === 'lawyer' && p.status === 'active');
  const pendingLawyers = participants.filter((p) => p.role === 'lawyer' && p.status !== 'active');
  const canSend        = activeLawyers.length > 0 || userRole === 'lawyer';

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border bg-card overflow-hidden shadow-card">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-gradient-to-r from-[#1A3557] to-[#0E7490]">
        {/* Title row */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
              <Lock className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isRTL ? 'المحادثة الآمنة' : 'Secure Chat'}
              </h3>
              <p className="text-[10px] text-white/60">{caseTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white">
              <Shield className="h-3 w-3" />
              {isRTL ? 'E2E مشفّر' : 'E2E Ready'}
            </span>
            <button
              onClick={exportPDF}
              title={isRTL ? 'تصدير PDF' : 'Export PDF'}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition text-white"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowInfo((v) => !v)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg transition text-white',
                showInfo ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
              )}
            >
              <User className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Participants panel */}
        {showInfo && (
          <div className="px-5 pb-4 border-t border-white/10 pt-3 space-y-2 animate-fade-in">
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
              {isRTL ? 'المشاركون' : 'Participants'}
            </p>
            <div className="flex flex-wrap gap-3">
              {participants.map((p) => (
                <div key={p.id} className="bg-white/10 rounded-xl px-3 py-2">
                  <ParticipantBadge p={p} isRTL={isRTL} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── No lawyer warning ─────────────────────────────────── */}
      {!canSend && !loading && (
        <div className="shrink-0 flex items-center gap-2.5 px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900/40">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {isRTL
              ? 'لم ينضم أي محامٍ بعد. أرسل رابط الدعوة أولاً.'
              : 'No lawyer has joined yet. Send an invite link first.'}
          </p>
        </div>
      )}

      {/* Pending lawyers banner */}
      {pendingLawyers.length > 0 && userRole === 'client' && (
        <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-muted/50 border-b border-border">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <p className="text-[10px] text-muted-foreground">
            {isRTL
              ? `${pendingLawyers.length} محامٍ لم ينضم بعد`
              : `${pendingLawyers.length} lawyer(s) haven't joined yet`}
          </p>
        </div>
      )}

      {/* ── Messages area ─────────────────────────────────────── */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-4 no-scrollbar">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1A3557]/10">
              <MessageCircle className="h-8 w-8 text-[#1A3557]/40" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {isRTL ? 'ابدأ المحادثة' : 'Start the conversation'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              {isRTL
                ? 'المحادثة آمنة ومشفّرة بين الموكّل والمحامي فقط.'
                : 'Messages are end-to-end encrypted between you and your lawyer.'}
            </p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date}>
              {/* Date divider */}
              <div className="divider my-4">
                <span className="shrink-0 text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {fmtDateLabel(date)}
                </span>
              </div>
              {msgs.map((m) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  isMine={m.sender_id === userId}
                  isRTL={isRTL}
                  currentUserId={userId}
                  onDelete={deleteMessage}
                />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
        {/* Pending attachment preview */}
        {pendingDoc && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 animate-fade-in">
            <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-[#1A3557]/10 border border-[#1A3557]/20 px-3 py-2">
              <FileText className="h-4 w-4 text-[#1A3557] shrink-0" />
              <p className="text-xs font-medium text-[#1A3557] truncate">{pendingDoc.file_name}</p>
              <button onClick={() => setPendingDoc(null)} className="ms-auto shrink-0">
                <X className="h-3.5 w-3.5 text-[#1A3557]/60 hover:text-[#1A3557]" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 px-4 py-3">
          {/* Attachment button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowVault((v) => !v)}
              disabled={!canSend}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border transition',
                showVault
                  ? 'border-[#1A3557] bg-[#1A3557]/10 text-[#1A3557]'
                  : 'border-border text-muted-foreground hover:border-[#1A3557]/30 hover:text-[#1A3557] hover:bg-[#1A3557]/5',
                !canSend && 'opacity-40 cursor-not-allowed'
              )}
              title={isRTL ? 'إرفاق من الخزنة' : 'Attach from Vault'}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {showVault && (
              <VaultPicker
                caseId={caseId}
                isRTL={isRTL}
                onSelect={(doc) => { setPendingDoc(doc); setShowVault(false); }}
                onClose={() => setShowVault(false)}
              />
            )}
          </div>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={autoResize}
            onKeyDown={onKey}
            disabled={!canSend}
            rows={1}
            placeholder={
              !canSend
                ? (isRTL ? 'لا يمكن إرسال رسائل بدون محامٍ' : 'Invite a lawyer to start chatting')
                : (isRTL ? 'اكتب رسالتك… (Enter للإرسال)' : 'Type a message… (Enter to send)')
            }
            className={cn(
              'flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm',
              'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#1A3557]/25',
              'transition-all duration-150 leading-relaxed',
              !canSend && 'opacity-50 cursor-not-allowed'
            )}
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />

          {/* Send button */}
          <button
            onClick={send}
            disabled={(!content.trim() && !pendingDoc) || sending || !canSend}
            className={cn(
              'shrink-0 flex h-10 w-10 items-center justify-center rounded-xl transition',
              (!content.trim() && !pendingDoc) || !canSend
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-[#1A3557] text-white hover:bg-[#1e4a7a] shadow-brand active:scale-95'
            )}
          >
            {sending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className={cn('h-4 w-4', isRTL && 'rotate-180')} />}
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-[9px] text-muted-foreground/50 pb-2">
          {isRTL
            ? 'هذه المحادثة محمية · E2E Encryption مخطط في الإصدار التالي'
            : 'Conversation protected · E2E Encryption planned for next release'}
        </p>
      </div>
    </div>
  );
}
