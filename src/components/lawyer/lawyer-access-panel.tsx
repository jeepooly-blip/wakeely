'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User, UserPlus, Link2, Shield, ShieldOff, MessageCircle,
  ClipboardList, ChevronDown, ChevronUp, Loader2, Check,
  Copy, Mail, X, AlertCircle, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssignedLawyer {
  id: string;
  status: 'active' | 'revoked';
  permissions: string;
  created_at: string;
  users: {
    id: string;
    full_name: string;
    email: string;
    bar_number?: string;
    jurisdiction?: string;
  } | null;
}

interface ActionLog {
  id: string;
  action_type: string;
  description: string;
  action_date: string;
  created_at: string;
}

interface LawyerAccessPanelProps {
  caseId:    string;
  caseTitle: string;
  locale:    string;
  // Static info from cases table (may not have case_lawyers)
  lawyerName?:      string;
  lawyerEmail?:     string;
  lawyerPhone?:     string;
  lawyerBarNumber?: string;
}

const ACTION_LABELS: Record<string, { en: string; ar: string }> = {
  court_hearing:    { en: 'Court Hearing',    ar: 'جلسة استماع'       },
  document_filed:   { en: 'Document Filed',   ar: 'إيداع مستند'       },
  client_contacted: { en: 'Client Contacted', ar: 'تواصل مع الموكّل'  },
  research:         { en: 'Research',         ar: 'بحث قانوني'         },
  negotiation:      { en: 'Negotiation',      ar: 'مفاوضات'            },
  correspondence:   { en: 'Correspondence',   ar: 'مراسلة'             },
  other:            { en: 'Other',            ar: 'أخرى'              },
};

export function LawyerAccessPanel({
  caseId, caseTitle, locale,
  lawyerName, lawyerEmail, lawyerPhone, lawyerBarNumber,
}: LawyerAccessPanelProps) {
  const isRTL = locale === 'ar';

  const [lawyers,       setLawyers]       = useState<AssignedLawyer[]>([]);
  const [logs,          setLogs]          = useState<ActionLog[]>([]);
  const [loadingData,   setLoadingData]   = useState(true);
  const [showInvite,    setShowInvite]    = useState(false);
  const [showLogs,      setShowLogs]      = useState(false);
  const [revoking,      setRevoking]      = useState<string | null>(null);
  const [inviteEmail,   setInviteEmail]   = useState(lawyerEmail ?? '');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink,    setInviteLink]    = useState('');
  const [copied,        setCopied]        = useState(false);
  const [inviteError,   setInviteError]   = useState('');

  const activeLawyers = lawyers.filter((l) => l.status === 'active');
  const hasActive     = activeLawyers.length > 0;

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [lawyerRes, logRes] = await Promise.all([
        fetch(`/api/cases/${caseId}/lawyers`),
        fetch(`/api/cases/${caseId}/action-logs`),
      ]);
      if (lawyerRes.ok) setLawyers(await lawyerRes.json());
      if (logRes.ok)    setLogs(await logRes.json());
    } finally {
      setLoadingData(false);
    }
  }, [caseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const generateInvite = async () => {
    setInviteLoading(true); setInviteError(''); setInviteLink('');
    try {
      const res = await fetch('/api/invites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ case_id: caseId, lawyer_email: inviteEmail || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInviteLink(`${window.location.origin}/${locale}/invite/${data.token}`);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : (isRTL ? 'حدث خطأ' : 'Error'));
    } finally {
      setInviteLoading(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async (lawyerId: string) => {
    if (!confirm(isRTL ? 'هل تريد إلغاء صلاحية هذا المحامي؟' : 'Revoke this lawyer\'s access?')) return;
    setRevoking(lawyerId);
    try {
      const res = await fetch(`/api/cases/${caseId}/lawyers/${lawyerId}`, { method: 'DELETE' });
      if (res.ok) await loadData();
    } finally {
      setRevoking(null);
    }
  };

  if (loadingData) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="skeleton h-4 w-4 rounded" />
          <div className="skeleton h-4 w-24 rounded" />
        </div>
        <div className="space-y-2">
          <div className="skeleton h-16 w-full rounded-xl" />
          <div className="skeleton h-8 w-32 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#1A3557]" />
          {isRTL ? 'المحامي المُكلَّف' : 'Assigned Lawyer'}
        </h3>
        {hasActive && (
          <span className="badge badge-success text-[10px]">
            {isRTL ? 'وصول نشط' : 'Active Access'}
          </span>
        )}
      </div>

      {/* Active lawyers */}
      {activeLawyers.length > 0 ? (
        <div className="space-y-3">
          {activeLawyers.map((l) => {
            const lawyer = l.users;
            return (
              <div key={l.id} className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1A3557] to-[#0E7490] flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-sm font-black text-white">
                      {(lawyer?.full_name?.[0] ?? '?').toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{lawyer?.full_name ?? isRTL ? 'محامٍ' : 'Lawyer'}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{lawyer?.email}</p>
                    {lawyer?.bar_number && (
                      <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {isRTL ? 'رقم القيد: ' : 'Bar #: '}{lawyer.bar_number}
                      </p>
                    )}
                    {lawyer?.jurisdiction && (
                      <p className="text-xs text-muted-foreground">{lawyer.jurisdiction}</p>
                    )}
                  </div>
                  <button
                    onClick={() => revoke(lawyer?.id ?? '')}
                    disabled={revoking === lawyer?.id}
                    title={isRTL ? 'إلغاء الصلاحية' : 'Revoke Access'}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-2.5 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                  >
                    {revoking === lawyer?.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <ShieldOff className="h-3 w-3" />}
                    {isRTL ? 'إلغاء' : 'Revoke'}
                  </button>
                </div>

                {/* Quick action buttons */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-900/30">
                  <a href={`/${locale}/cases/${caseId}/chat`}
                    className="flex items-center gap-1.5 rounded-lg bg-[#1A3557]/10 px-3 py-1.5 text-xs font-medium text-[#1A3557] hover:bg-[#1A3557]/20 transition">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {isRTL ? 'محادثة' : 'Chat'}
                  </a>
                  <button
                    onClick={() => setShowLogs((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0E7490]/10 px-3 py-1.5 text-xs font-medium text-[#0E7490] hover:bg-[#0E7490]/20 transition"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    {isRTL ? `الإجراءات (${logs.length})` : `Actions (${logs.length})`}
                    {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  <a href={`/${locale}/lawyer/cases/${caseId}`}
                    className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {isRTL ? 'عرض بوابة المحامي' : 'Lawyer Portal View'}
                  </a>
                </div>
              </div>
            );
          })}

          {/* Action logs accordion */}
          {showLogs && (
            <div className="rounded-xl border border-border overflow-hidden animate-fade-in">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <p className="text-xs font-semibold text-foreground">
                  {isRTL ? 'سجل الإجراءات القانونية' : 'Legal Action Log'}
                </p>
              </div>
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-5">
                  {isRTL ? 'لم يُسجّل المحامي أي إجراءات بعد.' : 'No actions logged yet.'}
                </p>
              ) : (
                <div className="divide-y divide-border max-h-56 overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0E7490]/10">
                        <ClipboardList className="h-3.5 w-3.5 text-[#0E7490]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">
                            {isRTL
                              ? ACTION_LABELS[log.action_type]?.ar ?? log.action_type
                              : ACTION_LABELS[log.action_type]?.en ?? log.action_type}
                          </span>
                          <span className="text-[10px] text-muted-foreground" dir="ltr">
                            {new Date(log.action_date).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{log.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* No active lawyer — show static info from cases table or empty state */
        <div>
          {lawyerName ? (
            <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-2 mb-3">
              <p className="text-xs text-muted-foreground">{isRTL ? 'المحامي المُدخَل يدوياً:' : 'Manually entered lawyer:'}</p>
              <p className="text-sm font-semibold text-foreground">{lawyerName}</p>
              {lawyerBarNumber && <p className="text-xs text-muted-foreground" dir="ltr"># {lawyerBarNumber}</p>}
              {lawyerPhone && <p className="text-xs text-muted-foreground" dir="ltr">📱 {lawyerPhone}</p>}
              {lawyerEmail && <p className="text-xs text-muted-foreground" dir="ltr">✉️ {lawyerEmail}</p>}
              <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {isRTL ? 'لم يُفعَّل الوصول الرقمي بعد' : 'Digital access not yet activated'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <User className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground">
                {isRTL ? 'لم يُضف محامٍ بعد' : 'No lawyer linked yet'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Invite button / form */}
      {!showInvite ? (
        <button
          onClick={() => setShowInvite(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1A3557]/30 py-3 text-sm font-semibold text-[#1A3557] hover:bg-[#1A3557]/5 transition"
        >
          <UserPlus className="h-4 w-4" />
          {hasActive
            ? (isRTL ? 'إنشاء رابط دعوة جديد' : 'Generate New Invite Link')
            : (isRTL ? 'دعوة محامٍ' : 'Invite a Lawyer')}
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 animate-scale-in">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              {isRTL ? 'إنشاء رابط دعوة' : 'Generate Invite Link'}
            </p>
            <button onClick={() => { setShowInvite(false); setInviteLink(''); setInviteError(''); }}
              className="rounded-lg p-1 hover:bg-muted transition">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={isRTL ? 'البريد الإلكتروني للمحامي (اختياري)' : "Lawyer's email (optional)"}
            className="input-base text-xs py-2"
            dir="ltr"
          />

          {inviteError && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{inviteError}</p>
          )}

          {inviteLink ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="flex-1 text-[10px] font-mono text-muted-foreground truncate" dir="ltr">{inviteLink}</p>
                <button onClick={copyLink}
                  className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition shrink-0',
                    copied ? 'bg-emerald-500 text-white' : 'bg-[#1A3557] text-white hover:bg-[#1e4a7a]')}>
                  {copied ? <><Check className="h-3 w-3" />{isRTL ? 'تم' : 'Copied'}</> : <><Copy className="h-3 w-3" />{isRTL ? 'نسخ' : 'Copy'}</>}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                {isRTL ? 'الرابط صالح 7 أيام — لا يمكن استخدامه مرتين' : 'Valid 7 days · Single use only'}
              </p>
              {inviteEmail && (
                <button
                  onClick={() => window.open(`mailto:${inviteEmail}?subject=${encodeURIComponent(isRTL ? `دعوة وكيلا — ${caseTitle}` : `Wakeela Invite — ${caseTitle}`)}&body=${encodeURIComponent(inviteLink)}`)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-xs font-medium hover:bg-muted transition"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {isRTL ? 'إرسال بالبريد' : 'Send via Email'}
                </button>
              )}
            </div>
          ) : (
            <button onClick={generateInvite} disabled={inviteLoading}
              className="btn-primary w-full py-2.5 text-xs disabled:opacity-50">
              {inviteLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{isRTL ? 'جارٍ الإنشاء…' : 'Generating…'}</>
                : <><Link2 className="h-3.5 w-3.5" />{isRTL ? 'إنشاء الرابط' : 'Generate Link'}</>}
            </button>
          )}
        </div>
      )}

      {/* Revoked lawyers (collapsed) */}
      {lawyers.some((l) => l.status === 'revoked') && (
        <p className="text-[10px] text-muted-foreground/60 text-center">
          {isRTL
            ? `${lawyers.filter((l) => l.status === 'revoked').length} محامٍ تم إلغاء صلاحيتهم`
            : `${lawyers.filter((l) => l.status === 'revoked').length} lawyer(s) previously revoked`}
        </p>
      )}
    </div>
  );
}
