import { createAdminClient } from '@/lib/supabase/server';
import { headers }           from 'next/headers';

// ──────────────────────────────────────────────────────────────────
// /witness/[token]  — Public page, no authentication required.
//
// Renders a read-only, watermarked case view for a trusted third
// party (mediator, family member, etc.).
//
// Placed OUTSIDE the [locale] routing tree (same as /share/[token])
// so it can return its own <html> structure without conflicting
// with the locale layout.
//
// Guards: token must exist, not expired, not revoked, under max_views.
// On valid access: increments view_count, logs to audit_logs with IP.
//
// PRD §3.3 Phase 3 — Gap Analysis Task 11
// ──────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ token: string }> };

export default async function WitnessPage({ params }: PageProps) {
  const { token } = await params;
  const sb  = createAdminClient();
  const now = new Date();

  // Resolve the witness link
  const { data: link } = await sb
    .from('witness_links')
    .select(`
      id, token, case_id, label, expires_at,
      max_views, view_count, is_revoked,
      cases(
        id, title, case_type, jurisdiction, city,
        status, health_score, created_at,
        timeline_events(id, event_type, created_at, is_system_generated),
        deadlines(id, title, due_date, type, status),
        documents(id, file_name, version, created_at)
      )
    `)
    .eq('token', token)
    .maybeSingle();

  // ── Validate ────────────────────────────────────────────────────
  const invalid =
    !link ||
    link.is_revoked ||
    new Date(link.expires_at) <= now ||
    link.view_count >= link.max_views;

  if (invalid) {
    return <InvalidPage expired={!!link && !link.is_revoked && new Date(link.expires_at) <= now} />;
  }

  // ── Increment view_count + log access ──────────────────────────
  await sb
    .from('witness_links')
    .update({ view_count: link.view_count + 1 })
    .eq('id', link.id);

  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? headerStore.get('x-real-ip')
    ?? null;

 try {
  await supabase
    .from('audit_logs')
    .insert({
      case_id:   caseId,
      actor_type: 'witness',
      actor_id:   witnessId,
      action:     'viewed_document',
      metadata:   {
        document_id: docId,
        label:       link.label,
      },
    });
} catch (error) {
  // ignore
}
  }).catch(() => {});

  type CaseData = {
    id: string; title: string; case_type: string;
    jurisdiction?: string; city?: string;
    status: string; health_score: number; created_at: string;
    timeline_events: Array<{ id: string; event_type: string; created_at: string }>;
    deadlines:       Array<{ id: string; title: string; due_date: string; type: string; status: string }>;
    documents:       Array<{ id: string; file_name: string; version: number; created_at: string }>;
  };

  const caseRow = link.cases as unknown as CaseData | null;
  if (!caseRow) return <InvalidPage expired={false} />;

  const timelineEvents = [...(caseRow.timeline_events ?? [])]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const deadlines = caseRow.deadlines ?? [];
  const documents = caseRow.documents ?? [];

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const healthColor = caseRow.health_score >= 75 ? '#10b981'
    : caseRow.health_score >= 50 ? '#f59e0b' : '#ef4444';

  const caseTypeLabels: Record<string, string> = {
    employment: 'Employment', family: 'Family', commercial: 'Commercial',
    property: 'Property', criminal: 'Criminal', other: 'Other',
  };

  const eventTypeLabel: Record<string, string> = {
    case_created: 'Case Created', document_uploaded: 'Document Uploaded',
    deadline_added: 'Deadline Added', deadline_completed: 'Deadline Completed',
    action_logged: 'Lawyer Activity', lawyer_joined: 'Lawyer Joined',
    nde_flag: 'Alert Triggered', nde_flag_resolved: 'Alert Resolved',
    invoice_issued: 'Invoice Issued', invoice_paid: 'Invoice Paid',
    ai_summary_generated: 'AI Summary Generated',
  };

  const expiresIn = Math.ceil((new Date(link.expires_at).getTime() - now.getTime()) / 3_600_000);
  const viewsLeft = link.max_views - link.view_count - 1;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Wakeela Witness View — {caseRow.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', Arial, sans-serif; background: #f8fafc; color: #111827; font-size: 13px; line-height: 1.5; }
          .page { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
          body::before {
            content: 'WAKEELA WITNESS VIEW — READ ONLY';
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 38px; font-weight: 900; color: rgba(26,53,87,.04);
            white-space: nowrap; pointer-events: none; z-index: 0;
          }
          .top-bar { background: #1A3557; color: #fff; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
          .brand { font-size: 16px; font-weight: 900; }
          .brand span { color: #C89B3C; }
          .badge { background: #C89B3C; color: #fff; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; }
          .expiry-bar { background: #fffbeb; border-bottom: 1px solid #fde68a; padding: 8px 20px; font-size: 11px; color: #92400e; }
          .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; position: relative; z-index: 1; }
          .type-chip { display: inline-block; background: #1A3557; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; margin-bottom: 8px; }
          .case-title { font-size: 18px; font-weight: 900; color: #1A3557; margin-bottom: 6px; }
          .meta { font-size: 11px; color: #6b7280; display: flex; gap: 12px; flex-wrap: wrap; }
          .health-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
          .health-bar { flex: 1; height: 6px; background: #e2e8f0; border-radius: 10px; overflow: hidden; }
          .health-fill { height: 100%; border-radius: 10px; background: ${healthColor}; width: ${caseRow.health_score}%; }
          .health-score { font-size: 13px; font-weight: 900; color: ${healthColor}; }
          .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 16px; overflow: hidden; position: relative; z-index: 1; }
          .section-head { padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
          .count { font-size: 10px; background: #e2e8f0; color: #374151; padding: 1px 7px; border-radius: 20px; }
          .row { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; display: flex; gap: 10px; align-items: flex-start; }
          .row:last-child { border-bottom: none; }
          .dot { width: 8px; height: 8px; border-radius: 50%; background: #1A3557; flex-shrink: 0; margin-top: 4px; }
          .label { font-weight: 600; color: #111827; font-size: 12px; }
          .sub { font-size: 10px; color: #9ca3af; margin-top: 1px; }
          .dl-type { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 20px; flex-shrink: 0; }
          .court { background: #dbeafe; color: #1d4ed8; }
          .submission { background: #ccfbf1; color: #0f766e; }
          .internal { background: #fef9c3; color: #854d0e; }
          .no-dl { background: #f9fafb; border-radius: 8px; padding: 1px 6px; font-size: 9px; color: #9ca3af; }
          .empty { padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
          .footer { text-align: center; font-size: 10px; color: #9ca3af; padding: 20px 0 10px; line-height: 1.7; }
        `}</style>
      </head>
      <body>
        <div className="top-bar">
          <div className="brand">WAKEELA <span>·</span> وكيلة</div>
          <span className="badge">👁 Witness View</span>
        </div>

        <div className="expiry-bar">
          ⚠️ Read-only witness view{link.label ? ` — ${link.label}` : ''}.
          {expiresIn > 0 && ` Expires in ${expiresIn}h.`}
          {viewsLeft > 0 && ` ${viewsLeft} view${viewsLeft !== 1 ? 's' : ''} remaining.`}
          &nbsp;No data can be downloaded or modified.
        </div>

        <div className="page">
          {/* Case info */}
          <div className="card">
            <span className="type-chip">{caseTypeLabels[caseRow.case_type] ?? caseRow.case_type}</span>
            <div className="case-title">{caseRow.title}</div>
            <div className="meta">
              {caseRow.jurisdiction && <span>⚖️ {caseRow.jurisdiction}{caseRow.city ? `, ${caseRow.city}` : ''}</span>}
              <span>📅 Opened {fmtDate(caseRow.created_at)}</span>
              <span>📌 {caseRow.status.toUpperCase()}</span>
            </div>
            <div className="health-row">
              <span style={{fontSize:'10px',color:'#6b7280'}}>Case Health</span>
              <div className="health-bar"><div className="health-fill" /></div>
              <span className="health-score">{caseRow.health_score}/100</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="section">
            <div className="section-head">
              <span className="section-title">Case Timeline</span>
              <span className="count">{timelineEvents.length} events</span>
            </div>
            {timelineEvents.length === 0
              ? <div className="empty">No events yet</div>
              : timelineEvents.map((ev) => (
                <div key={ev.id} className="row">
                  <div className="dot" />
                  <div>
                    <div className="label">{eventTypeLabel[ev.event_type] ?? ev.event_type.replace(/_/g, ' ')}</div>
                    <div className="sub">{fmtDate(ev.created_at)}</div>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Deadlines */}
          <div className="section">
            <div className="section-head">
              <span className="section-title">Deadlines</span>
              <span className="count">{deadlines.length}</span>
            </div>
            {deadlines.length === 0
              ? <div className="empty">No deadlines</div>
              : deadlines.map((dl) => (
                <div key={dl.id} className="row" style={{alignItems:'center',gap:'12px'}}>
                  <span className={`dl-type ${dl.type}`}>{dl.type}</span>
                  <span className="label" style={{flex:1}}>{dl.title}</span>
                  <span className="sub" style={{whiteSpace:'nowrap',color: dl.status==='missed'?'#ef4444':dl.status==='completed'?'#10b981':'#6b7280'}}>
                    {fmtDate(dl.due_date)} · {dl.status}
                  </span>
                </div>
              ))
            }
          </div>

          {/* Documents — names only, no download */}
          <div className="section">
            <div className="section-head">
              <span className="section-title">Evidence Vault</span>
              <span className="count">{documents.length} files</span>
            </div>
            {documents.length === 0
              ? <div className="empty">No documents</div>
              : documents.map((doc) => (
                <div key={doc.id} className="row" style={{alignItems:'center'}}>
                  <span style={{fontSize:'16px',flexShrink:0}}>📄</span>
                  <div style={{flex:1}}>
                    <div className="label">{doc.file_name}</div>
                    <div className="sub">v{doc.version} · {fmtDate(doc.created_at)}</div>
                  </div>
                  <span className="no-dl">No download</span>
                </div>
              ))
            }
          </div>

          <div className="footer">
            <strong style={{color:'#6b7280'}}>Wakeela Witness View</strong> — Read-only access · No legal advice provided<br/>
            This view was shared by the case owner and expires automatically.<br/>
            <a href="https://wakeela.com" style={{color:'#1A3557',fontWeight:700}}>wakeela.com</a>
          </div>
        </div>
      </body>
    </html>
  );
}

function InvalidPage({ expired }: { expired: boolean }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Link Invalid — Wakeela</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
          .card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px 36px; max-width: 380px; width: 100%; text-align: center; }
          .icon { font-size: 48px; margin-bottom: 16px; }
          .brand { font-size: 13px; font-weight: 700; color: #1A3557; margin-bottom: 20px; }
          h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 8px; }
          p { font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 24px; }
          a { display: inline-block; background: #1A3557; color: #fff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 10px; }
          .disc { margin-top: 20px; font-size: 10px; color: #9ca3af; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">{expired ? '⏰' : '🔒'}</div>
          <div className="brand">WAKEELA · وكيلة</div>
          <h1>{expired ? 'Link Expired' : 'Link Invalid'}</h1>
          <p>
            {expired
              ? 'This witness link has expired or reached its maximum views. Ask the case owner to generate a new one.'
              : 'This witness link is invalid, revoked, or no longer available.'}
          </p>
          <a href="https://wakeela.com">Visit Wakeela</a>
          <p className="disc">Wakeela does not provide legal advice.</p>
        </div>
      </body>
    </html>
  );
}
