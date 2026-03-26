import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

// ──────────────────────────────────────────────────────────────────
// /share/[token]  — Public, no auth required
//
// Validates the vault share token and redirects the visitor to a
// short-lived Supabase signed URL for the actual file.
//
// Guards:
//   • Token must exist
//   • expires_at must be in the future
//   • accessed_count must be < max_accesses
//
// On success:
//   • accessed_count incremented
//   • Access logged to audit_logs (IP + token)
//   • Visitor redirected to the signed storage URL (60 s lifetime)
//
// PRD Screen 6 — Evidence Vault time-limited share link
// Gap Analysis Task 4
// ──────────────────────────────────────────────────────────────────

// Signed URL lifetime in seconds — short because the recipient
// gets redirected immediately; we don't want long-lived raw URLs.
const SIGNED_URL_TTL = 60;

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Use admin client — this page is public (no session cookie)
  const sb = createAdminClient();

  // ── 1. Look up the share record ────────────────────────────────
  const { data: share, error: shareErr } = await sb
    .from('vault_shares')
    .select(`
      id,
      token,
      expires_at,
      accessed_count,
      max_accesses,
      document_id,
      documents (
        id,
        file_path,
        file_name
      )
    `)
    .eq('token', token)
    .maybeSingle();

  // ── 2. Validate ────────────────────────────────────────────────
  const now = new Date();

  const isInvalid =
    shareErr ||
    !share ||
    new Date(share.expires_at) <= now ||
    share.accessed_count >= share.max_accesses;

  if (isInvalid) {
    // Render an expired/invalid page — do NOT redirect to login
    return <InvalidSharePage expired={!!share && new Date(share.expires_at) <= now} />;
  }

  // ── 3. Increment accessed_count atomically ────────────────────
  await sb
    .from('vault_shares')
    .update({ accessed_count: share.accessed_count + 1 })
    .eq('id', share.id);

  // ── 4. Log access to audit_logs ───────────────────────────────
  const headerStore = await headers();
  const ipAddress   = headerStore.get('x-forwarded-for')
    ?? headerStore.get('x-real-ip')
    ?? null;

  await sb.from('audit_logs').insert({
    user_id:     null,          // unauthenticated access
    action:      'vault_share_accessed',
    resource:    'vault_shares',
    resource_id: share.id,
    ip_address:  ipAddress,
    metadata: {
      token,
      document_id:   share.document_id,
      accessed_count: share.accessed_count + 1,
      max_accesses:  share.max_accesses,
    },
  });

  // ── 5. Generate a short-lived signed URL for the file ─────────
  const doc = share.documents as { file_path: string; file_name: string } | null;

  if (!doc?.file_path) {
    return <InvalidSharePage expired={false} />;
  }

  const { data: signed, error: signErr } = await sb.storage
    .from('evidence-vault')
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL);

  if (signErr || !signed?.signedUrl) {
    return <InvalidSharePage expired={false} />;
  }

  // ── 6. Redirect to the signed URL ─────────────────────────────
  redirect(signed.signedUrl);
}

// ──────────────────────────────────────────────────────────────────
// Error UI — rendered when the token is invalid or expired
// ──────────────────────────────────────────────────────────────────
function InvalidSharePage({ expired }: { expired: boolean }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Link expired — Wakeela</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .card {
            background: #fff;
            border-radius: 16px;
            border: 1px solid #e2e8f0;
            padding: 40px 36px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,.06);
          }
          .icon { font-size: 48px; margin-bottom: 16px; }
          .brand { font-size: 13px; font-weight: 700; color: #1a3557; letter-spacing: .5px; margin-bottom: 24px; }
          .brand span { color: #c89b3c; }
          h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 8px; }
          p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 24px; }
          .btn {
            display: inline-block;
            background: #1a3557;
            color: #fff;
            text-decoration: none;
            font-weight: 700;
            font-size: 14px;
            padding: 10px 24px;
            border-radius: 10px;
          }
          .disclaimer {
            margin-top: 24px;
            font-size: 11px;
            color: #9ca3af;
            line-height: 1.5;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">{expired ? '⏰' : '🔒'}</div>
          <div className="brand">WAKEELA <span>·</span> وكيلة</div>
          <h1>{expired ? 'Link Expired' : 'Link Invalid'}</h1>
          <p>
            {expired
              ? 'This document share link has expired or reached its maximum number of accesses. Please ask the sender to generate a new link.'
              : 'This share link is invalid or the document is no longer available.'}
          </p>
          <a className="btn" href="https://wakeela.com">
            Visit Wakeela
          </a>
          <p className="disclaimer">
            Wakeela is a documentation tool only and does not provide legal advice.
          </p>
        </div>
      </body>
    </html>
  );
}
