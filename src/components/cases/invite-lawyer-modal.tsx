'use client';

import { useState } from 'react';
import { Link2, Copy, Check, Mail, X, Loader2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InviteLawyerModalProps {
  caseId:    string;
  caseTitle: string;
  locale:    string;
  onClose:   () => void;
}

export function InviteLawyerModal({ caseId, caseTitle, locale, onClose }: InviteLawyerModalProps) {
  const isRTL = locale === 'ar';
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [link,    setLink]    = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);
  const [error,   setError]   = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/invites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ case_id: caseId, lawyer_email: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const base = window.location.origin;
      setLink(`${base}/${locale}/invite/${data.token}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#1A3557]" />
            <h2 className="text-base font-bold text-foreground">
              {isRTL ? 'دعوة محامٍ' : 'Invite Lawyer'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Case name */}
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-0.5">
              {isRTL ? 'القضية' : 'Case'}
            </p>
            <p className="text-sm font-semibold text-foreground truncate">{caseTitle}</p>
          </div>

          {/* Optional email */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {isRTL ? 'البريد الإلكتروني للمحامي (اختياري)' : "Lawyer's email (optional)"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isRTL ? 'lawyer@example.com' : 'lawyer@example.com'}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3557]/30"
              dir="ltr"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5">
              {error}
            </p>
          )}

          {/* Generated link */}
          {link ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {isRTL ? 'تم إنشاء الرابط! أرسله لمحاميك.' : 'Link generated! Share it with your lawyer.'}
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-3">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="flex-1 text-xs text-muted-foreground truncate font-mono" dir="ltr">{link}</p>
                <button
                  onClick={copy}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    copied
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'
                      : 'bg-[#1A3557] text-white hover:bg-[#1e4a7a]'
                  )}
                >
                  {copied
                    ? <><Check className="h-3 w-3" />{isRTL ? 'تم النسخ' : 'Copied'}</>
                    : <><Copy className="h-3 w-3" />{isRTL ? 'نسخ' : 'Copy'}</>}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                {isRTL ? 'الرابط صالح لمدة 7 أيام.' : 'Link expires in 7 days.'}
              </p>
              {email && (
                <button
                  onClick={() => window.open(`mailto:${email}?subject=Wakeela Case Invite&body=${encodeURIComponent(link)}`)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted transition"
                >
                  <Mail className="h-4 w-4" />
                  {isRTL ? 'إرسال بالبريد' : 'Send via Email'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={generate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1A3557] text-white py-3 text-sm font-bold hover:bg-[#1e4a7a] disabled:opacity-50 transition"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />{isRTL ? 'جارٍ الإنشاء…' : 'Generating…'}</>
                : <><Link2 className="h-4 w-4" />{isRTL ? 'إنشاء رابط الدعوة' : 'Generate Invite Link'}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
