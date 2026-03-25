import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings/settings-form';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;          // ✅ locale from URL
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from('users')
    .select('id,email,full_name,phone,locale,timezone,data_region,notification_email,notification_whatsapp,notification_in_app,quiet_hours_start,quiet_hours_end,subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  return <SettingsForm profile={profile} locale={locale} />;
}
