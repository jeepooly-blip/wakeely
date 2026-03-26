import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Hijri calendar helpers (PRD §7.1) ─────────────────────────
// Uses the native Intl API with calendar:'islamic-umalqura'
// (Saudi standard). Supported in all modern browsers and Node 18+.

/**
 * Formats a date showing the Hijri date, e.g. "23 رمضان 1447 هـ"
 * Falls back to Gregorian if the Intl islamic-umalqura calendar
 * is not supported in the current environment.
 */
export function formatHijri(date: string | Date, locale = 'ar'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-SA-u-ca-islamic-umalqura', {
      day:   'numeric',
      month: 'long',
      year:  'numeric',
    }).format(new Date(date));
  } catch {
    // Fallback: Gregorian
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(date));
  }
}

/**
 * Returns a formatted date string.
 * - If useHijri is false: standard Gregorian.
 * - If useHijri is true: Hijri primary + Gregorian in parentheses.
 * - If isCourt is true and useHijri is true: always appends Gregorian
 *   in parentheses for legal accuracy (PRD §7.1).
 */
export function formatDateSmart(
  date:        string | Date,
  locale:      string,
  useHijri:    boolean,
  isCourt = false
): string {
  const gregFormatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const greg = gregFormatter.format(new Date(date));

  if (!useHijri) return greg;

  const hijri = formatHijri(date, locale);

  // Court dates: Hijri first, Gregorian in parentheses (legal requirement)
  if (isCourt) return `${hijri} (${greg})`;

  return hijri;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatDate(date: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function healthColor(score: number): 'green' | 'amber' | 'red' {
  if (score >= 70) return 'green';
  if (score >= 40) return 'amber';
  return 'red';
}

export function truncate(str: string, length: number): string {
  return str.length > length ? `${str.slice(0, length)}…` : str;
}

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
