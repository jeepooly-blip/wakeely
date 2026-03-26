'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, User, Bell, Globe, LogOut, Loader2, Check, Shield, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';

interface Profile {
  id: string; email: string; full_name: string; phone?: string;
  locale: string; timezone: string; data_region: string;
  notification_email: boolean; notification_whatsapp: boolean; notification_in_app: boolean;
  quiet_hours_start?: string; quiet_hours_end?: string; subscription_tier: string;
  hijri_calendar?: boolean;
}

interface SettingsFormProps {
  profile: Profile | null;
  locale:  string;
}

export function SettingsForm({ profile, locale }: SettingsFormProps) {
  const isRTL  = locale === 'ar';
  const router = useRouter();
  const supabase = createClient();

  const [fullName,      setFullName]      = useState(profile?.full_name ?? '');
  const [phone,         setPhone]         = useState(profile?.phone ?? '');
  const [notifEmail,    setNotifEmail]    = useState(profile?.notification_email ?? true);
  const [notifWA,       setNotifWA]       = useState(profile?.notification_whatsapp ?? false);
  const [notifInApp,    setNotifInApp]    = useState(profile?.notification_in_app ?? true);
  const [quietStart,    setQuietStart]    = useState(profile?.quiet_hours_start ?? '22:00');
  const [quietEnd,      setQuietEnd]      = useState(profile?.quiet_hours_end ?? '07:00');
  const [hijriCal,      setHijriCal]      = useState(profile?.hijri_calendar ?? false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');

  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const { error: err } = await supabase.from('users').update({
        full_name:              fullName.trim(),
        phone:                  phone.trim() || null,
        notification_email:     notifEmail,
        notification_whatsapp:  notifWA,
        notification_in_app:    notifInApp,
        quiet_hours_start:      quietStart,
        quiet_hours_end:        quietEnd,
        hijri_calendar:         hijriCal,
      }).eq('id', profile?.id ?? '');
      if (err) throw err;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : (isRTL ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center justify-between cursor-pointer py-2">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-200',
          checked ? 'bg-[#1A3557]' : 'bg-muted'
        )}>
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? (isRTL ? 'translate-x-[-20px]' : 'translate-x-5') : (isRTL ? 'translate-x-[-2px]' : 'translate-x-0.5')
        )} />
      </button>
    </label>
  );

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-[#1A3557]" />
          {isRTL ? 'الإعدادات' : 'Settings'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isRTL ? 'إدارة حسابك وتفضيلاتك' : 'Manage your account and preferences'}
        </p>
      </div>

      {/* Profile */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <User className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'معلومات الحساب' : 'Account Information'}
        </h2>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'الاسم الكامل' : 'Full Name'}
          </label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'البريد الإلكتروني' : 'Email'}
          </label>
          <input value={profile?.email ?? ''} disabled dir="ltr"
            className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isRTL ? 'رقم الجوال' : 'Phone Number'}
          </label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+971 50 000 0000" dir="ltr"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {isRTL ? 'المنطقة' : 'Data Region'}
            </label>
            <input value={profile?.data_region?.toUpperCase() ?? ''} disabled
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {isRTL ? 'الخطة' : 'Plan'}
            </label>
            <input value={profile?.subscription_tier ?? 'basic'} disabled
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed capitalize" />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'إعدادات الإشعارات' : 'Notification Settings'}
        </h2>
        <Toggle checked={notifInApp}  onChange={setNotifInApp}  label={isRTL ? 'إشعارات داخل التطبيق' : 'In-app notifications'} />
        <Toggle checked={notifEmail}  onChange={setNotifEmail}  label={isRTL ? 'إشعارات البريد الإلكتروني' : 'Email notifications'} />
        <Toggle checked={notifWA}     onChange={setNotifWA}     label={isRTL ? 'إشعارات واتسآب' : 'WhatsApp notifications'} />

        <div className="pt-3 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {isRTL ? 'ساعات الهدوء (لا إشعارات خلالها)' : 'Quiet hours (no notifications)'}
          </p>
          <div className="flex items-center gap-3" dir="ltr">
            <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none" />
            <span className="text-muted-foreground text-sm">→</span>
            <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Date Preferences */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'تفضيلات التاريخ' : 'Date Preferences'}
        </h2>
        <Toggle
          checked={hijriCal}
          onChange={setHijriCal}
          label={isRTL ? 'عرض التاريخ الهجري (إلى جانب الميلادي)' : 'Show Hijri dates (alongside Gregorian)'}
        />
        {hijriCal && (
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 pb-0.5 ps-1">
            {isRTL
              ? 'مواعيد المحاكم تُعرض دائماً بالتاريخ الميلادي بين قوسين للدقة القانونية.'
              : 'Court dates always include the Gregorian date in parentheses for legal accuracy.'}
          </p>
        )}
      </div>

      {/* Error / Save */}
      {error && (
        <p className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button onClick={save} disabled={saving}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition',
          saved ? 'bg-emerald-500 text-white' : 'bg-[#1A3557] text-white hover:bg-[#1e4a7a] disabled:opacity-50'
        )}>
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" />{isRTL ? 'جارٍ الحفظ…' : 'Saving…'}</>
          : saved ? <><Check className="h-4 w-4" />{isRTL ? 'تم الحفظ!' : 'Saved!'}</>
          : (isRTL ? 'حفظ التغييرات' : 'Save Changes')}
      </button>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <a href={`/${locale}/billing`}
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-[#1A3557]/30 hover:bg-[#1A3557]/5 transition">
          <CreditCard className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'إدارة الاشتراك' : 'Manage Billing'}
        </a>
        <a href={`/${locale}/notifications`}
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-[#1A3557]/30 hover:bg-[#1A3557]/5 transition">
          <Bell className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'الإشعارات' : 'Notifications'}
        </a>
      </div>

      {/* Sign out */}
      <button onClick={signOut}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:text-red-600 hover:border-red-200 transition">
        <LogOut className="h-4 w-4" />
        {isRTL ? 'تسجيل الخروج' : 'Sign Out'}
      </button>

      <p className="text-[10px] text-muted-foreground/50 text-center">
        {isRTL ? 'وكيلا لا تقدم استشارات قانونية. بياناتك مشفّرة ومحمية.' : 'Wakeela does not provide legal advice. Your data is encrypted and protected.'}
      </p>
    </div>
  );
}
