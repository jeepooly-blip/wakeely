import { redirect }     from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Link }         from '@/i18n/navigation';
import dynamic          from 'next/dynamic';
import {
  Mic, Sparkles, ArrowLeft, ArrowRight,
  MessageSquare, Clock, Globe,
} from 'lucide-react';
import type { SubscriptionTier } from '@/types';

const VoiceAdvisor = dynamic(() => import('@/components/voice/voice-advisor').then(m => ({ default: m.VoiceAdvisor })));

export default async function VoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;          // ✅ locale from URL
  const isRTL    = locale === 'ar';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Get user profile + active cases for context selector
  const [{ data: profile }, { data: cases }] = await Promise.all([
    supabase.from('users').select('full_name, subscription_tier').eq('id', user.id).maybeSingle(),
    supabase.from('cases').select('id, title, case_type').eq('client_id', user.id)
      .eq('status', 'active').order('updated_at', { ascending: false }).limit(8),
  ]);

  const tier = (profile?.subscription_tier ?? 'basic') as SubscriptionTier;
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const dailyLimit = tier === 'premium' ? '∞' : tier === 'pro' ? '50' : '5';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Back */}
      <Link href={`/${locale}/dashboard`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
        <BackIcon className="h-4 w-4" />
        {isRTL ? 'لوحة التحكم' : 'Dashboard'}
      </Link>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1A3557] to-[#0E7490] shadow-md">
            <Mic className="h-5 w-5 text-[#C89B3C]" />
          </div>
          {isRTL ? 'المستشار القانوني الصوتي' : 'Voice Legal Advisor'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {isRTL
            ? 'تحدث عن قضيتك وسأساعدك فوراً — بالعربية أو الإنجليزية'
            : 'Speak about your case and get instant guidance — Arabic or English'}
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: Globe,        en: 'Arabic + English',       ar: 'عربي + إنجليزي'        },
          { icon: Mic,          en: 'Speech recognition',     ar: 'تعرف على الصوت'        },
          { icon: MessageSquare, en: 'Spoken AI responses',   ar: 'ردود صوتية ذكية'        },
          { icon: Clock,        en: `${dailyLimit} queries/day`, ar: `${dailyLimit} استفسار يومياً` },
          { icon: Sparkles,     en: 'Emotion-aware',          ar: 'يتعامل مع مشاعرك'     },
        ].map(({ icon: Icon, en, ar }) => (
          <span key={en} className="inline-flex items-center gap-1.5 rounded-full bg-[#1A3557]/8 dark:bg-[#1A3557]/20 px-3 py-1.5 text-xs font-semibold text-[#1A3557] dark:text-blue-300">
            <Icon className="h-3 w-3" />
            {isRTL ? ar : en}
          </span>
        ))}
      </div>

      {/* Main grid: advisor + case selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* Voice advisor — takes 2 cols */}
        <div className="lg:col-span-2">
          <VoiceAdvisor locale={locale} embedded={true} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Active cases — click to set context */}
          {cases && cases.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-xs font-bold text-foreground">
                  {isRTL ? 'تحدث عن قضية محددة' : 'Talk about a specific case'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {isRTL ? 'اختر قضية لإضافة السياق' : 'Select a case for context'}
                </p>
              </div>
              <div className="divide-y divide-border">
                {cases.map((c) => (
                  <Link key={c.id}
                    href={`/${locale}/voice?case=${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-xs hover:bg-muted/50 transition group">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1A3557]/10 text-sm">
                      {c.case_type === 'employment' ? '💼' : c.case_type === 'commercial' ? '🏢' : c.case_type === 'family' ? '👨‍👩‍👧' : '📋'}
                    </div>
                    <span className="flex-1 truncate font-medium text-foreground group-hover:text-[#1A3557]">
                      {c.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Example prompts */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <p className="text-xs font-bold text-foreground">
                {isRTL ? 'أمثلة على ما يمكنك قوله' : 'Example things to say'}
              </p>
            </div>
            <div className="p-4 space-y-2">
              {(isRTL ? [
                'أنا عندي مشكلة مع قرض بنكي',
                'هل في خطر إذا تأخرت في الدفع؟',
                'ما هي الخطوات القادمة في قضيتي؟',
                'أنا قلق جداً بخصوص الجلسة القادمة',
              ] : [
                'I have a loan issue with my bank',
                'What should I do before the court date?',
                'Am I at risk if I miss the payment deadline?',
                'I\'m stressed about my employment case',
              ]).map((prompt) => (
                <div key={prompt} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-0.5 text-[#C89B3C]">›</span>
                  <span dir={isRTL ? 'rtl' : 'ltr'}>"{prompt}"</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upgrade CTA for basic */}
          {tier === 'basic' && (
            <div className="rounded-2xl border border-[#C89B3C]/30 bg-[#C89B3C]/5 p-4">
              <p className="text-xs font-bold text-foreground mb-1">
                {isRTL ? 'ترقية لمزيد من الاستفسارات' : 'Upgrade for more queries'}
              </p>
              <p className="text-[10px] text-muted-foreground mb-3">
                {isRTL ? 'الخطة المجانية: 5 استفسارات يومياً. Pro: 50. Premium: غير محدود.' : 'Free: 5/day · Pro: 50/day · Premium: unlimited'}
              </p>
              <Link href={`/${locale}/billing`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#C89B3C] px-4 py-2 text-xs font-bold text-[#1A3557] hover:bg-[#E8B84B] transition">
                <Sparkles className="h-3 w-3" />
                {isRTL ? 'ترقية الآن' : 'Upgrade Now'}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <p className="text-xs font-bold text-foreground mb-4">
          {isRTL ? 'كيف يعمل' : 'How it works'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { step: '1', icon: '🎙️', en: 'Tap mic & speak', ar: 'اضغط وتحدث' },
            { step: '2', icon: '🔤', en: 'AI transcribes speech', ar: 'تحويل الكلام لنص' },
            { step: '3', icon: '🧠', en: 'AI understands case', ar: 'الذكاء يفهم قضيتك' },
            { step: '4', icon: '🔊', en: 'Spoken + text reply', ar: 'رد صوتي ونصي' },
          ].map(s => (
            <div key={s.step} className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card border border-border text-xl">
                {s.icon}
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground">
                {isRTL ? s.ar : s.en}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-muted-foreground/60">
        {isRTL
          ? 'وكيلا لا تقدم استشارات قانونية. المستشار الصوتي لأغراض الإرشاد وإدارة القضايا فقط. استشر محامياً مؤهلاً في جميع الأمور القانونية.'
          : 'Wakeela does not provide legal advice. The voice advisor is for case management guidance only. Consult a qualified legal professional for all legal matters.'}
      </p>
    </div>
  );
}
