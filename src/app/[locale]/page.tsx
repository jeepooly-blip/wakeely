import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Shield, ChevronRight, ChevronLeft, Scale, Lock, Bell,
  AlertTriangle, Calendar, FileText, MessageCircle,
  CheckCircle2, Star, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── bilingual content ─────────────────────────────────────── */
const CONTENT = {
  en: {
    nav:        { login: 'Sign In', register: 'Start Free' },
    hero: {
      badge:    'Legal Clarity. Finally.',
      h1a:      'Know Exactly',
      h1b:      "What's Happening",
      h1c:      'in Your Legal Case',
      sub:      'Track every step, deadline, and action. No more missed updates. No more uncertainty.',
      cta1:     'Start Your Case — Free',
      cta2:     'Sign In',
      trust:    'Trusted by 2,400+ clients across UAE, KSA & Kuwait',
    },
    problems: [
      { icon: '⏰', t: 'Missed Deadlines',   d: 'Critical dates pass with no one reminding you — or your lawyer.' },
      { icon: '📵', t: 'No Updates',          d: 'Days pass with zero communication. You have no idea what\'s happening.' },
      { icon: '📁', t: 'Lost Documents',      d: 'Papers scattered across email, WhatsApp, and physical folders.' },
      { icon: '❓', t: 'No Accountability',   d: 'When things go wrong, nobody is responsible and nothing is recorded.' },
    ],
    problemHeader: { badge: 'Sound familiar?', h2: 'Legal cases are often chaotic and unclear' },
    solutionHeader: { badge: 'The Wakeela way', h2: 'Clarity and control in every step' },
    solutions: [
      { icon: '⚡', t: 'Real-time Timeline',  d: 'Every action logged the moment it happens.' },
      { icon: '🎯', t: 'Deadline Tracking',   d: 'Automated reminders so nothing ever slips.' },
      { icon: '🔒', t: 'Full Transparency',   d: 'Complete audit trail of your entire case.' },
    ],
    featuresHeader: { badge: 'Everything you need', h2: 'Built for people who deserve to know the truth' },
    features: [
      { icon: '📋', t: 'Case Timeline',        d: 'See every action, filing, and hearing clearly. Nothing hidden.',   tag: 'Real-time'           },
      { icon: '📅', t: 'Deadline Tracker',     d: 'Court dates and submissions — all in one place with smart alerts.', tag: 'Never miss a date'    },
      { icon: '🗂️', t: 'Document Vault',       d: 'Store and instantly access all your legal documents. SHA-256 secure.', tag: 'Bank-grade security' },
      { icon: '💬', t: 'Accountable Chat',     d: 'Every message between you and your lawyer is logged permanently.', tag: 'Full audit trail'     },
      { icon: '⚖️', t: 'NDE Alerts',           d: 'AI detects silence and inaction and alerts you before it costs you.', tag: 'AI-powered'          },
      { icon: '📊', t: 'Case Health Score',    d: 'A live score shows exactly how your case is progressing.',          tag: 'Instant overview'    },
    ],
    trust: {
      badge: 'Zero hidden actions',
      h2a:  'No more hidden actions.',
      h2b:  'Everything is logged.',
      sub:  "Wakeela creates an immutable record of every step. If something was promised, it\'s recorded. If a deadline was missed, it\'s flagged.",
      stats: [
        { v: '100%', l: 'Actions logged'  },
        { v: '0',    l: 'Hidden steps'    },
        { v: '24/7', l: 'Case monitoring' },
        { v: '256-bit', l: 'Encryption'  },
      ],
    },
    testimonials: [
      { q: 'I finally understood what was happening in my labor dispute. Every step was visible.', n: 'Ahmed Al-Rashidi', r: 'Labor dispute, UAE',        stars: 5 },
      { q: 'After 3 years of confusion, Wakeela gave me the full picture in 10 minutes.',          n: 'Sarah Mohammed',   r: 'Family case, KSA',          stars: 5 },
      { q: 'The deadline alerts alone saved my case. I would have missed a critical submission.',   n: 'Khaled Ibrahim',   r: 'Commercial dispute, Kuwait', stars: 5 },
    ],
    whatsapp: {
      h2:  'Need help? Talk to us directly',
      sub: 'Our team replies within 5 minutes on WhatsApp.',
      btn: 'Chat on WhatsApp',
    },
    pricing: {
      badge: 'Simple pricing',
      h2:   'Start free. Upgrade when you need more.',
      sub:  'No credit card required. No hidden fees.',
    },
    finalCta: {
      h2:   'Take control of your legal case today',
      sub:  'Join thousands of clients across the GCC who finally know exactly what is happening.',
      btn:  'Get Started — Free',
      note: 'No credit card required. Set up in 2 minutes.',
    },
    footer: { copy: '© 2026 Wakeela. All rights reserved.' },
  },
  ar: {
    nav:       { login: 'تسجيل الدخول', register: 'ابدأ مجاناً' },
    hero: {
      badge:   'وضوح قانوني. أخيراً.',
      h1a:     'اعرف بالضبط',
      h1b:     'ماذا يحدث',
      h1c:     'في قضيتك القانونية',
      sub:     'تابع كل خطوة، كل موعد، وكل إجراء. لا مزيد من الغموض أو التأخير.',
      cta1:    'ابدأ قضيتي — مجاناً',
      cta2:    'تسجيل الدخول',
      trust:   'يثق بنا أكثر من 2,400 عميل في الإمارات والسعودية والكويت',
    },
    problems: [
      { icon: '⏰', t: 'مواعيد ضائعة',     d: 'تمر مواعيد حرجة دون تذكير — لا منك ولا من محاميك.' },
      { icon: '📵', t: 'غياب التواصل',     d: 'تمر أيام دون أي تواصل. لا تعلم إن كان أي شيء يحدث.' },
      { icon: '📁', t: 'مستندات مفقودة',   d: 'الوثائق المهمة مبعثرة في البريد وواتساب والمجلدات.' },
      { icon: '❓', t: 'لا مساءلة',         d: 'حين يسوء الأمر، لا أحد مسؤول ولا سجل لما وُعد به.' },
    ],
    problemHeader:  { badge: 'هل يبدو مألوفاً؟', h2: 'القضايا القانونية غالباً غير واضحة ومليئة بالفوضى' },
    solutionHeader: { badge: 'طريقة وكيلا',        h2: 'وضوح وتحكم في كل خطوة' },
    solutions: [
      { icon: '⚡', t: 'متابعة فورية',       d: 'كل إجراء يُسجَّل في اللحظة التي يحدث فيها.' },
      { icon: '🎯', t: 'تنبيهات للمواعيد',  d: 'تذكيرات تلقائية حتى لا يفوتك شيء أبداً.' },
      { icon: '🔒', t: 'شفافية كاملة',       d: 'سجل تدقيق كامل لكل تفاصيل قضيتك.' },
    ],
    featuresHeader: { badge: 'كل ما تحتاجه', h2: 'مصمم لمن يستحق معرفة الحقيقة كاملة' },
    features: [
      { icon: '📋', t: 'الجدول الزمني',       d: 'شاهد كل إجراء وجلسة ومراسلة في عرض واضح. لا شيء مخفي.',         tag: 'في الوقت الفعلي'            },
      { icon: '📅', t: 'متتبع المواعيد',      d: 'مواعيد المحكمة والتقديمات — كلها في مكان واحد مع تنبيهات ذكية.',  tag: 'لا تفوّت موعداً'           },
      { icon: '🗂️', t: 'خزنة المستندات',     d: 'خزّن جميع وثائقك وادخل إليها فوراً. مُحقَّق بـ SHA-256.',         tag: 'أمان بنكي'                  },
      { icon: '💬', t: 'محادثة موثَّقة',      d: 'كل رسالة بينك وبين محاميك مُسجَّلة بالتوقيت ومحفوظة دائماً.',    tag: 'سجل تدقيق كامل'            },
      { icon: '⚖️', t: 'تنبيهات NDE',         d: 'يرصد الذكاء الاصطناعي الصمت والإهمال ويُنبهك قبل فوات الأوان.',  tag: 'مدعوم بالذكاء الاصطناعي'  },
      { icon: '📊', t: 'مؤشر صحة القضية',   d: 'مؤشر مباشر يُظهر الحالة الإجمالية لقضيتك.',                         tag: 'نظرة عامة فورية'           },
    ],
    trust: {
      badge: 'لا إجراءات مخفية',
      h2a:  'لا مزيد من الأمور المخفية.',
      h2b:  'كل شيء موثق.',
      sub:  'تُنشئ وكيلا سجلاً غير قابل للتغيير لكل خطوة. إن كان هناك وعد فهو مُسجَّل. إن فات موعد فهو مُعلَّم.',
      stats: [
        { v: '100%',    l: 'الإجراءات مُسجَّلة' },
        { v: '0',       l: 'خطوات مخفية'        },
        { v: '24/7',    l: 'مراقبة القضية'       },
        { v: '256-bit', l: 'تشفير'               },
      ],
    },
    testimonials: [
      { q: 'أخيراً فهمت ما يجري في نزاعي العمالي. كل خطوة كانت مرئية ومحاميي يعلم أنني أتابع.',    n: 'أحمد الراشدي', r: 'نزاع عمالي، الإمارات',    stars: 5 },
      { q: 'بعد 3 سنوات من الارتباك، أعطتني وكيلا صورة كاملة عن قضيتي في 10 دقائق فقط.',         n: 'سارة محمد',     r: 'قضية أسرية، السعودية',    stars: 5 },
      { q: 'تنبيهات المواعيد وحدها أنقذت قضيتي. كنت سأفوّت تقديماً حرجاً لولا وكيلا.',            n: 'خالد إبراهيم',  r: 'نزاع تجاري، الكويت',      stars: 5 },
    ],
    whatsapp: {
      h2:  'هل تحتاج مساعدة؟ تواصل معنا مباشرة',
      sub: 'فريقنا يرد عادةً خلال 5 دقائق على واتساب.',
      btn: 'تواصل عبر واتساب',
    },
    pricing: {
      badge: 'أسعار بسيطة',
      h2:   'ابدأ مجاناً وارتقِ لتتبع كامل',
      sub:  'لا بطاقة ائتمانية. لا رسوم مخفية.',
    },
    finalCta: {
      h2:   'ابدأ التحكم في قضيتك اليوم',
      sub:  'انضم إلى آلاف العملاء في الخليج الذين يعلمون أخيراً ما يجري في قضاياهم.',
      btn:  'ابدأ الآن — مجاناً',
      note: 'لا بطاقة ائتمانية. الإعداد في دقيقتين.',
    },
    footer: { copy: '© 2026 وكيلا. جميع الحقوق محفوظة.' },
  },
};

/* ─── Section badge ─────────────────────────────────────────── */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C89B3C]/30 bg-[#C89B3C]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#C89B3C]">
      ✦ {children}
    </span>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export default async function LandingPage() {
  const locale = await getLocale();
  const isRTL  = locale === 'ar';
  const c      = isRTL ? CONTENT.ar : CONTENT.en;
  const ChevIcon = isRTL ? ChevronLeft : ChevronRight;

  // If user is already logged in, send to dashboard
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(`/${locale}/dashboard`);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden">

      {/* ── NAVBAR ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1A3557] shadow-md">
              <Shield className="h-4.5 w-4.5 text-[#C89B3C]" />
            </div>
            <span className="text-lg font-black tracking-tight text-[#1A3557] dark:text-white">
              {isRTL ? 'وكيلا' : 'WAKEELA'}
            </span>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Link href="/login"
              className="hidden sm:inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition">
              {c.nav.login}
            </Link>
            <Link href="/register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1A3557] px-4 py-2 text-sm font-bold text-white hover:bg-[#1e4a7a] transition shadow-sm">
              {c.nav.register}
              <ChevIcon className="h-3.5 w-3.5" />
            </Link>
            {/* Language toggle */}
            <a href={locale === 'ar' ? '/en' : '/ar'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-xs font-bold text-muted-foreground hover:border-[#1A3557]/40 hover:text-[#1A3557] transition">
              {isRTL ? 'EN' : 'AR'}
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Grid bg */}
        <div className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(to right,var(--border) 1px,transparent 1px)',
            backgroundSize: '60px 60px',
            opacity: .35,
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%,black 0%,transparent 75%)',
          }} />
        {/* Glow */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#1A3557]/8 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-5 py-20 text-center">
          <div className="mb-5">
            <Badge>{c.hero.badge}</Badge>
          </div>
          <h1 className="mb-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-[#1A3557] dark:text-white">{c.hero.h1a} </span>
            <span className="bg-gradient-to-r from-[#1A3557] to-[#0E7490] bg-clip-text text-transparent">
              {c.hero.h1b}
            </span>
            <br />
            <span className="text-[#1A3557] dark:text-white">{c.hero.h1c}</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground leading-relaxed">
            {c.hero.sub}
          </p>
          {/* CTAs */}
          <div className={cn('flex flex-wrap justify-center gap-3', isRTL && 'flex-row-reverse')}>
            <Link href="/register"
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#C89B3C] to-[#E8B84B] px-7 py-3.5 text-base font-black text-[#1A3557] shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
              {c.hero.cta1}
              <ChevIcon className="h-4 w-4" />
            </Link>
            <Link href="/login"
              className="flex items-center gap-2 rounded-2xl border border-border px-7 py-3.5 text-base font-semibold text-foreground hover:border-[#1A3557]/40 hover:bg-[#1A3557]/5 transition-all">
              {c.hero.cta2}
            </Link>
          </div>
          {/* Trust line */}
          <p className="mt-7 text-sm text-muted-foreground flex items-center justify-center gap-2">
            <span className="text-[#C89B3C]">✦</span>
            {c.hero.trust}
          </p>

          {/* Dashboard mockup */}
          <div className="mx-auto mt-14 max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/40">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ms-2 text-xs font-medium text-muted-foreground">
                {isRTL ? 'نزاع عمالي — القضية #1842' : 'Labor Dispute — Case #1842'}
              </span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { tag: 'bg-emerald-100 text-emerald-700', label: isRTL ? '✓ منتهي' : '✓ Done',   text: isRTL ? 'تعيين المحامي وتوقيع العقد' : 'Lawyer assigned & contract signed',    date: 'Mar 1' },
                { tag: 'bg-blue-100 text-blue-700',       label: isRTL ? 'نشط' : 'Active',         text: isRTL ? 'تقديم المستندات للمحكمة'    : 'Documents submitted to court',          date: 'Mar 8' },
                { tag: 'bg-amber-100 text-amber-700',     label: isRTL ? '⏳ قريب' : '⏳ Soon',    text: isRTL ? 'جلسة الاستماع — قاعة أ'     : 'Hearing scheduled — Court A',           date: 'Mar 22' },
                { tag: 'bg-red-100 text-red-700',         label: isRTL ? '⚠ تنبيه' : '⚠ Alert',   text: isRTL ? 'NDE: 14 يوماً بدون تحديث'  : 'NDE: 14 days without update',           date: isRTL ? 'اليوم' : 'Today' },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0', row.tag)}>{row.label}</span>
                  <span className="flex-1 text-xs font-medium text-foreground text-start">{row.text}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0" dir="ltr">{row.date}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 border border-border p-3 mt-1">
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  {isRTL ? 'صحة القضية' : 'Case Health'}
                </span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#0E7490] to-[#C89B3C]" style={{ width: '72%' }} />
                </div>
                <span className="text-xs font-black text-[#0E7490] tabular-nums shrink-0">72%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROBLEM ────────────────────────────────────────────── */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-5xl px-5">
          <div className="text-center mb-12">
            <div className="mb-4"><Badge>{c.problemHeader.badge}</Badge></div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{c.problemHeader.h2}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {c.problems.map((item) => (
              <div key={item.t} className="group rounded-2xl border border-border bg-card p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200 relative overflow-hidden">
                <div className="absolute top-0 start-0 end-0 h-0.5 bg-gradient-to-r from-red-500 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <span className="text-3xl mb-4 block">{item.icon}</span>
                <h3 className="text-sm font-bold mb-2">{item.t}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOLUTION ───────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-5">
          <div className="text-center mb-12">
            <div className="mb-4"><Badge>{c.solutionHeader.badge}</Badge></div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{c.solutionHeader.h2}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {c.solutions.map((item) => (
              <div key={item.t} className="text-center rounded-2xl border border-border bg-card p-8 hover:-translate-y-1.5 hover:shadow-xl transition-all duration-200">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1A3557] to-[#0E7490] shadow-lg text-2xl">
                  {item.icon}
                </div>
                <h3 className="font-bold mb-2">{item.t}</h3>
                <p className="text-sm text-muted-foreground">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────── */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-5xl px-5">
          <div className="text-center mb-12">
            <div className="mb-4"><Badge>{c.featuresHeader.badge}</Badge></div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{c.featuresHeader.h2}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-border rounded-2xl overflow-hidden divide-y divide-border sm:divide-y-0 sm:divide-x [&>*:nth-child(n+4)]:border-t">
            {c.features.map((item) => (
              <div key={item.t} className="group bg-card p-7 hover:bg-muted/50 transition-colors relative overflow-hidden">
                <div className="absolute bottom-0 start-0 end-0 h-0.5 bg-gradient-to-r from-[#1A3557] via-[#0E7490] to-[#C89B3C] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-start" />
                <span className="text-2xl mb-3 block">{item.icon}</span>
                <span className="inline-block rounded-md bg-[#0E7490]/10 text-[#0E7490] text-[10px] font-bold px-2 py-0.5 mb-2 uppercase tracking-wide">{item.tag}</span>
                <h3 className="font-bold mb-2 text-sm">{item.t}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20"
        style={{ background: 'linear-gradient(160deg,#0B1D35 0%,#112340 40%,#0c1e38 100%)' }}>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute start-0 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-[#0E7490]/15 blur-3xl" />
          <div className="absolute end-0 top-0 h-64 w-64 rounded-full bg-[#C89B3C]/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="mb-4">
                <Badge>{c.trust.badge}</Badge>
              </div>
              <h2 className="text-3xl font-black text-white mb-4 sm:text-4xl">
                {c.trust.h2a}<br />
                <span className="text-[#C89B3C]">{c.trust.h2b}</span>
              </h2>
              <p className="text-white/65 leading-relaxed mb-8">{c.trust.sub}</p>
              <Link href="/register"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#C89B3C] to-[#E8B84B] px-6 py-3 font-black text-[#1A3557] hover:shadow-lg hover:-translate-y-0.5 transition-all">
                {isRTL ? 'جرّب مجاناً' : 'Try Free'}
                <ChevIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {c.trust.stats.map((s) => (
                <div key={s.l} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center hover:bg-white/8 hover:border-[#C89B3C]/30 transition-all">
                  <div className="text-3xl font-black text-[#C89B3C] mb-2 tabular-nums">{s.v}</div>
                  <div className="text-xs text-white/55 font-semibold">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-5">
          <div className="text-center mb-12">
            <Badge>{isRTL ? 'ماذا يقول العملاء' : 'What clients say'}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {c.testimonials.map((item) => (
              <div key={item.n} className="rounded-2xl border border-border bg-card p-6 hover:-translate-y-1 hover:shadow-lg transition-all relative">
                <div className="text-[#C89B3C] text-sm mb-3">{'★'.repeat(item.stars)}</div>
                <p className="text-sm text-foreground font-medium leading-relaxed mb-5">"{item.q}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#1A3557] to-[#0E7490] flex items-center justify-center text-white text-xs font-black shrink-0">
                    {item.n[0]}
                  </div>
                  <div>
                    <p className="text-xs font-bold">{item.n}</p>
                    <p className="text-[10px] text-muted-foreground">{item.r}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHATSAPP ───────────────────────────────────────────── */}
      <section className="py-16" style={{ background: 'linear-gradient(135deg,#0d1f35,#0a2820)' }}>
        <div className="mx-auto max-w-3xl px-5 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-lg"
            style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)', boxShadow: '0 8px 32px rgba(37,211,102,.4)' }}>
            💬
          </div>
          <h2 className="text-2xl font-black text-white mb-3">{c.whatsapp.h2}</h2>
          <p className="text-white/60 mb-7 text-sm">{c.whatsapp.sub}</p>
          <a href="https://wa.me/971500000000?text=Hi%2C%20I%27d%20like%20to%20know%20more%20about%20Wakeela"
            target="_blank" rel="noopener"
            className="inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-base font-black text-white transition-all hover:-translate-y-1"
            style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)', boxShadow: '0 4px 24px rgba(37,211,102,.35)' }}>
            {c.whatsapp.btn}
          </a>
        </div>
      </section>

      {/* ── PRICING TEASER ─────────────────────────────────────── */}
      <section className="py-20 bg-muted/40">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <div className="mb-4"><Badge>{c.pricing.badge}</Badge></div>
          <h2 className="text-3xl font-black mb-3">{c.pricing.h2}</h2>
          <p className="text-muted-foreground mb-10">{c.pricing.sub}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: isRTL ? 'مجاني'    : 'Free',    price: '$0',  period: isRTL ? 'للأبد' : 'forever',   highlight: false,
                features: isRTL ? ['قضية واحدة','جدول أساسي','5 مستندات'] : ['1 case','Basic timeline','5 documents'] },
              { name: isRTL ? 'برو'      : 'Pro',     price: '$29', period: isRTL ? 'شهرياً' : '/month',   highlight: true,
                features: isRTL ? ['قضايا غير محدودة','تنبيهات NDE','دعوة المحامي'] : ['Unlimited cases','NDE alerts','Lawyer invite'] },
              { name: isRTL ? 'بريميوم' : 'Premium', price: '$79', period: isRTL ? 'شهرياً' : '/month',   highlight: false,
                features: isRTL ? ['كل شيء في برو','مؤشر صحة AI','تنبيهات واتساب'] : ['Everything in Pro','AI health score','WhatsApp alerts'] },
            ].map((plan) => (
              <div key={plan.name} className={cn(
                'rounded-2xl border p-6 text-start transition-all hover:-translate-y-1',
                plan.highlight
                  ? 'bg-[#1A3557] border-transparent text-white shadow-xl scale-105'
                  : 'bg-card border-border hover:shadow-md'
              )}>
                {plan.highlight && (
                  <span className="inline-block rounded-full bg-[#C89B3C] text-[#1A3557] text-[10px] font-black px-3 py-0.5 mb-3 uppercase">
                    {isRTL ? 'الأكثر شيوعاً' : 'Most Popular'}
                  </span>
                )}
                <p className={cn('text-xs font-bold uppercase tracking-widest mb-1', plan.highlight ? 'text-white/60' : 'text-muted-foreground')}>{plan.name}</p>
                <p className={cn('text-3xl font-black mb-0.5', plan.highlight ? 'text-[#C89B3C]' : 'text-foreground')}>{plan.price}</p>
                <p className={cn('text-xs mb-5', plan.highlight ? 'text-white/50' : 'text-muted-foreground')}>{plan.period}</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className={cn('flex items-center gap-2 text-xs', plan.highlight ? 'text-white/80' : 'text-muted-foreground')}>
                      <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', plan.highlight ? 'text-[#C89B3C]' : 'text-emerald-500')} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register"
                  className={cn('block rounded-xl py-2.5 text-center text-sm font-bold transition',
                    plan.highlight
                      ? 'bg-[#C89B3C] text-[#1A3557] hover:bg-[#E8B84B]'
                      : 'border border-border hover:bg-muted')}>
                  {isRTL ? 'ابدأ' : 'Get Started'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────── */}
      <section className="py-24 text-center relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 100%,rgba(26,53,87,.07) 0%,transparent 60%)' }} />
        <div className="relative mx-auto max-w-2xl px-5">
          <h2 className="text-4xl font-black tracking-tight mb-4 sm:text-5xl">{c.finalCta.h2}</h2>
          <p className="text-muted-foreground text-lg mb-8">{c.finalCta.sub}</p>
          <Link href="/register"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#C89B3C] to-[#E8B84B] px-8 py-4 text-lg font-black text-[#1A3557] shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
            {c.finalCta.btn}
            <ChevIcon className="h-5 w-5" />
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">{c.finalCta.note}</p>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-5xl px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1A3557]">
              <Shield className="h-3.5 w-3.5 text-[#C89B3C]" />
            </div>
            <span className="text-sm font-black text-[#1A3557] dark:text-white">
              {isRTL ? 'وكيلا' : 'WAKEELA'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{c.footer.copy}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href={`/${locale}/login`} className="hover:text-foreground transition">{c.nav.login}</Link>
            <Link href={`/${locale}/register`} className="hover:text-foreground transition">{c.nav.register}</Link>
            <a href={locale === 'ar' ? '/en' : '/ar'}
              className="font-bold hover:text-[#1A3557] transition">
              {isRTL ? 'English' : 'العربية'}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
