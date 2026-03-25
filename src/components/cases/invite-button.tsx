'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { InviteDialog } from './invite-dialog';

interface InviteButtonProps {
  caseId:    string;
  caseTitle: string;
  locale:    string;
}

export function InviteButton({ caseId, caseTitle, locale }: InviteButtonProps) {
  const isRTL  = locale === 'ar';
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-xl border border-[#1A3557]/30 bg-[#1A3557]/5 px-4 py-2.5 text-xs font-semibold text-[#1A3557] dark:text-blue-300 hover:bg-[#1A3557]/10 transition"
      >
        <UserPlus className="h-4 w-4" />
        {isRTL ? 'دعوة محامٍ' : 'Invite Lawyer'}
      </button>

      <InviteDialog
        caseId={caseId}
        caseTitle={caseTitle}
        locale={locale}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
