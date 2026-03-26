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

  // ── Rate limiting (only on relevant routes) ───────────────────
  if (pathname.includes('/api/auth/') || pathname.includes('/api/invites/')) {
    const rl = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);
  }
  if (pathname.includes('/api/ai/') || pathname.includes('/api/voice/') || pathname.includes('/api/onboarding/chat')) {
    const rl = await checkRateLimit(`ai:${ip}`, RATE_LIMITS.ai);
    if (!rl.allowed) return rateLimitResponse(rl.resetAfterMs);
  }

  // ── STEP 1: Kill stale NEXT_LOCALE cookie ────────────────────
  request.cookies.delete('NEXT_LOCALE');

  // ── STEP 2: Extract locale from URL ──────────────────────────
  const pathSegments = pathname.split('/');
  const urlLocale    = ['en', 'ar'].includes(pathSegments[1]) ? pathSegments[1] : 'ar';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-wakeela-locale', urlLocale);

  // ── STEP 3: Run intl middleware ───────────────────────────────
  const intlResponse = intlMiddleware(request);
  intlResponse.cookies.delete('NEXT_LOCALE');

  // ── STEP 4: Supabase auth — ONLY for protected routes ────────
  // Skip the Supabase network call entirely for public pages.
  // This is the single biggest middleware performance win.
  const pathnameWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';
  const isProtected = PROTECTED_PATHS.some((p) => pathnameWithoutLocale.startsWith(p));
  const isAuthPage  = ['/login', '/register'].includes(pathnameWithoutLocale);

  // If it's neither protected nor an auth page, skip auth check
  if (!isProtected && !isAuthPage) {
    intlResponse.cookies.delete('NEXT_LOCALE');
    return intlResponse;
  }

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return intlResponse;

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
    response.cookies.delete('NEXT_LOCALE');
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set({ name, value, ...options });
    });
    return response;
  };

  if (isProtected && !user) {
    const loginUrl = new URL(`/${urlLocale}/login`, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return applyAll(NextResponse.redirect(loginUrl));
  }

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
