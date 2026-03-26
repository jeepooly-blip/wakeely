import { NextResponse }     from 'next/server';
import { createClient }    from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { canAccess }       from '@/lib/feature-gate';
import type { SubscriptionTier } from '@/types';

// ──────────────────────────────────────────────────────────────────
// GET /api/cases/[id]/chat/export?locale=en|ar
//
// Returns a print-optimised HTML transcript of the case chat.
// Gated to Pro/Premium subscribers (client or lawyer).
// Auto-opens browser print dialog → user saves as PDF.
//
// PRD Phase 2 — Gap Analysis Task 14
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: caseId } = await params;
  const url    = new URL(request.url);
  const locale = (url.searchParams.get('locale') ?? 'en') as 'en' | 'ar';
  const isRTL  = locale === 'ar';
  const dir    = isRTL ? 'rtl' : 'ltr';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Tier gate — Pro/Premium only ──────────────────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_tier, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const tier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;

  // Lawyers always get export (they're free tier); clients need Pro+
  const isLawyer = profile?.role === 'lawyer' || profile?.role === 'admin';
  if (!isLawyer && !canAccess(tier, 'chat')) {
    // Return upgrade prompt page instead of 403
    return new NextResponse(buildUpgradePage(isRTL), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── Verify access to this case ────────────────────────────────
  const sb = createAdminClient();

  const [{ data: ownedCase }, { data: lawyerCase }] = await Promise.all([
    sb.from('cases').select('id, title, client_id').eq('id', caseId).eq('client_id', user.id).maybeSingle(),
    sb.from('case_lawyers').select('case_id').eq('case_id', caseId).eq('lawyer_id', user.id).eq('status', 'active').maybeSingle(),
  ]);

  if (!ownedCase && !lawyerCase) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch case info
  const { data: caseRow } = await sb
    .from('cases')
    .select('id, title, client_id, users!cases_client_id_fkey(full_name, email)')
    .eq('id', caseId)
    .maybeSingle();

  if (!caseRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Fetch all non-deleted messages in chronological order ─────
  const { data: messages } = await sb
    .from('chat_messages')
    .select(`
      id, sender_id, content, message_type, attachment_name,
      is_encrypted, read_at, created_at,
      sender:users!chat_messages_sender_id_fkey(id, full_name, role)
    `)
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const msgs = messages ?? [];

  // ── Fetch participants for header ─────────────────────────────
  const participantIds = [...new Set(msgs.map((m) => m.sender_id))];
  const { data: participants } = await sb
    .from('users')
    .select('id, full_name, role')
    .in('id', participantIds);

  const participantMap = Object.fromEntries(
    (participants ?? []).map((p) => [p.id, p])
  );

  const exportedAt = new Date().toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });

  const caseClient = caseRow.users as unknown as { full_name: string; email: string } | null;
  const font = isRTL ? "'IBM Plex Arabic', Arial" : "'Inter', Arial";

  // ── Build message rows ────────────────────────────────────────
  const messageRows = msgs.map((msg, i) => {
    const sender      = participantMap[msg.sender_id];
    const senderName  = sender?.full_name ?? (isRTL ? 'مستخدم' : 'User');
    const senderRole  = sender?.role ?? 'client';
    const isClient    = senderRole === 'client';
    const isSystem    = msg.message_type === 'system';
    const dateStr     = fmtDateTime(msg.created_at);

    let contentHtml: string;
    if (msg.is_encrypted) {
      contentHtml = `<span class="encrypted-note">[${isRTL ? 'مشفّر — المحتوى غير متاح' : 'Encrypted — content not available'}]</span>`;
    } else if (msg.message_type === 'attachment') {
      contentHtml = `<span class="attachment-note">📎 ${msg.attachment_name ?? (isRTL ? 'مستند' : 'Document')}</span>`;
    } else {
      contentHtml = msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    if (isSystem) {
      return `
        <div class="msg-system">
          <span class="system-text">${contentHtml}</span>
          <span class="msg-time">${dateStr}</span>
        </div>`;
    }

    const bubbleClass = isClient ? 'msg-client' : 'msg-lawyer';
    const alignClass  = isRTL
      ? (isClient ? 'align-end' : 'align-start')
      : (isClient ? 'align-end' : 'align-start');

    const readIcon = msg.read_at
      ? '<span class="read-tick" title="Read">✓✓</span>'
      : '';

    return `
      <div class="msg-row ${alignClass}">
        <div class="msg-sender">${senderName}</div>
        <div class="msg-bubble ${bubbleClass}">
          ${contentHtml}
          <div class="msg-meta">
            <span class="msg-time">${dateStr}</span>
            ${readIcon}
          </div>
        </div>
      </div>`;
  }).join('\n');

  // ── Participant list for header ────────────────────────────────
  const participantListHtml = (participants ?? []).map((p) => {
    const roleLabel = p.role === 'lawyer'
      ? (isRTL ? 'محامٍ' : 'Lawyer')
      : (isRTL ? 'موكّل' : 'Client');
    return `<span class="participant-chip">${p.full_name} · <em>${roleLabel}</em></span>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${isRTL ? 'نسخة المحادثة' : 'Chat Transcript'} — ${caseRow.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&family=Inter:wght@400;600;700;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${font}, sans-serif;
      background: #fff;
      color: #111827;
      font-size: 12px;
      line-height: 1.5;
      direction: ${dir};
    }
    .page { max-width: 720px; margin: 0 auto; padding: 32px 24px; }

    /* Header */
    .header {
      border-bottom: 3px solid #1A3557;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 16px;
    }
    .brand { font-size: 18px; font-weight: 900; color: #1A3557; }
    .brand span { color: #C89B3C; }
    .export-meta { font-size: 9px; color: #6b7280; text-align: ${isRTL ? 'left' : 'right'}; line-height: 1.7; }

    /* Case card */
    .case-card {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 16px;
    }
    .case-title { font-size: 14px; font-weight: 900; color: #1A3557; margin-bottom: 6px; }
    .participants { display: flex; flex-wrap: wrap; gap: 6px; }
    .participant-chip {
      font-size: 10px; background: #e2e8f0; color: #374151;
      padding: 2px 8px; border-radius: 20px;
    }
    .participant-chip em { color: #6b7280; font-style: normal; }

    /* Stats bar */
    .stats { font-size: 10px; color: #6b7280; margin-bottom: 20px; }

    /* Messages */
    .messages { display: flex; flex-direction: column; gap: 10px; }

    .msg-row { display: flex; flex-direction: column; max-width: 72%; }
    .align-end  { align-self: flex-end;  align-items: flex-end; }
    .align-start { align-self: flex-start; align-items: flex-start; }

    .msg-sender { font-size: 9px; font-weight: 700; color: #6b7280; margin-bottom: 3px; }
    .msg-bubble {
      padding: 9px 13px; border-radius: 12px;
      font-size: 12px; line-height: 1.5; max-width: 100%;
      word-break: break-word;
    }
    .msg-client {
      background: #1A3557; color: #fff;
      border-bottom-${isRTL ? 'left' : 'right'}-radius: 3px;
    }
    .msg-lawyer {
      background: #f3f4f6; color: #1f2937;
      border: 1px solid #e5e7eb;
      border-bottom-${isRTL ? 'right' : 'left'}-radius: 3px;
    }
    .msg-meta {
      display: flex; align-items: center; gap: 4px; justify-content: flex-end;
      margin-top: 4px;
    }
    .msg-time { font-size: 9px; opacity: 0.65; }
    .read-tick { font-size: 9px; color: #C89B3C; }
    .encrypted-note { font-style: italic; opacity: 0.7; font-size: 11px; }
    .attachment-note { color: #0E7490; font-weight: 600; }

    .msg-system {
      align-self: center; text-align: center;
      font-size: 10px; color: #9ca3af; padding: 2px 10px;
      background: #f9fafb; border-radius: 20px; border: 1px solid #e5e7eb;
    }
    .system-text { margin-${isRTL ? 'left' : 'right'}: 6px; }

    /* Footer */
    .footer {
      margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between;
      font-size: 9px; color: #9ca3af; gap: 16px;
    }
    .disclaimer { max-width: 440px; line-height: 1.5; }

    /* Print */
    @media print {
      body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 12px 16px; max-width: 100%; }
      .no-print { display: none !important; }
      .msg-row { page-break-inside: avoid; }
    }
    @media screen {
      .print-bar {
        position: fixed; top: 0; left: 0; right: 0;
        background: #1A3557; color: #fff; padding: 10px 20px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        z-index: 100; font-size: 12px;
        font-family: ${font}, sans-serif; direction: ${dir};
      }
      .print-btn {
        background: #C89B3C; color: #fff; border: none; border-radius: 8px;
        padding: 7px 18px; font-weight: 700; cursor: pointer;
        font-family: inherit; font-size: 12px;
      }
      .page { padding-top: 68px; }
    }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span style="opacity:.75;font-size:11px">
      ${isRTL ? '📄 لحفظ كـ PDF: اضغط طباعة ← حفظ كـ PDF' : '📄 To save as PDF: Print → Save as PDF'}
    </span>
    <button class="print-btn" onclick="window.print()">
      ${isRTL ? '🖨️ طباعة / حفظ PDF' : '🖨️ Print / Save as PDF'}
    </button>
  </div>

  <div class="page">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand">WAKEELA <span>·</span> وكيلة</div>
        <div style="font-size:9px;color:#6b7280;margin-top:2px">
          ${isRTL ? 'نسخة المحادثة الآمنة' : 'Secure Chat Transcript'}
        </div>
      </div>
      <div class="export-meta">
        <div><strong>${isRTL ? 'تاريخ التصدير' : 'Exported'}:</strong> ${exportedAt}</div>
        <div><strong>${isRTL ? 'رقم القضية' : 'Case ID'}:</strong> ${caseId.slice(0, 8).toUpperCase()}</div>
        <div><strong>${isRTL ? 'الرسائل' : 'Messages'}:</strong> ${msgs.length}</div>
      </div>
    </div>

    <!-- Case info -->
    <div class="case-card">
      <div class="case-title">${caseRow.title}</div>
      <div class="participants">${participantListHtml}</div>
    </div>

    <div class="stats">
      ${isRTL
        ? `${msgs.length} رسالة · ${msgs.filter((m) => m.is_encrypted).length} مشفّرة · ${msgs.filter((m) => m.message_type === 'attachment').length} مرفقات`
        : `${msgs.length} messages · ${msgs.filter((m) => m.is_encrypted).length} encrypted · ${msgs.filter((m) => m.message_type === 'attachment').length} attachments`}
    </div>

    <!-- Messages -->
    ${msgs.length === 0
      ? `<p style="text-align:center;color:#9ca3af;padding:32px">${isRTL ? 'لا توجد رسائل' : 'No messages'}</p>`
      : `<div class="messages">${messageRows}</div>`
    }

    <!-- Footer -->
    <div class="footer">
      <div class="disclaimer">
        ${isRTL
          ? 'وكيلا هي أداة توثيق فحسب ولا تقدم استشارات قانونية. هذه النسخة سرية ومعدّة للاستخدام القانوني فقط.'
          : 'Wakeela is a documentation tool only and does not provide legal advice. This transcript is confidential and intended for legal use only.'}
      </div>
      <div style="text-align:${isRTL ? 'left' : 'right'}">wakeela.com</div>
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        if (document.referrer || window.opener) window.print();
      }, 500);
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type':        'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="chat-transcript-${caseId.slice(0,8)}.html"`,
      'Cache-Control':       'no-store',
    },
  });
}

function buildUpgradePage(isRTL: boolean): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc}
.card{background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;max-width:380px;text-align:center}
h2{color:#1A3557;font-size:18px;margin-bottom:8px}p{color:#6b7280;font-size:13px;line-height:1.6;margin-bottom:20px}
a{display:inline-block;background:#C89B3C;color:#fff;padding:10px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px}
</style></head><body><div class="card">
<div style="font-size:32px;margin-bottom:12px">🔒</div>
<h2>${isRTL ? 'ميزة Pro/Premium' : 'Pro/Premium Feature'}</h2>
<p>${isRTL ? 'تصدير نسخة المحادثة متاح لمشتركي Pro و Premium فقط.' : 'Chat transcript export is available on Pro and Premium plans.'}</p>
<a href="${appUrl}/billing">${isRTL ? 'ترقية الخطة' : 'Upgrade Plan'}</a>
</div></body></html>`;
}
