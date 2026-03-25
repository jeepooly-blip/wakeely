import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase OAuth callback.
 * 
 * Flow:
 *   1. Google OAuth → Supabase → /api/auth/callback?code=...&next=/ar/invite?token=...
 *   2. We exchange the code, then redirect to `next` (which preserves the
 *      original redirectTo, including the invite token).
 *
 * The `next` param is set by the login page when it builds the OAuth URL:
 *   redirectTo: `${origin}/api/auth/callback?next=${encodedRedirectTo}`
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // `next` carries the post-auth destination, e.g. /ar/invite?token=abc123
  // Fall back to /ar/dashboard if not set.
  const next   = searchParams.get('next') ?? '/ar/dashboard';
  const locale = next.match(/^\/(en|ar)/)?.[1] ?? 'ar';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to the original destination (invite page, dashboard, etc.)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=oauth_failed`);
}
