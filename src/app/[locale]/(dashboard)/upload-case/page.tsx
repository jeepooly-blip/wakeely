import { getLocale }   from 'next-intl/server';
import { redirect }    from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DocUploadAnalyzer } from '@/components/onboarding/doc-upload-analyzer';
import { Link }        from '@/i18n/navigation';
import { ArrowLeft, ArrowRight, Sparkles, Shield } from 'lucide-react';

export default async function UploadCasePage() {
  const locale   = await getLocale();
  const isRTL    = locale === 'ar';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* Back */}
      <Link href={`/${locale}/cases/new`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
        <BackIcon className="h-4 w-4" />
        {isRTL ? 'إنشاء قضية يدوياً' : 'Create case manually'}
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-[#1A3557]/20 bg-gradient-to-br from-[#1A3557]/5 to-[#0E7490]/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1A3557] to-[#0E7490] shadow-lg">
            <Sparkles className="h-6 w-6 text-[#C89B3C]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">
              {isRTL ? 'تحليل المستند بالذكاء الاصطناعي' : 'AI Document Analysis'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {isRTL
                ? 'ارفع عقدك أو ورقة المحكمة وسيقوم وكيلا بإنشاء قضيتك تلقائياً مع جميع المواعيد والتنبيهات.'
                : 'Upload your contract or court paper and Wakeela will automatically create your case with all dates and alerts.'}
            </p>
            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { en: '⚡ Under 60 seconds', ar: '⚡ أقل من 60 ثانية' },
                { en: '📅 Auto-add deadlines', ar: '📅 مواعيد تلقائية' },
                { en: '⚠️ Risk detection', ar: '⚠️ كشف المخاطر' },
                { en: '🌍 Arabic + English', ar: '🌍 عربي + إنجليزي' },
              ].map((p) => (
                <span key={p.en} className="rounded-full bg-[#1A3557]/10 px-2.5 py-1 text-[11px] font-semibold text-[#1A3557] dark:text-blue-300">
                  {isRTL ? p.ar : p.en}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main uploader */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <DocUploadAnalyzer locale={locale} />
      </div>

      {/* Legal disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl bg-muted/50 border border-border px-4 py-3">
        <Shield className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {isRTL
            ? 'وكيلا لا تقدم استشارات قانونية. التحليل لأغراض التوثيق وإدارة القضايا فقط. استشر محامياً مؤهلاً في جميع الأمور القانونية.'
            : 'Wakeela does not provide legal advice. Analysis is for documentation and case management purposes only. Consult a qualified legal professional for all legal matters.'}
        </p>
      </div>
    </div>
  );
}
