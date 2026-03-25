'use client';

import { useState, useEffect } from 'react';
import { User, UserPlus, Link2, MessageCircle, ClipboardList, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { InviteLawyerModal } from './invite-lawyer-modal';
import { LawyerPerformanceScoreWidget } from '@/components/lawyer/performance-score';
import { cn } from '@/lib/utils';
import type { ActionLog } from '@/types';

interface CaseLawyerPanelProps {
  caseId:      string;
  caseTitle:   string;
  locale:      string;
  lawyerName?: string;
  lawyerEmail?: string;
  lawyerPhone?: string;
  lawyerBarNumber?: string;
  hasAssignedLawyer: boolean; // true if case_lawyers row exists
}

export function CaseLawyerPanel({
  caseId, caseTitle, locale,
  lawyerName, lawyerEmail, lawyerPhone, lawyerBarNumber,
  hasAssignedLawyer,
}: CaseLawyerPanelProps) {
  const isRTL = locale === 'ar';
  const [showInvite,   setShowInvite]   = useState(false);
  const [showLogs,     setShowLogs]     = useState(false);
  const [logs,         setLogs]         = useState<ActionLog[]>([]);
  const [logsLoading,  setLogsLoading]  = useState(false);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/action-logs`);
      if (res.ok) setLogs(await res.json());
    } finally {
      setLogsLoading(false);
    }
  };

  const toggleLogs = () => {
    if (!showLogs && logs.length === 0) loadLogs();
    setShowLogs((v) => !v);
  };

  const actionTypeLabel: Record<string, string> = isRTL
    ? { court_hearing: 'جلسة', document_filed: 'مستند', client_contacted: 'تواصل', research: 'بحث', negotiation: 'مفاوضة', correspondence: 'مراسلة', other: 'أخرى' }
    : { court_hearing: 'Court', document_filed: 'Document', client_contacted: 'Contact', research: 'Research', negotiation: 'Negotiation', correspondence: 'Correspondence', other: 'Other' };

  return (
    <>
      {showInvite && (
        <InviteLawyerModal
          caseId={caseId}
          caseTitle={caseTitle}
          locale={locale}
          onClose={() => setShowInvite(false)}
        />
      )}

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <User className="h-3.5 w-3.5" />
          {isRTL ? 'المحامي' : 'Lawyer'}
        </h3>

        {lawyerName ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#1A3557]/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-[#1A3557]">
                  {lawyerName[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{lawyerName}</p>
                {lawyerBarNumber && (
                  <p className="text-xs text-muted-foreground" dir="ltr">#{lawyerBarNumber}</p>
                )}
              </div>
            </div>
            {lawyerPhone && <p className="text-xs text-muted-foreground" dir="ltr">📱 {lawyerPhone}</p>}
            {lawyerEmail && <p className="text-xs text-muted-foreground" dir="ltr">✉️ {lawyerEmail}</p>}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={`/${locale}/cases/${caseId}/chat`}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition">
                <MessageCircle className="h-3.5 w-3.5 text-[#0E7490]" />
                {isRTL ? 'محادثة' : 'Chat'}
              </a>
              <button onClick={toggleLogs}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition">
                <ClipboardList className="h-3.5 w-3.5 text-[#1A3557]" />
                {isRTL ? 'الإجراءات' : 'Actions'}
                {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <button onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition">
                <Link2 className="h-3.5 w-3.5" />
                {isRTL ? 'رابط جديد' : 'New Link'}
              </button>
            </div>

            {/* Action logs dropdown */}
            {showLogs && (
              <div className="mt-2 rounded-xl border border-border bg-muted/30 overflow-hidden">
                {logsLoading ? (
                  <div className="flex justify-center py-5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-5">
                    {isRTL ? 'لم يُسجّل المحامي أي إجراءات بعد.' : 'No actions logged yet.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {logs.slice(0, 8).map((l) => (
                      <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">
                              {actionTypeLabel[l.action_type] ?? l.action_type}
                            </span>
                            <span className="text-[10px] text-muted-foreground" dir="ltr">
                              {new Date(l.action_date).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
                                day: 'numeric', month: 'short',
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{l.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 space-y-3">
            <User className="mx-auto h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">
              {isRTL ? 'لم يُضف محامٍ بعد' : 'No lawyer linked yet'}
            </p>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 mx-auto rounded-xl bg-[#1A3557] text-white px-4 py-2 text-xs font-semibold hover:bg-[#1e4a7a] transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {isRTL ? 'دعوة محامٍ' : 'Invite Lawyer'}
            </button>
          </div>
        )}

        {/* Performance score — only shown if lawyer is assigned via case_lawyers */}
        {hasAssignedLawyer && (
          <LawyerPerformanceScoreWidget caseId={caseId} locale={locale} />
        )}
      </div>
    </>
  );
}
