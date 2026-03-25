import { NextResponse }      from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sanitizeText }      from '@/lib/sanitize';

export const runtime     = 'nodejs';
export const maxDuration = 60;

/* ─── Types ─────────────────────────────────────────────────────── */
export interface AIAnalysisResult {
  detected_lang:  'en' | 'ar' | 'mixed';
  case_type:      string;
  case_title:     string;
  summary:        string;
  parties:        { role: string; name: string }[];
  key_dates:      { label: string; date: string; type: 'court' | 'payment' | 'deadline' | 'other' }[];
  obligations:    { party: string; obligation: string }[];
  risks:          { description: string; severity: 'low' | 'medium' | 'high' }[];
  next_actions:   { action: string; urgency: 'immediate' | 'soon' | 'later' }[];
  risk_score:     'low' | 'medium' | 'high';
}

/* ─── System prompt ─────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are a legal document analyzer specializing in GCC jurisdictions (UAE, Saudi Arabia, Kuwait).

Your task: Extract structured information from the document text and return ONLY valid JSON.

RULES:
- Return ONLY the JSON object — no markdown, no explanation, no preamble
- Be accurate and concise
- Detect if document is Arabic, English, or mixed
- case_type must be one of: employment, family, commercial, property, criminal, other
- risk_score: low = routine matter, medium = needs attention, high = urgent legal risk
- key_dates: extract ALL dates mentioned — court dates, payment due dates, deadlines, contract dates
- next_actions: practical steps the client should take (3-5 items max)
- parties: identify all named parties and their roles (client, defendant, creditor, employer, etc.)
- If document is Arabic, write summary/obligations/risks/next_actions in Arabic
- If document is English, write in English

RETURN THIS EXACT JSON STRUCTURE:
{
  "detected_lang": "en" | "ar" | "mixed",
  "case_type": "employment" | "family" | "commercial" | "property" | "criminal" | "other",
  "case_title": "Short descriptive title (max 60 chars)",
  "summary": "2-3 sentence plain-language summary of what this document is and what it means for the user",
  "parties": [{"role": "string", "name": "string"}],
  "key_dates": [{"label": "string", "date": "YYYY-MM-DD", "type": "court|payment|deadline|other"}],
  "obligations": [{"party": "string", "obligation": "string"}],
  "risks": [{"description": "string", "severity": "low|medium|high"}],
  "next_actions": [{"action": "string", "urgency": "immediate|soon|later"}],
  "risk_score": "low" | "medium" | "high"
}`;

/* ─── Text extraction from various file types ───────────────────── */
async function extractText(file: File): Promise<string> {
  const mime = file.type;

  // Plain text / HTML
  if (mime.startsWith('text/')) {
    return await file.text();
  }

  // PDF: use Claude's vision via base64
  if (mime === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `[PDF_BASE64:${base64}]`; // handled in buildMessages
  }

  // Images (scanned docs)
  if (mime.startsWith('image/')) {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `[IMAGE_BASE64:${base64}:${mime}]`;
  }

  // Word docs: extract raw text (basic)
  if (mime.includes('word') || mime.includes('officedocument')) {
    const text = await file.text();
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return await file.text();
}

/* ─── Build Claude messages with vision support ─────────────────── */
function buildMessages(rawText: string, fileName: string): object[] {
  const pdfMatch   = rawText.match(/^\[PDF_BASE64:(.+)\]$/);
  const imageMatch = rawText.match(/^\[IMAGE_BASE64:(.+):(.+)\]$/);

  if (pdfMatch) {
    return [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfMatch[1] } },
        { type: 'text', text: `Analyze this legal document ("${fileName}") and return JSON as instructed.` },
      ],
    }];
  }

  if (imageMatch) {
    return [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageMatch[2], data: imageMatch[1] } },
        { type: 'text', text: `Analyze this legal document image ("${fileName}") and return JSON as instructed.` },
      ],
    }];
  }

  // Plain text
  const truncated = rawText.slice(0, 12000); // ~3k tokens
  return [{
    role: 'user',
    content: `Analyze this legal document ("${fileName}"):\n\n${truncated}\n\nReturn JSON as instructed.`,
  }];
}

/* ─── Route handler ─────────────────────────────────────────────── */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse multipart form
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const files = formData.getAll('files') as File[];
  if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });

  // Validate file sizes (10MB max per file)
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: `File "${f.name}" exceeds 10MB limit` }, { status: 400 });
    }
  }

  // Process each file — merge text for multi-doc support
  const extractedTexts: string[] = [];
  const fileNames: string[] = [];

  for (const file of files) {
    try {
      const text = await extractText(file);
      extractedTexts.push(text);
      fileNames.push(file.name);
    } catch (e) {
      console.error(`[doc-ai] Extract failed for ${file.name}:`, e);
    }
  }

  if (!extractedTexts.length) {
    return NextResponse.json({ error: 'Could not extract text from files' }, { status: 422 });
  }

  // For multi-doc: merge all texts
  const primaryText = extractedTexts[0];
  const primaryName = fileNames[0];
  const allNames    = fileNames.join(', ');

  const messages = buildMessages(primaryText, allNames);

  // Call Claude — use vision for PDFs/images, text otherwise
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!apiRes.ok) {
    const err = await apiRes.text();
    console.error('[doc-ai] Claude error:', err);
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
  }

  const aiData   = await apiRes.json();
  const rawReply = aiData.content?.[0]?.text ?? '';

  // Parse JSON from Claude response
  let analysis: AIAnalysisResult;
  try {
    const jsonStr = rawReply.match(/\{[\s\S]+\}/)?.[0] ?? rawReply;
    analysis = JSON.parse(jsonStr) as AIAnalysisResult;
  } catch {
    console.error('[doc-ai] JSON parse failed:', rawReply.slice(0, 500));
    return NextResponse.json({ error: 'AI returned invalid response' }, { status: 502 });
  }

  // Sanitize all text fields
  analysis.summary    = sanitizeText(analysis.summary    ?? '');
  analysis.case_title = sanitizeText(analysis.case_title ?? '');

  // Persist to document_analyses
  const admin = createAdminClient();
  const { data: savedAnalysis, error: saveErr } = await admin
    .from('document_analyses')
    .insert({
      user_id:         user.id,
      file_name:       primaryName,
      file_size:       files[0].size,
      detected_lang:   analysis.detected_lang   ?? 'en',
      case_type:       analysis.case_type        ?? 'other',
      case_title:      analysis.case_title       ?? '',
      summary:         analysis.summary          ?? '',
      parties:         analysis.parties          ?? [],
      key_dates:       analysis.key_dates        ?? [],
      obligations:     analysis.obligations      ?? [],
      risks:           analysis.risks            ?? [],
      next_actions:    analysis.next_actions     ?? [],
      risk_score:      analysis.risk_score       ?? 'medium',
      raw_ai_response: { reply: rawReply, model: aiData.model },
    })
    .select('id')
    .single();

  if (saveErr) console.error('[doc-ai] Save failed:', saveErr.message);

  return NextResponse.json({
    analysis_id: savedAnalysis?.id ?? null,
    ...analysis,
    files_analyzed: fileNames.length,
  });
}

/* ─── GET — fetch a saved analysis ─────────────────────────────── */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data } = await supabase
    .from('document_analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

/* ─── PATCH — link analysis to a case after creation ───────────── */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { analysis_id, case_id } = await req.json();
  if (!analysis_id || !case_id) return NextResponse.json({ error: 'analysis_id and case_id required' }, { status: 400 });

  await supabase
    .from('document_analyses')
    .update({ case_id, confirmed: true, confirmed_at: new Date().toISOString() })
    .eq('id', analysis_id)
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
