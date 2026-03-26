import { NextResponse }       from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { canAccess }         from '@/lib/feature-gate';
import type { SubscriptionTier } from '@/types';

export const runtime     = 'nodejs';
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────
// POST /api/cases/[id]/summary
//
// Generates a structured AI case summary using Claude.
// Pulls last 50 timeline events, all action logs, document labels,
// and upcoming deadlines as context.
//
// Response JSON shape:
//   { id, case_id, generated_at, language, summary_json }
//
// summary_json shape:
//   overview:         string
//   milestones:       [{date, event, significance}]
//   pending_actions:  string[]
//   risks:            string[]
//   recommendations:  string[]
//
// Gated: Premium tier only.
// Cached in case_summaries (re-generates on request).
//
// PRD §3.3 Phase 3 — Gap Analysis Task 12
// ──────────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id: caseId } = await params;
  const url    = new URL(req.url);
  const locale = (url.searchParams.get('locale') ?? 'en') as 'en' | 'ar';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Premium tier gate ─────────────────────────────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;
  if (tier !== 'premium') {
    return NextResponse.json({ error: 'upgrade_required', tier_needed: 'premium' }, { status: 403 });
  }

  // ── Verify case ownership ─────────────────────────────────────
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, title, case_type, jurisdiction, status, health_score, created_at')
    .eq('id', caseId)
    .eq('client_id', user.id)
    .maybeSingle();

  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const sb = createAdminClient();

  // ── Gather context (parallel) ─────────────────────────────────
  const [
    { data: timelineEvents },
    { data: actionLogs },
    { data: documents },
    { data: deadlines },
  ] = await Promise.all([
    sb.from('timeline_events')
      .select('event_type, payload, created_at, is_system_generated')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(50),
    sb.from('action_logs')
      .select('action_type, description, action_date')
      .eq('case_id', caseId)
      .order('action_date', { ascending: false })
      .limit(30),
    sb.from('documents')
      .select('file_name, version, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false }),
    sb.from('deadlines')
      .select('title, due_date, type, status')
      .eq('case_id', caseId)
      .order('due_date', { ascending: true }),
  ]);

  // ── Build prompt context ──────────────────────────────────────
  const isAr = locale === 'ar';
  const lang  = isAr ? 'Arabic' : 'English';

  const timelineText = (timelineEvents ?? [])
    .map((e) => `- [${new Date(e.created_at).toLocaleDateString('en-GB')}] ${e.event_type}${e.payload?.message ? ': ' + String(e.payload.message) : ''}`)
    .join('\n');

  const actionText = (actionLogs ?? [])
    .map((a) => `- [${a.action_date}] ${a.action_type}: ${a.description}`)
    .join('\n');

  const docText = (documents ?? [])
    .map((d) => `- ${d.file_name} (v${d.version}, ${new Date(d.created_at).toLocaleDateString('en-GB')})`)
    .join('\n');

  const deadlineText = (deadlines ?? [])
    .map((d) => `- ${d.title} | ${d.due_date} | ${d.type} | ${d.status}`)
    .join('\n');

  const systemPrompt = `You are a legal case analyst assistant for Wakeela, a client-first legal accountability platform in the GCC (UAE, Saudi Arabia, Kuwait, Jordan).

Your task: Generate a structured case summary in ${lang} based on the data provided.

IMPORTANT RULES:
- Never give legal advice. This is a documentation and summary tool only.
- Be factual and concise. Base analysis only on the data provided.
- Respond ONLY with a valid JSON object, no markdown, no preamble.
- All string values must be in ${lang}.

Required JSON structure:
{
  "overview": "2-3 sentence case overview",
  "milestones": [
    {"date": "YYYY-MM-DD or approximate", "event": "event description", "significance": "why it matters"}
  ],
  "pending_actions": ["action 1", "action 2"],
  "risks": ["risk 1", "risk 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

  const userPrompt = `Case: "${caseRow.title}"
Type: ${caseRow.case_type} | Jurisdiction: ${caseRow.jurisdiction ?? 'Unknown'}
Status: ${caseRow.status} | Health Score: ${caseRow.health_score}/100
Opened: ${new Date(caseRow.created_at).toLocaleDateString('en-GB')}

TIMELINE (recent 50 events):
${timelineText || 'No timeline events'}

LAWYER ACTIONS:
${actionText || 'No lawyer action logs'}

DOCUMENTS IN VAULT:
${docText || 'No documents'}

DEADLINES:
${deadlineText || 'No deadlines'}

Generate the structured case summary.`;

  // ── Call Claude ───────────────────────────────────────────────
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => '');
    console.error('[case-summary] Claude error:', errText);
    return NextResponse.json({ error: 'AI service unavailable. Please try again.' }, { status: 502 });
  }

  const aiData   = await aiRes.json();
  const rawReply = (aiData.content?.[0]?.text ?? '') as string;

  // ── Parse JSON response ───────────────────────────────────────
  let summaryJson: Record<string, unknown>;
  try {
    // Strip any accidental markdown fences
    const cleaned = rawReply.replace(/```json|```/g, '').trim();
    summaryJson = JSON.parse(cleaned);
  } catch {
    console.error('[case-summary] Failed to parse Claude response:', rawReply.slice(0, 200));
    return NextResponse.json({ error: 'AI returned invalid response. Please try again.' }, { status: 502 });
  }

  // ── Upsert into case_summaries ────────────────────────────────
  const { data: saved, error: saveErr } = await sb
    .from('case_summaries')
    .upsert({
      case_id:      caseId,
      user_id:      user.id,
      language:     locale,
      summary_json: summaryJson,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'case_id' })
    .select('id, case_id, generated_at, language, summary_json')
    .single();

  if (saveErr || !saved) {
    console.error('[case-summary] Save error:', saveErr);
    return NextResponse.json({ error: 'Failed to save summary' }, { status: 500 });
  }

  // ── Timeline event ────────────────────────────────────────────
  try {
    await sb
      .from('timeline_events')
      .insert({
        case_id:             caseId,
        actor_id:            user.id,
        event_type:          'ai_summary_generated',
        payload:             { language: locale, summary_id: saved.id },
        is_system_generated: true,
      });
  } catch (error) {
    // Log but don't fail the request
    console.error('[case-summary] Failed to insert timeline event:', error);
  }

  return NextResponse.json(saved);
}

// ──────────────────────────────────────────────────────────────────
// GET /api/cases/[id]/summary — fetch cached summary
// ──────────────────────────────────────────────────────────────────
export async function GET(_req: Request, { params }: Params) {
  const { id: caseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('case_summaries')
    .select('id, case_id, generated_at, language, summary_json')
    .eq('case_id', caseId)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'No summary yet' }, { status: 404 });
  return NextResponse.json(data);
}
