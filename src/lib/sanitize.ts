/**
 * Input sanitization helpers — OWASP A03:2021 Injection defence
 */

/** Strip dangerous HTML chars for safe text output */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '')          // strip < > to prevent HTML injection
    .replace(/javascript:/gi, '')  // strip js: protocol
    .replace(/on\w+=/gi, '')       // strip event handlers
    .slice(0, 10_000);             // hard length cap
}

/** Validate UUID format */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Safe integer parse with bounds */
export function safeInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(value), 10);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Strip null bytes and control characters from any string */
export function stripControlChars(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1F\x7F]/g, '');
}
