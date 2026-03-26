/**
 * Production-grade rate limiter using Upstash Redis sliding window.
 *
 * Falls back to the original in-memory implementation when
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set
 * (local dev, CI, staging without Redis).
 *
 * PRD: multi-region deployment requires Redis-backed rate limiting.
 * Gap Analysis Task 9.
 *
 * Required env vars (add to Vercel + .env.local):
 *   UPSTASH_REDIS_REST_URL=https://...upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=AX...
 *
 * Limiters (per PRD §7.3):
 *   auth   → 5  req / 60 s   (login, register, OTP)
 *   api    → 60 req / 60 s   (general API routes)
 *   ai     → 10 req / 60 s   (AI + voice routes)
 */

// ── Shared result type (unchanged — callers depend on this) ───────
export interface RateLimitResult {
  allowed:      boolean;
  remaining:    number;
  resetAfterMs: number;
}

// ── Rate limit presets ────────────────────────────────────────────
export const RATE_LIMITS = {
  auth: { limit: 5,  windowMs: 60_000 },
  api:  { limit: 60, windowMs: 60_000 },
  ai:   { limit: 10, windowMs: 60_000 },
} as const;

// ── In-memory fallback (unchanged logic) ─────────────────────────
interface MemRecord { count: number; windowStart: number }
const memStore = new Map<string, MemRecord>();

function checkMemory(
  identifier: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const rec = memStore.get(identifier);

  if (!rec || now - rec.windowStart > opts.windowMs) {
    memStore.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: opts.limit - 1, resetAfterMs: opts.windowMs };
  }
  if (rec.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAfterMs: opts.windowMs - (now - rec.windowStart) };
  }
  rec.count++;
  return { allowed: true, remaining: opts.limit - rec.count, resetAfterMs: opts.windowMs - (now - rec.windowStart) };
}

// ── Upstash sliding window via REST API ───────────────────────────
// We call Upstash directly via fetch to avoid an npm install requirement.
// The INCR + EXPIRE pattern gives us a sliding window approximation.
async function checkUpstash(
  identifier: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const key   = `rl:${identifier}`;
  const windowSec = Math.ceil(opts.windowMs / 1000);

  try {
    // Pipeline: INCR key, EXPIRE key windowSec (only set if new)
    const resp = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, windowSec, 'NX'], // NX = only set if not already set
      ]),
    });

    if (!resp.ok) throw new Error(`Upstash HTTP ${resp.status}`);

    const results = await resp.json() as [{ result: number }, { result: number }];
    const count   = results[0].result;

    const allowed    = count <= opts.limit;
    const remaining  = Math.max(0, opts.limit - count);
    // TTL approximation — actual TTL from Redis would require a separate call
    const resetAfterMs = opts.windowMs;

    return { allowed, remaining, resetAfterMs };
  } catch (err) {
    // If Upstash is unreachable, fail open with in-memory fallback
    console.error('[RateLimit] Upstash error, falling back to in-memory:', err);
    return checkMemory(identifier, opts);
  }
}

// ── Public API ────────────────────────────────────────────────────

const upstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Check rate limit for an identifier.
 * Async — await this in your route handlers.
 */
export async function checkRateLimit(
  identifier: string,
  opts: { limit: number; windowMs: number } = { limit: 20, windowMs: 60_000 }
): Promise<RateLimitResult> {
  if (upstashConfigured) {
    return checkUpstash(identifier, opts);
  }
  return checkMemory(identifier, opts);
}

/** Build a 429 Response with standard headers */
export function rateLimitResponse(resetAfterMs: number): Response {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status:  429,
    headers: {
      'Content-Type':          'application/json',
      'Retry-After':           String(Math.ceil(resetAfterMs / 1000)),
      'X-RateLimit-Limit':     '20',
      'X-RateLimit-Remaining': '0',
    },
  });
}

