'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { RegionSelector } from '@/components/region-selector';
import { createClient } from '@/lib/supabase/client';
import type { DataRegion } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, User, Briefcase, Eye, EyeOff, Shield } from 'lucide-react';

type Step = 1 | 2 | 3 | 4;
type Role = 'client' | 'lawyer';

interface FormState {
  role:     Role | '';
  region:   DataRegion | null;
  fullName: string;
  email:    string;
  phone:    string;
  password: string;
  consent:  boolean;
}

export default function RegisterPage() {
  const locale   = useLocale();
  const t        = useTranslations('register');
  const tAuth    = useTranslations('auth');
  const router   = useRouter();
  const supabase = createClient();
  const isRTL    = locale === 'ar';

  const [step,    setStep]    = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const [form, setForm] = useState<FormState>({
    role:     '',
    region:   null,
    fullName: '',
    email:    '',
    phone:    '',
    password: '',
    consent:  false,
  });

  // Restore region pre-selected on splash screen
  useEffect(() => {
    const saved = localStorage.getItem('wakeela_region') as DataRegion | null;
    if (saved) setForm((f) => ({ ...f, region: saved }));
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const progressPct = ((step - 1) / 3) * 100;
  const stepLabels  = [t('step1'), t('step2'), t('step3'), t('step4')];

  // ── Step 2 validation ──────────────────────────────────────
  const step2Valid =
    form.fullName.trim().length >= 2 &&
    form.email.includes('@') &&
    form.password.length >= 8 &&
    form.consent;

  // ── Step 1 → 2 ────────────────────────────────────────────
  const goToStep2 = () => {
    if (!form.role || !form.region) {
      setError(isRTL ? 'الرجاء اختيار دورك ومنطقة البيانات' : 'Please select your role and data region');
      return;
    }
    setError('');
    // Save region to localStorage for later use
    localStorage.setItem('wakeela_region', form.region);
    setStep(2);
  };

  // ── Step 2 → 3 (create account) ───────────────────────────
  const handleSignUp = async () => {
    if (!step2Valid) return;
    if (!tAuth) return;
    setLoading(true);
    setError('');

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email:    form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            full_name:   form.fullName.trim(),
            role:        form.role,
            data_region: form.region,
            locale,
            phone:       form.phone.trim() || null,
          },
        },
      });

      if (signUpError) throw signUpError;

      // Log PDPL/GDPR consent immediately
      if (data.user) {
        await supabase.from('consent_logs').insert({
          user_id:      data.user.id,
          consent_type: 'privacy_policy_and_terms',
          version:      '2026-03-21',
          granted:      true,
        });
      }

      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      // Make error messages friendlier
      if (msg.includes('already registered')) {
        setError(isRTL ? 'هذا البريد مسجّل بالفعل. سجّل دخولك.' : 'This email is already registered. Please log in.');
      } else if (msg.includes('Password')) {
        setError(isRTL ? 'كلمة المرور ضعيفة جداً. استخدم 8 أحرف على الأقل.' : 'Password is too weak. Use at least 8 characters.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth ───────────────────────────────────────────
  const handleGoogle = async () => {
    if (!form.region) {
      setError(isRTL ? 'الرجاء اختيار منطقة البيانات أولاً' : 'Please select a data region first');
      return;
    }
    setLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/${locale}/dashboard`,
        queryParams: {
          // Pass region through state so callback can store it
          access_type: 'offline',
        },
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">{tAuth('registerTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tAuth('registerSubtitle')}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {stepLabels.map((label, i) => (
            <span
              key={label}
              className={cn(
                'text-xs font-medium transition-colors',
                step > i ? 'text-[#1A3557] dark:text-blue-400' : 'text-muted-foreground'
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1A3557] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── STEP 1: Role + Region ─────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6 animate-fade-in">
          {/* Role selection */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">
              {isRTL ? 'أنت…' : 'I am a…'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                {
                  role: 'client' as Role,
                  icon: User,
                  label: t('roleClient'),
                  desc:  t('roleClientDesc'),
                },
                {
                  role: 'lawyer' as Role,
                  icon: Briefcase,
                  label: t('roleLawyer'),
                  desc:  t('roleLawyerDesc'),
                },
              ]).map(({ role, icon: Icon, label, desc }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => { update('role', role); setError(''); }}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-start transition-all',
                    form.role === role
                      ? 'border-[#1A3557] bg-[#1A3557]/5 dark:bg-[#1A3557]/20'
                      : 'border-border hover:border-[#1A3557]/40'
                  )}
                >
                  <Icon className="h-5 w-5 text-[#1A3557]" />
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground leading-snug">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Data Region — PRD hard requirement */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">
              {isRTL ? 'منطقة تخزين بياناتك' : 'Your data region'}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {isRTL
                ? 'يُحفظ تخزين بياناتك في المنطقة التي تختارها. لا يمكن تغييرها لاحقاً.'
                : 'Your data is stored in this region. This cannot be changed after signup.'}
            </p>
            <RegionSelector
              value={form.region}
              onChange={(r) => { update('region', r); setError(''); }}
              locale={locale}
            />
          </div>

          {/* Google OAuth option on step 1 */}
          <div className="space-y-3">
            <button
              onClick={goToStep2}
              disabled={!form.role || !form.region}
              className={cn(
                'w-full rounded-xl py-3.5 font-semibold text-white transition-all',
                form.role && form.region
                  ? 'bg-[#1A3557] hover:bg-[#1e4a7a] shadow-sm'
                  : 'bg-[#1A3557]/30 cursor-not-allowed'
              )}
            >
              {isRTL ? 'متابعة' : 'Continue'}
            </button>

            {form.region && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-xs text-muted-foreground">
                      {isRTL ? 'أو' : 'or'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium hover:bg-muted transition disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {tAuth('continueWithGoogle')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 2: Personal details ──────────────────────── */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('fullName')} <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder={t('fullNamePlaceholder')}
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              autoComplete="name"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {tAuth('emailLabel')} <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              placeholder={tAuth('emailPlaceholder')}
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              autoComplete="email"
              dir="ltr"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition"
            />
          </div>

          {/* Phone (optional) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {tAuth('phoneLabel')}{' '}
              <span className="text-muted-foreground text-xs">
                ({isRTL ? 'اختياري — للتنبيهات عبر واتساب' : 'Optional — for WhatsApp alerts'})
              </span>
            </label>
            <input
              type="tel"
              placeholder={tAuth('phonePlaceholder')}
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              autoComplete="tel"
              dir="ltr"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {tAuth('passwordLabel')} <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder={tAuth('passwordPlaceholder')}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                autoComplete="new-password"
                dir="ltr"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 pe-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1A3557]/40 transition"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground"
                aria-label="Toggle password visibility"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {/* Password strength indicator */}
            {form.password.length > 0 && (
              <div className="mt-1.5 flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      form.password.length > i * 3
                        ? form.password.length >= 12 ? 'bg-emerald-500'
                          : form.password.length >= 8  ? 'bg-amber-500'
                          : 'bg-red-400'
                        : 'bg-muted'
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* PDPL/GDPR Consent — mandatory */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => update('consent', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[#1A3557] cursor-pointer"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                {tAuth('consentLabel')}
              </span>
            </label>
          </div>

          {/* Selected region summary */}
          {form.region && (
            <div className="flex items-center gap-2 rounded-lg bg-[#1A3557]/5 px-3 py-2">
              <Shield className="h-3.5 w-3.5 text-[#1A3557] shrink-0" />
              <span className="text-xs text-[#1A3557] font-medium">
                {isRTL
                  ? `بيانات محفوظة في: ${form.region === 'uae' ? 'الإمارات الشمالية' : form.region === 'ksa' ? 'وسط المملكة' : 'أوروبا'}`
                  : `Data region: ${form.region === 'uae' ? 'UAE North' : form.region === 'ksa' ? 'Saudi Central' : 'EU (Frankfurt)'}`}
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setStep(1); setError(''); }}
              className="flex-1 rounded-xl border border-border py-3.5 font-semibold text-foreground hover:bg-muted transition"
            >
              {isRTL ? 'رجوع' : 'Back'}
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={!step2Valid || loading}
              className={cn(
                'flex-[2] rounded-xl py-3.5 font-semibold text-white transition-all',
                step2Valid && !loading
                  ? 'bg-[#1A3557] hover:bg-[#1e4a7a] shadow-sm'
                  : 'bg-[#1A3557]/30 cursor-not-allowed'
              )}
            >
              {loading
                ? (isRTL ? 'جارٍ الإنشاء…' : 'Creating account…')
                : (isRTL ? 'إنشاء الحساب' : 'Create Account')}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Loading state (brief) ────────────────── */}
      {step === 3 && (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <div className="h-10 w-10 rounded-full border-4 border-[#1A3557] border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">
            {isRTL ? 'جارٍ إنشاء حسابك…' : 'Creating your account…'}
          </p>
        </div>
      )}

      {/* ── STEP 4: Success ───────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6 animate-scale-in text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {isRTL ? 'مرحباً بك في وكيلا!' : 'Welcome to Wakeela!'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              {isRTL
                ? 'تم إنشاء حسابك بنجاح. إذا طُلب منك تأكيد بريدك الإلكتروني، تحقق من صندوق الوارد.'
                : 'Your account has been created. Check your email for a confirmation link if required.'}
            </p>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="w-full rounded-xl bg-[#1A3557] py-3.5 font-semibold text-white hover:bg-[#1e4a7a] transition shadow-sm"
          >
            {isRTL ? 'الذهاب إلى لوحة التحكم' : 'Go to Dashboard'}
          </button>

          <button
            onClick={() => router.push('/login')}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition"
          >
            {isRTL ? 'تسجيل الدخول بدلاً من ذلك' : 'Sign in instead'}
          </button>
        </div>
      )}

      {/* Login link */}
      {step < 4 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {tAuth('hasAccount')}{' '}
          <button
            onClick={() => router.push('/login')}
            className="font-semibold text-[#1A3557] dark:text-blue-400 hover:underline"
          >
            {tAuth('login')}
          </button>
        </p>
      )}
    </div>
  );
}
