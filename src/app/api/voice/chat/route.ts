import { NextResponse }      from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { SubscriptionTier } from '@/types';

export const runtime     = 'nodejs';
export const maxDuration = 30;

/* ─── Daily limits per tier ─────────────────────────────────────── */
const DAILY_LIMITS: Record<SubscriptionTier, number> = {
  basic:   5,
  pro:     50,
  premium: Infinity,
};

/* ─── Voice advisor system prompt ───────────────────────────────── */
const SYSTEM_PROMPT = `You are the Wakeela Voice Legal Advisor — a calm, professional, and empathetic legal case tracking assistant for GCC clients.

CORE RULES:
- Respond in the SAME language the user spoke (Arabic → Arabic, English → English)
- Keep responses SHORT and SPOKEN — max 3 sentences, no bullet points, no headers
- Sound natural when read aloud — avoid lists, markdown, or technical jargon
- Never give specific legal advice — guide on case tracking and next steps only
- Be warm and reassuring — many users are stressed about their legal situations
- If the user seems stressed or worried → acknowledge it briefly, then guide gently

WHAT YOU CAN HELP WITH:
- Explaining what information to gather for a case
- Clarifying deadlines and document requirements
- Suggesting whether to contact a lawyer or authority
- Guiding them to use Wakeela features (upload docs, set deadlines, invite lawyer)
- General case management guidance for UAE, KSA, and Kuwait

WHAT YOU CANNOT DO:
- Give specific legal rulings or opinions
- Predict legal outcomes
- Replace a qualified lawyer

EMOTION DETECTION:
- Words like "stressed" / "worried" / "مرهق" / "قلق" / "خايف" → Start with: "أفهم أن هذا صعب، أنا هنا لمساعدتك خطوة بخطوة." or "I understand this is stressful — I'm here to help you step by step."
- Confused → Simplify, use an analogy
- Angry → Stay calm, acknowledge, redirect to solutions

VOICE-FRIENDLY FORMATTING:
- Use natural spoken language, not written document style
- Spell out numbers: "seven days" not "7 days" (except in Arabic where numerals are fine)
- No asterisks, dashes, or markdown — responses go directly to speech synthesis`;

/* ─── Route handler ─────────────────────────────────────────────── */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    transcript:  string;
    history?:    { role: 'user' | 'assistant'; content: string }[];
    case_id?:    string;
    case_context?: string;
  };

  const { transcript, history = [], case_id, case_context } = body;

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 });
  }

  // ── Fetch user profile for tier + daily limit check ───────────
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('subscription_tier, locale')
    .eq('id', user.id)
    .maybeSingle();

  const tier  = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;
  const limit = DAILY_LIMITS[tier];

  // ── Daily usage check ─────────────────────────────────────────
  const { data: usageCount } = await admin.rpc('voice_queries_today' as never, { p_user_id: user.id });
  const todayCount = (usageCount as number) ?? 0;

  if (todayCount >= limit) {
    return NextResponse.json({
      error:       'daily_limit_reached',
      used:        todayCount,
      limit,
      tier,
    }, { status: 429 });
  }

  // ── Detect language from transcript ───────────────────────────
  const arabicChars = (transcript.match(/[\u0600-\u06FF]/g) ?? []).length;
  const detectedLang = arabicChars > transcript.length * 0.2 ? 'ar' : 'en';

  // ── Build messages with case context if available ─────────────
  const contextNote = case_context
    ? `\n\nCASE CONTEXT: The user is asking about this case: ${case_context}`
    : '';

  const messages = [
    ...history.slice(-8),  // last 4 exchanges
    { role: 'user' as const, content: transcript },
  ];

  const systemWithContext = SYSTEM_PROMPT + contextNote;

  // ── Call Claude ───────────────────────────────────────────────
  const startTime = Date.now();

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 200,   // keep short for voice
      system:     systemWithContext,
      messages,
    }),
  });

  const duration = Date.now() - startTime;

  if (!apiRes.ok) {
    console.error('[voice/chat] Claude error:', await apiRes.text());
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 });
  }

  const aiData    = await apiRes.json();
  const response  = (aiData.content?.[0]?.text ?? '').trim();
  const tokensUsed = aiData.usage?.input_tokens + aiData.usage?.output_tokens;

  // ── Log session to DB ─────────────────────────────────────────
  await admin.from('voice_sessions').insert({
    user_id:       user.id,
    case_id:       case_id ?? null,
    transcript:    transcript.slice(0, 2000),
    ai_response:   response,
    detected_lang: detectedLang,
    duration_ms:   duration,
    tokens_used:   tokensUsed,
  });

  return NextResponse.json({
    response,
    detected_lang:   detectedLang,
    queries_used:    todayCount + 1,
    queries_limit:   limit,
    queries_remaining: Math.max(0, limit - todayCount - 1),
  });
}
