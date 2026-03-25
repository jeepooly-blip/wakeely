import { NextResponse }      from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime     = 'nodejs';
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are the Wakeela Assistant — a warm, professional legal case tracking helper.

YOUR GOAL: Help the user create their first legal case in under 60 seconds.

STRICT RULES:
- Ask ONE question at a time — never two
- Keep replies short (1–3 sentences max)
- Never give legal advice — you track cases, not advise on law
- Be reassuring, not clinical
- When the user is ready, send the exact JSON action on its own line

CONVERSATION FLOW (follow this order exactly):
1. Greet warmly — tell them you will get their case set up in under a minute
2. Ask what type of case: bank/loan, employment, travel/visa, or other
3. Ask if the case is currently active or unresolved
4. Say: "Great — we will track every step and alert you if anything is missed."
5. Say you are ready to create the case now, then send the JSON action

LANGUAGE: Auto-detect from first user message. Arabic → full Arabic. English → full English.

SMART RESPONSES:
- "I don't understand" / "لا أفهم" → Simplify, reassure, repeat question simply
- "stressed" / "worried" / "متوتر" / "قلق" → Brief empathy then continue gently
- Off-topic → Redirect kindly back to case setup

CASE TYPE MAPPING:
- Bank / Loan / قرض / بنك → "commercial"
- Employment / عمل → "employment"
- Travel / Visa / سفر / تأشيرة → "other"
- Other / أخرى → "other"

WHEN READY TO CREATE: Output this JSON alone on the last line, nothing after it:
{"action":"create_case","case_type":"employment"}`;

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { message: string; history?: ChatMessage[] };
  const { message, history = [] } = body;
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const messages: ChatMessage[] = [
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system: SYSTEM_PROMPT, messages }),
  });

  if (!apiRes.ok) {
    console.error('[onboarding/chat] Claude error:', await apiRes.text());
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 });
  }

  const aiData = await apiRes.json();
  const reply  = (aiData.content?.[0]?.text ?? '') as string;

  let action: { action: string; case_type: string } | null = null;
  const jsonMatch = reply.match(/\{"action":"create_case","case_type":"([^"]+)"\}/);
  if (jsonMatch) action = { action: 'create_case', case_type: jsonMatch[1] };

  const admin = createAdminClient();
  const updatedHistory: ChatMessage[] = [
    ...history,
    { role: 'user',      content: message },
    { role: 'assistant', content: reply   },
  ];

  await admin.from('onboarding_sessions').upsert({
    user_id:    user.id,
    messages:   updatedHistory,
    completed:  !!action,
    case_type:  action?.case_type ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (action) {
    await admin.from('users')
      .update({ onboarding_step: 5, onboarding_case_type: action.case_type })
      .eq('id', user.id);
  }

  return NextResponse.json({
    reply:   reply.replace(/\{"action":"[^}]+"\}/, '').trim(),
    action,
    history: updatedHistory,
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('onboarding_sessions').select('messages,completed,case_type')
    .eq('user_id', user.id).maybeSingle();

  return NextResponse.json(data ?? { messages: [], completed: false });
}
