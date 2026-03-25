'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Chrome } from 'lucide-react';

export default function LoginPage() {
  const locale   = useLocale();
  const t        = useTranslations('auth');
  const router   = useRouter();
  const supabase = createClient();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(
            new URLSearchParams(window.location.search).get('redirectTo') ?? `/${locale}/dashboard`
          )}`,
        },
    });
  };

  const isRTL = locale === 'ar';

  return (
    <div className="animate-fade-in">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">{t('loginTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('loginSubtitle')}</p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-background py-3.5 text-sm font-semibold hover:bg-muted transition mb-6"
      >
        <Chrome className="h-4 w-4" />
        {t('continueWithGoogle')}
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-xs text-muted-foreground">
            {isRTL ? '\u0623\u0648' : 'or'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">{t('emailLabel')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            required
            dir="ltr"
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-foreground">{t('passwordLabel')}</label>
            <Link href="/forgot-password" className="text-xs text-[#1A3557] hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              required
              dir="ltr"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 pe-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className={cn(
            'w-full rounded-xl py-3.5 font-semibold text-white transition-all',
            !loading && email && password
              ? 'bg-[#1A3557] hover:bg-[#1e4a7a]'
              : 'bg-[#1A3557]/30 cursor-not-allowed'
          )}
        >
          {loading ? '\u2026' : t('login')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-[#1A3557] hover:underline">
          {isRTL ? '\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628' : 'Create account'}
        </Link>
      </p>
    </div>
  );
}
