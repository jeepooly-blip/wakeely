import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './src/i18n/routing';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from './src/lib/rate-limit';

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PATHS = [
  '/dashboard', '/cases', '/vault', '/settings',
  '/deadlines', '/alerts', '/notifications', '/billing',
  '/escalation', '/admin', '/lawyer',
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  // ── Rate limiting (Upstash in prod, in-memory fallback in dev) ──
  // Auth routes: 5 req/min — protect against brute-force
  if (pathname.includes('/api/auth/') || pathname.includes('/api/invites/')) {
    const rl = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);
  }
  // AI/voice routes: 10 req/min — cost control
  if (pathname.includes('/api/ai/') || pathname.includes('/api/voice/') || pathname.includes('/api/onboarding/chat')) {
    const rl = await checkRateLimit(`ai:${ip}`, RATE_LIMITS.ai);
    if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);
  }

  // ── STEP 1: Kill the stale NEXT_LOCALE cookie on the REQUEST
  // before next-intl ever reads it. This is the root cause of
  // the language-not-switching bug: intlMiddleware reads REQUEST
  // cookies, so we must delete it BEFORE calling intlMiddleware.
  request.cookies.delete('NEXT_LOCALE');

  // ── STEP 2: Extract locale purely from the URL path
  const pathname      = request.nextUrl.pathname;
  const pathSegments  = pathname.split('/');
  const urlLocale     = ['en', 'ar'].includes(pathSegments[1]) ? pathSegments[1] : 'ar';

  // Force the correct locale header so next-intl reads from URL, not cookie
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-wakeela-locale', urlLocale);

  // ── STEP 3: Run intl middleware with the cleaned request
  const intlResponse = intlMiddleware(request);

  // Kill the cookie on the response too (belt-and-suspenders)
  intlResponse.cookies.delete('NEXT_LOCALE');
  // Set an explicit short-lived locale cookie that next-intl can trust
  // but that expires in 1 second so it can't cause stale state
  // Actually: set nothing — let the URL be the source of truth

  // ── STEP 4: Supabase auth
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return intlResponse;
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll()  { return request.cookies.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pendingCookies.push({ name, value, options });
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const applyAll = (response: NextResponse): NextResponse => {
    // Always kill NEXT_LOCALE
    response.cookies.delete('NEXT_LOCALE');
    // Apply Supabase session cookies
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set({ name, value, ...options });
    });
    return response;
  };

  const pathnameWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';
  const isProtected = PROTECTED_PATHS.some((p) => pathnameWithoutLocale.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL(`/${urlLocale}/login`, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return applyAll(NextResponse.redirect(loginUrl));
  }

  const isAuthPage = ['/login', '/register'].includes(pathnameWithoutLocale);
  if (isAuthPage && user) {
    return applyAll(NextResponse.redirect(new URL(`/${urlLocale}/dashboard`, request.url)));
  }

  return applyAll(intlResponse);
}

export const config = {
  matcher: [
    // Exclude static assets, API routes, and public unauthenticated pages
    // /witness/ and /share/ handle their own HTML — no locale needed
    '/((?!_next|_vercel|api|witness|share|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf|css|js)).*)',
  ],
};
