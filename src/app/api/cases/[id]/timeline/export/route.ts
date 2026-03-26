import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/cases/[id]/timeline/export?locale=en|ar
//
// Returns a print-optimised HTML page for the case timeline.
// The browser renders it and auto-opens the print dialog so the user can
// save directly as a PDF.
//
// Approach: print-to-PDF via browser  (zero new dependencies, full RTL support,
// works in all browsers, high-quality output, Wakeela-branded)
//
// PRD Reference: PRD §4.1 Screen 5 — "Visual Case Timeline — exportable as PDF"
// Gap Analysis Task 3 — Launch Blocker
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Auth ──────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Resolve locale from query param (falls back to user preference) ──
  const url    = new URL(request.url);
  const locale = (url.searchParams.get('locale') ?? 'en') as 'en' | 'ar';
  const isRTL  = locale === 'ar';
  const dir    = isRTL ? 'rtl' : 'ltr';

  // ── Fetch case (RLS ensures client_id = current user) ────────
  const { data: c } = await supabase
    .from('cases')
    .select('id, title, case_type, jurisdiction, city, created_at, health_score')
    .eq('id', id)
    .eq('client_id', user.id)
    .maybeSingle();

  if (!c) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // ── Fetch user name for the report header ─────────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  // ── Fetch all timeline events (chronological ASC for the report) ─
  const { data: events } = await supabase
    .from('timeline_events')
    .select('id, event_type, payload, is_system_generated, created_at')
    .eq('case_id', id)
    .order('created_at', { ascending: true });

  const timelineEvents = events ?? [];
  const exportedAt     = new Date().toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── Label helpers (same logic as the UI page) ─────────────────
  const eventLabel = (
    type: string,
    payload: Record<string, unknown>
  ): string => {
    const labels: Record<string, string> = {
      case_created:           isRTL ? 'تم إنشاء القضية'                          : 'Case created',
      document_uploaded:      isRTL ? `رُفع: ${payload.file_name ?? ''}`           : `Uploaded: ${payload.file_name ?? ''}`,
      deadline_added:         isRTL ? `موعد جديد: ${payload.title ?? ''}`          : `Deadline added: ${payload.title ?? ''}`,
      deadline_completed:     isRTL ? 'تم إكمال موعد'                              : 'Deadline completed',
      deadline_reminder_sent: isRTL ? 'تم إرسال تذكير موعد'                       : 'Deadline reminder sent',
      action_logged:          isRTL ? `إجراء مسجّل: ${payload.description ?? ''}` : `Action logged: ${payload.description ?? ''}`,
      lawyer_joined:          isRTL ? 'انضم محامٍ إلى القضية'                      : 'Lawyer joined case',
      lawyer_revoked:         isRTL ? 'تم إلغاء صلاحية المحامي'                   : 'Lawyer access revoked',
      nde_flag:               isRTL
        ? `تنبيه: ${payload.rule_name as string ?? ''}`
        : `Alert: ${payload.rule_name as string ?? payload.message as string ?? ''}`,
      nde_flag_resolved:      isRTL
        ? `تم حل التنبيه — ${payload.action_taken as string ?? ''}`
        : `Alert resolved — ${payload.action_taken as string ?? ''}`,
    };
    return labels[type] ?? type.replace(/_/g, ' ');
  };

  const eventCategoryColor = (type: string): string => {
    if (type === 'nde_flag')      return '#f59e0b'; // amber
    if (type.includes('resolved') || type === 'case_created' || type === 'deadline_completed')
                                   return '#10b981'; // green
    if (type === 'lawyer_joined')  return '#0e7490'; // teal
    if (type === 'lawyer_revoked') return '#ef4444'; // red
    if (type.includes('deadline')) return '#0e7490'; // teal
    return '#1a3557'; // navy (default)
  };

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const caseTypeLabel: Record<string, string> = isRTL
    ? { employment: 'عمالة', family: 'أحوال شخصية', commercial: 'تجاري', property: 'عقاري', criminal: 'جنائي', other: 'أخرى' }
    : { employment: 'Employment', family: 'Family', commercial: 'Commercial', property: 'Property', criminal: 'Criminal', other: 'Other' };

  // ── Build event rows HTML ──────────────────────────────────────
  const rows = timelineEvents.map((ev, i) => {
    const color   = eventCategoryColor(ev.event_type);
    const label   = eventLabel(ev.event_type, (ev.payload ?? {}) as Record<string, unknown>);
    const dateStr = fmtDateTime(ev.created_at);
    const isNDE   = ev.event_type === 'nde_flag';
    const sysNote = ev.is_system_generated
      ? `<span class="sys-badge">${isRTL ? 'وكيلا' : 'System'}</span>`
      : '';

    return `
      <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}${isNDE ? ' row-alert' : ''}">
        <td class="col-num">${i + 1}</td>
        <td class="col-date" dir="ltr">${dateStr}</td>
        <td class="col-event">
          <span class="event-dot" style="background:${color}"></span>
          <span class="event-label">${label}</span>
          ${sysNote}
        </td>
        <td class="col-type">
          <span class="type-chip" style="border-color:${color};color:${color}">
            ${ev.event_type.replace(/_/g, ' ')}
          </span>
        </td>
      </tr>`;
  }).join('');

  // ── Health score bar ───────────────────────────────────────────
  const healthColor = c.health_score >= 75 ? '#10b981'
    : c.health_score >= 50 ? '#f59e0b'
    : '#ef4444';

  // ── Full HTML document ─────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isRTL ? 'الجدول الزمني للقضية' : 'Case Timeline'} — ${c.title}</title>
  <style>
    /* ── Fonts ─────────────────────────────────────────── */
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&family=Inter:wght@400;600;700;900&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ${isRTL ? "'IBM Plex Arabic'" : "'Inter'"}, Arial, sans-serif;
      background: #fff;
      color: #111827;
      font-size: 12px;
      line-height: 1.6;
      direction: ${dir};
    }

    /* ── Page layout ───────────────────────────────────── */
    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 32px 28px;
    }

    /* ── Header ────────────────────────────────────────── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #1a3557;
      padding-bottom: 16px;
      margin-bottom: 22px;
    }
    .logo-block .brand {
      font-size: 20px;
      font-weight: 900;
      color: #1a3557;
      letter-spacing: -0.5px;
    }
    .logo-block .brand span { color: #c89b3c; }
    .logo-block .tagline {
      font-size: 9px;
      color: #6b7280;
      margin-top: 2px;
    }
    .export-meta {
      text-align: ${isRTL ? 'left' : 'right'};
      font-size: 9px;
      color: #6b7280;
      line-height: 1.7;
    }

    /* ── Case info card ────────────────────────────────── */
    .case-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
    }
    .case-title {
      font-size: 15px;
      font-weight: 900;
      color: #1a3557;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .case-meta { display: flex; flex-wrap: wrap; gap: 10px; }
    .meta-chip {
      font-size: 10px;
      background: #e2e8f0;
      color: #374151;
      padding: 2px 8px;
      border-radius: 20px;
      font-weight: 600;
    }
    .meta-chip.navy { background: #1a3557; color: #fff; }
    .health-block { text-align: ${isRTL ? 'left' : 'right'}; }
    .health-label { font-size: 9px; color: #6b7280; margin-bottom: 4px; }
    .health-score {
      font-size: 22px;
      font-weight: 900;
      color: ${healthColor};
    }
    .health-bar {
      width: 64px;
      height: 5px;
      background: #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      margin-top: 4px;
    }
    .health-fill {
      height: 100%;
      width: ${c.health_score}%;
      background: ${healthColor};
      border-radius: 10px;
    }

    /* ── Section heading ───────────────────────────────── */
    .section-heading {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6b7280;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-heading::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e2e8f0;
    }
    .event-count {
      background: #1a3557;
      color: #fff;
      font-size: 9px;
      padding: 1px 7px;
      border-radius: 20px;
    }

    /* ── Timeline table ────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead th {
      background: #1a3557;
      color: #fff;
      font-weight: 700;
      font-size: 10px;
      padding: 8px 10px;
      text-align: ${isRTL ? 'right' : 'left'};
    }
    thead th:first-child { border-radius: ${isRTL ? '0 6px 6px 0' : '6px 0 0 6px'}; }
    thead th:last-child  { border-radius: ${isRTL ? '6px 0 0 6px' : '0 6px 6px 0'}; }

    tbody tr { border-bottom: 1px solid #f1f5f9; }
    .row-even { background: #fff; }
    .row-odd  { background: #f8fafc; }
    .row-alert { background: #fffbeb !important; }

    td { padding: 8px 10px; vertical-align: middle; }

    .col-num   { width: 32px; color: #9ca3af; font-weight: 700; text-align: center; }
    .col-date  { width: 140px; color: #4b5563; white-space: nowrap; font-size: 10px; }
    .col-event { }
    .col-type  { width: 140px; }

    .event-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-${isRTL ? 'left' : 'right'}: 6px;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .event-label { font-weight: 600; color: #111827; }
    .sys-badge {
      display: inline-block;
      margin-${isRTL ? 'right' : 'left'}: 6px;
      font-size: 9px;
      background: #e2e8f0;
      color: #6b7280;
      padding: 1px 5px;
      border-radius: 10px;
      vertical-align: middle;
    }
    .type-chip {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 20px;
      border: 1px solid;
      white-space: nowrap;
    }

    /* ── Footer ────────────────────────────────────────── */
    .footer {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 9px;
      color: #9ca3af;
      gap: 20px;
    }
    .disclaimer {
      max-width: 480px;
      line-height: 1.5;
    }
    .page-num { white-space: nowrap; }

    /* ── Print media ───────────────────────────────────── */
    @media print {
      body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 16px 20px; max-width: 100%; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr    { page-break-inside: avoid; }
    }

    /* ── Screen-only: print button ─────────────────────── */
    @media screen {
      .print-bar {
        position: fixed;
        top: 0; left: 0; right: 0;
        background: #1a3557;
        color: #fff;
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        z-index: 100;
        font-size: 12px;
        font-family: ${isRTL ? "'IBM Plex Arabic'" : "'Inter'"}, Arial, sans-serif;
        direction: ${dir};
      }
      .print-bar .hint { opacity: 0.75; font-size: 11px; }
      .print-btn {
        background: #c89b3c;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 7px 18px;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
      }
      .print-btn:hover { background: #b8892f; }
      .page { padding-top: 68px; }
    }
  </style>
</head>
<body>

  <!-- Print bar (screen only) -->
  <div class="print-bar no-print">
    <span class="hint">
      ${isRTL
        ? '📄 لحفظ الملف بصيغة PDF: اضغط "طباعة" ثم اختر "حفظ كـ PDF" كالطابعة'
        : '📄 To save as PDF: click Print → choose "Save as PDF" as the printer'}
    </span>
    <button class="print-btn" onclick="window.print()">
      ${isRTL ? '🖨️ طباعة / حفظ PDF' : '🖨️ Print / Save as PDF'}
    </button>
  </div>

  <div class="page">

    <!-- Header -->
    <div class="header">
      <div class="logo-block">
        <div class="brand">WAKEELA <span>·</span> وكيلة</div>
        <div class="tagline">${isRTL ? 'درعك القانوني الشخصي' : 'Your personal legal shield'}</div>
      </div>
      <div class="export-meta">
        <div><strong>${isRTL ? 'تاريخ التصدير' : 'Exported'}:</strong> ${exportedAt}</div>
        <div><strong>${isRTL ? 'العميل' : 'Client'}:</strong> ${profile?.full_name ?? user.email}</div>
        <div><strong>${isRTL ? 'رقم القضية' : 'Case ID'}:</strong> ${c.id.slice(0, 8).toUpperCase()}</div>
      </div>
    </div>

    <!-- Case card -->
    <div class="case-card">
      <div>
        <div class="case-title">${c.title}</div>
        <div class="case-meta">
          <span class="meta-chip navy">${caseTypeLabel[c.case_type] ?? c.case_type}</span>
          ${c.jurisdiction ? `<span class="meta-chip">${c.jurisdiction}${c.city ? `, ${c.city}` : ''}</span>` : ''}
          <span class="meta-chip">${isRTL ? 'أُنشئت' : 'Opened'}: ${new Date(c.created_at).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
      <div class="health-block">
        <div class="health-label">${isRTL ? 'صحة القضية' : 'Case Health'}</div>
        <div class="health-score">${c.health_score}</div>
        <div class="health-bar"><div class="health-fill"></div></div>
      </div>
    </div>

    <!-- Timeline section -->
    <div class="section-heading">
      ${isRTL ? 'الجدول الزمني' : 'Case Timeline'}
      <span class="event-count">${timelineEvents.length} ${isRTL ? 'حدث' : 'events'}</span>
    </div>

    ${timelineEvents.length === 0
      ? `<p style="text-align:center;color:#9ca3af;padding:32px 0;font-size:12px">
           ${isRTL ? 'لا توجد أحداث بعد' : 'No timeline events yet'}
         </p>`
      : `<table>
          <thead>
            <tr>
              <th>#</th>
              <th>${isRTL ? 'التاريخ والوقت' : 'Date & Time'}</th>
              <th>${isRTL ? 'الحدث' : 'Event'}</th>
              <th>${isRTL ? 'النوع' : 'Type'}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`
    }

    <!-- Footer -->
    <div class="footer">
      <div class="disclaimer">
        ${isRTL
          ? 'وكيلا هي أداة توثيق فحسب ولا تقدم استشارات قانونية. التنبيهات استرشادية ولا تُعدّ أحكاماً قانونية. استشر دائماً محامياً مرخّصاً في جميع الأمور القانونية.'
          : 'Wakeela is a documentation tool only and does not provide legal advice. Alerts are informational and do not constitute legal findings of negligence. Always consult a licensed legal professional.'}
      </div>
      <div class="page-num">wakeela.com · ${isRTL ? 'وكيلة' : 'Wakeela'}</div>
    </div>

  </div>

  <script>
    // Auto-open print dialog after fonts load
    window.addEventListener('load', function() {
      // Small delay to ensure fonts are fully rendered before printing
      setTimeout(function() {
        // Only auto-print if opened as a direct export (not navigated to)
        if (document.referrer || window.opener) {
          window.print();
        }
      }, 600);
    });
  </script>

</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type':        'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="case-timeline-${c.id.slice(0, 8)}.html"`,
      'Cache-Control':       'no-store',
    },
  });
}
