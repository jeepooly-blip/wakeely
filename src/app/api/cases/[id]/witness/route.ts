import { NextResponse }    from 'next/server';
import { createClient }   from '@/lib/supabase/server';
import { canAccess }      from '@/lib/feature-gate';
import type { SubscriptionTier } from '@/types';

// ──────────────────────────────────────────────────────────────────
// POST /api/cases/[id]/witness
//   Create a new witness link for a case. Pro/Premium only.
//   Body: { label?, expiry_hours?, max_views? }
//
// GET  /api/cases/[id]/witness
//   List all non-expired, non-revoked witness links for a case.
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id: caseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Tier gate — Pro/Premium only
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;
  if (!canAccess(tier, 'vault')) {                      // vault === pro+ feature
    return NextResponse.json({ error: 'upgrade_required' }, { status: 403 });
  }

  // Verify case ownership
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, title')
    .eq('id', caseId)
    .eq('client_id', user.id)
    .maybeSingle();

  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    label?:        string;
    expiry_hours?: number;
    max_views?:    number;
  };

  const expiryHours = Math.min(Math.max(Number(body.expiry_hours) || 72, 1), 720);  // 1h – 30d
  const maxViews    = Math.min(Math.max(Number(body.max_views) || 10, 1), 100);

  const { data: link, error } = await supabase
    .from('witness_links')
    .insert({
      case_id:   caseId,
      created_by: user.id,
      label:     body.label ?? null,
      expires_at: new Date(Date.now() + expiryHours * 3_600_000).toISOString(),
      max_views: maxViews,
    })
    .select('id, token, expires_at, max_views, label, created_at')
    .single();

  if (error || !link) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create link' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  return NextResponse.json({
    ...link,
    witness_url: `${appUrl}/witness/${link.token}`,
  }, { status: 201 });}

export async function GET(_req: Request, { params }: Params) {
  const { id: caseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: links } = await supabase
    .from('witness_links')
    .select('id, token, label, expires_at, max_views, view_count, is_revoked, created_at')
    .eq('case_id', caseId)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakeela.com';
  return NextResponse.json(
    (links ?? []).map((l) => ({ ...l, witness_url: `${appUrl}/witness/${l.token}` }))
  );
}
