/**
 * Lightweight in-memory rate limiter for Next.js API routes.
 * Per-IP, sliding window. Uses a Map stored in module scope
 * (persists across requests within the same serverless instance).
 * For multi-region production, replace with Redis/Upstash.
 */

interface RateLimitRecord {
  count:      number;
  windowStart: number;
}

const store = new Map<string, RateLimitRecord>();

interface RateLimitOptions {
  limit:      number;   // max requests
  windowMs:   number;   // window in ms
}

export interface RateLimitResult {
  allowed:     boolean;
  remaining:   number;
  resetAfterMs: number;
}

export function checkRateLimit(
  identifier: string,
  opts: RateLimitOptions = { limit: 20, windowMs: 60_000 }
): RateLimitResult {
  const now  = Date.now();
  const rec  = store.get(identifier);

  if (!rec || now - rec.windowStart > opts.windowMs) {
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: opts.limit - 1, resetAfterMs: opts.windowMs };
  }

  if (rec.count >= opts.limit) {
    return {
      allowed:      false,
      remaining:    0,
      resetAfterMs: opts.windowMs - (now - rec.windowStart),
    };
  }

  rec.count++;
  return { allowed: true, remaining: opts.limit - rec.count, resetAfterMs: opts.windowMs - (now - rec.windowStart) };
}

export function rateLimitResponse(resetAfterMs: number) {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status:  429,
    headers: {
      'Content-Type':  'application/json',
      'Retry-After':   String(Math.ceil(resetAfterMs / 1000)),
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': '0',
    },
  });
}
