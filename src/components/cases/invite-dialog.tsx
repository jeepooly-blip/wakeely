'use client';

import { useState, useTransition } from 'react';
import {
  UserPlus, Link2, Copy, Check, Mail,
  X, Loader2, Clock, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateInvite } from '@/actions/invite-actions';

interface InviteDialogProps {
  caseId:    string;
  caseTitle: string;
  locale:    string;
  isOpen:    boolean;
  onClose:   () => void;
}

export function InviteDialog({
  caseId, caseTitle, locale, isOpen, onClose,
}: InviteDialogProps) {
  const isRTL = locale === 'ar';
  const [isPending, startTransition] = useTransition();
  const [email,     setEmail]     = useState('');
  const [link,      setLink]      = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied,    setCopied]    = useState(false);
  const [error,     setError]     = useState('');
  const [step,      setStep]      = useState<'form' | 'link'>('form');

  if (!isOpen) return null;

  const handleGenerate = () => {
    setError('');
    startTransition(async () => {
      try {
        const result = await generateInvite(caseId, email || undefined);
        setLink(result.url);
        setExpiresAt(result.expires_at);
        setStep('link');
      } catch (e) {
        setError(e instanceof Error ? e.message : (isRTL ? 'حدث خطأ' : 'An error occurred'));
      }
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the input
      const el = document.getElementById('invite-link-input') as HTMLInputElement;
      el?.select();
    }
  };

  const reset = () => {
    setStep('form');
    setLink('');
    setEmail('');
    setError('');
    setCopied(false);
  };

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
    : 7;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Dialog */}
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-scale-in"
        dir={isRTL ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1A3557]/10">
              <UserPlus className="h-4 w-4 text-[#1A3557]" />
            </div>
            <div>
              <h2 id="invite-dialog-title" className="text-sm font-bold text-foreground">
                {isRTL ? 'دعوة محامٍ للقضية' : 'Invite Lawyer to Case'}
              </h2>
              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                {caseTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition"
            aria-label={isRTL ? 'إغلاق' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 'form' ? (
            <>
              {/* Optional email input */}
              <div>
                <label
                  htmlFor="invite-email"
                  className="block text-xs font-medium text-muted-foreground mb-1.5"
                >
                  {isRTL ? 'البريد الإلكتروني للمحامي (اختياري)' : "Lawyer's email (optional)"}
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="lawyer@example.com"
                  dir="ltr"           /* Always LTR for email */
                  className="input-base"
                  disabled={isPending}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {isRTL
                    ? 'إذا أضفت البريد، سيظهر في نموذج قبول الدعوة.'
                    : 'If provided, shown on the invite acceptance form.'}
                </p>
              </div>

              {/* Info box */}
              <div className="rounded-xl bg-[#1A3557]/5 border border-[#1A3557]/15 px-4 py-3">
                <p className="text-xs text-[#1A3557] dark:text-blue-300 leading-relaxed">
                  {isRTL
                    ? 'سيتم إنشاء رابط فريد صالح لمدة 7 أيام. المحامي الذي يفتح الرابط سيحصل على صلاحية محدودة لهذه القضية فقط.'
                    : 'A unique link valid for 7 days will be generated. The lawyer who opens it gets scoped access to this case only.'}
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isPending}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" />{isRTL ? 'جارٍ الإنشاء…' : 'Generating…'}</>
                  : <><Link2 className="h-4 w-4" />{isRTL ? 'إنشاء رابط الدعوة' : 'Generate Invite Link'}</>}
              </button>
            </>
          ) : (
            <>
              {/* Success state */}
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">
                  {isRTL ? 'تم إنشاء رابط الدعوة بنجاح!' : 'Invite link generated successfully!'}
                </p>
              </div>

              {/* Link input — always LTR per PRD spec */}
              <div>
                <label htmlFor="invite-link-input" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {isRTL ? 'رابط الدعوة (أرسله لمحاميك)' : 'Invite link (share with your lawyer)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="invite-link-input"
                    type="text"
                    readOnly
                    value={link}
                    dir="ltr"           /* Always LTR for URLs — PRD requirement */
                    className="input-base flex-1 text-xs font-mono bg-muted/50 cursor-text select-all"
                    onFocus={(e) => e.target.select()}
                    aria-label={isRTL ? 'رابط الدعوة' : 'Invite URL'}
                  />
                  <button
                    onClick={copyLink}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition',
                      copied
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-[#1A3557] text-white hover:bg-[#1e4a7a]'
                    )}
                    aria-label={isRTL ? 'نسخ الرابط' : 'Copy link'}
                  >
                    {copied
                      ? <><Check className="h-3.5 w-3.5" />{isRTL ? 'تم' : 'Copied'}</>
                      : <><Copy className="h-3.5 w-3.5" />{isRTL ? 'نسخ' : 'Copy'}</>}
                  </button>
                </div>
              </div>

              {/* Expiry */}
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-4 py-2">
                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {isRTL
                    ? `الرابط صالح لمدة ${daysLeft} أيام — لاستخدام مرة واحدة فقط`
                    : `Valid for ${daysLeft} days — single use only`}
                </p>
              </div>

              {/* Optional: open email client */}
              {email && (
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(isRTL ? `دعوة وكيلا — ${caseTitle}` : `Wakeela Invite — ${caseTitle}`)}&body=${encodeURIComponent(link)}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted transition"
                >
                  <Mail className="h-4 w-4" />
                  {isRTL ? `إرسال إلى ${email}` : `Send to ${email}`}
                </a>
              )}

              {/* WhatsApp share */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  isRTL
                    ? `دعوة وكيلا للقضية "${caseTitle}":\n${link}`
                    : `Wakeela invite for case "${caseTitle}":\n${link}`
                )}`}
                target="_blank"
                rel="noopener"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}
              >
                💬 {isRTL ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}
              </a>

              {/* Generate new link */}
              <button
                onClick={reset}
                className="btn-ghost w-full text-xs text-muted-foreground"
              >
                {isRTL ? 'إنشاء رابط جديد (سيلغي الحالي)' : 'Generate new link (revokes current)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
