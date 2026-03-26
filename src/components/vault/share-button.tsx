'use client';

import { useState } from 'react';
import { Share2, Copy, Check, X, Clock, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VaultShareButtonProps {
  documentId: string;
  fileName:   string;
  locale:     string;
}

interface ShareResult {
  share_url:    string;
  token:        string;
  expires_at:   string;
  max_accesses: number;
  file_name:    string;
}

// Expiry presets the user can choose from
const EXPIRY_OPTIONS = [
  { hours: 1,   en: '1 hour',   ar: 'ساعة واحدة'   },
  { hours: 24,  en: '24 hours', ar: '24 ساعة'       },
  { hours: 72,  en: '3 days',   ar: '3 أيام'        },
  { hours: 168, en: '7 days',   ar: '7 أيام'        },
] as const;

const ACCESS_OPTIONS = [
  { value: 1,  en: '1 access',   ar: 'مرة واحدة'    },
  { value: 5,  en: '5 accesses', ar: '5 مرات'       },
  { value: 10, en: '10 accesses',ar: '10 مرات'      },
] as const;

export function VaultShareButton({ documentId, fileName, locale }: VaultShareButtonProps) {
  const isRTL = locale === 'ar';

  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<ShareResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [expiryHrs,  setExpiryHrs]  = useState(24);
  const [maxAccess,  setMaxAccess]  = useState(5);

  const reset = () => {
    setResult(null);
    setError(null);
    setCopied(false);
    setExpiryHrs(24);
    setMaxAccess(5);
  };

  const openModal = () => { reset(); setOpen(true); };
  const closeModal = () => { setOpen(false); reset(); };

  const generateLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vault/share', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          document_id:  documentId,
          expiry_hours: expiryHrs,
          max_accesses: maxAccess,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (isRTL ? 'حدث خطأ' : 'Something went wrong'));
      } else {
        setResult(data as ShareResult);
      }
    } catch {
      setError(isRTL ? 'فشل الاتصال بالخادم' : 'Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!result?.share_url) return;
    try {
      await navigator.clipboard.writeText(result.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers that block clipboard in iframes
      const el = document.createElement('textarea');
      el.value = result.share_url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const fmtExpiry = (iso: string) =>
    new Date(iso).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <>
      {/* ── Trigger button ─────────────────────────────────── */}
      <button
        onClick={openModal}
        title={isRTL ? 'مشاركة المستند' : 'Share document'}
        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-[#0E7490] hover:border-[#0E7490]/40 hover:bg-[#0E7490]/5 transition"
      >
        <Share2 className="h-3.5 w-3.5" />
        {isRTL ? 'مشاركة' : 'Share'}
      </button>

      {/* ── Modal overlay ──────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className={cn(
              'relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl',
              'animate-in fade-in zoom-in-95 duration-150'
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[#0E7490]" />
                <h2 className="text-sm font-bold text-foreground">
                  {isRTL ? 'مشاركة المستند' : 'Share Document'}
                </h2>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1 hover:bg-muted transition">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* File name */}
              <div className="rounded-xl bg-muted/50 border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground mb-0.5">
                  {isRTL ? 'الملف' : 'File'}
                </p>
                <p className="text-sm font-semibold text-foreground truncate">{fileName}</p>
              </div>

              {!result ? (
                <>
                  {/* Expiry selector */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {isRTL ? 'مدة الصلاحية' : 'Link expires after'}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {EXPIRY_OPTIONS.map((opt) => (
                        <button
                          key={opt.hours}
                          onClick={() => setExpiryHrs(opt.hours)}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-xs font-semibold transition',
                            expiryHrs === opt.hours
                              ? 'border-[#0E7490] bg-[#0E7490]/10 text-[#0E7490]'
                              : 'border-border text-muted-foreground hover:border-[#0E7490]/40 hover:text-foreground'
                          )}
                        >
                          {isRTL ? opt.ar : opt.en}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max accesses selector */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                      {isRTL ? 'عدد مرات الوصول' : 'Max accesses'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {ACCESS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setMaxAccess(opt.value)}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-xs font-semibold transition',
                            maxAccess === opt.value
                              ? 'border-[#0E7490] bg-[#0E7490]/10 text-[#0E7490]'
                              : 'border-border text-muted-foreground hover:border-[#0E7490]/40 hover:text-foreground'
                          )}
                        >
                          {isRTL ? opt.ar : opt.en}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}

                  {/* Generate button */}
                  <button
                    onClick={generateLink}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0E7490] text-white py-2.5 text-sm font-bold hover:bg-[#0c6478] transition disabled:opacity-60"
                  >
                    {loading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Share2 className="h-4 w-4" />{isRTL ? 'إنشاء رابط المشاركة' : 'Generate Share Link'}</>
                    }
                  </button>
                </>
              ) : (
                /* ── Result state ────────────────────────────── */
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                      ✅ {isRTL ? 'تم إنشاء الرابط' : 'Link generated'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-[11px] font-mono text-foreground break-all flex-1 leading-relaxed">
                        {result.share_url}
                      </p>
                    </div>
                  </div>

                  {/* Link meta */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                      <p className="font-medium text-foreground mb-0.5">
                        {isRTL ? 'تنتهي في' : 'Expires'}
                      </p>
                      <p>{fmtExpiry(result.expires_at)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                      <p className="font-medium text-foreground mb-0.5">
                        {isRTL ? 'الوصول المتاح' : 'Accesses'}
                      </p>
                      <p>{result.max_accesses}</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={copyLink}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition',
                        copied
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#0E7490] text-white hover:bg-[#0c6478]'
                      )}
                    >
                      {copied
                        ? <><Check className="h-4 w-4" />{isRTL ? 'تم النسخ!' : 'Copied!'}</>
                        : <><Copy className="h-4 w-4" />{isRTL ? 'نسخ الرابط' : 'Copy Link'}</>
                      }
                    </button>
                    <a
                      href={result.share_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isRTL ? 'فتح' : 'Open'}
                    </a>
                  </div>

                  {/* Generate another */}
                  <button
                    onClick={reset}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition py-1"
                  >
                    {isRTL ? '← إنشاء رابط آخر' : '← Generate another link'}
                  </button>
                </div>
              )}

              {/* Security note */}
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed text-center">
                {isRTL
                  ? 'الرابط يمكن الوصول إليه بدون تسجيل دخول. لا تشاركه إلا مع أشخاص موثوقين.'
                  : 'This link can be accessed without logging in. Only share with trusted parties.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
