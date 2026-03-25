import type { EscalationTemplate } from '@/types';

/* ─── Country-specific filing authorities ─────────────────────── */
export const COUNTRY_CONFIG = {
  uae: {
    nameEn:        'United Arab Emirates',
    nameAr:        'الإمارات العربية المتحدة',
    barEn:         'UAE Lawyers Syndicate',
    barAr:         'نقابة المحامين الإماراتيين',
    barAddressEn:  'Ministry of Justice, Abu Dhabi, UAE',
    barAddressAr:  'وزارة العدل، أبوظبي، الإمارات',
    barWebsite:    'https://moj.gov.ae',
    mojEn:         'UAE Ministry of Justice',
    mojAr:         'وزارة العدل الإماراتية',
    currency:      'AED',
    caseRefPrefix: 'UAE',
    courtLabel_en: 'Federal/Local Court',
    courtLabel_ar: 'محكمة اتحادية/محلية',
  },
  ksa: {
    nameEn:        'Kingdom of Saudi Arabia',
    nameAr:        'المملكة العربية السعودية',
    barEn:         'Saudi Bar Association',
    barAr:         'هيئة المحامين السعوديين',
    barAddressEn:  'Ministry of Justice, Riyadh, KSA',
    barAddressAr:  'وزارة العدل، الرياض، المملكة العربية السعودية',
    barWebsite:    'https://moj.gov.sa',
    mojEn:         'Saudi Ministry of Justice',
    mojAr:         'وزارة العدل السعودية',
    currency:      'SAR',
    caseRefPrefix: 'KSA',
    courtLabel_en: 'General/Commercial Court',
    courtLabel_ar: 'المحكمة العامة/التجارية',
  },
  kuwait: {
    nameEn:        'State of Kuwait',
    nameAr:        'دولة الكويت',
    barEn:         'Kuwait Bar Association',
    barAr:         'جمعية المحامين الكويتيين',
    barAddressEn:  'Kuwait City, State of Kuwait',
    barAddressAr:  'مدينة الكويت، دولة الكويت',
    barWebsite:    'https://moj.gov.kw',
    mojEn:         'Kuwait Ministry of Justice',
    mojAr:         'وزارة العدل الكويتية',
    currency:      'KWD',
    caseRefPrefix: 'KWT',
    courtLabel_en: 'Civil/Commercial Court',
    courtLabel_ar: 'المحكمة المدنية/التجارية',
  },
  other: {
    nameEn: 'Other Jurisdiction', nameAr: 'نطاق قضائي آخر',
    barEn: 'Relevant Bar Association', barAr: 'نقابة المحامين المختصة',
    barAddressEn: '', barAddressAr: '',
    barWebsite: '', mojEn: 'Ministry of Justice', mojAr: 'وزارة العدل',
    currency: 'USD', caseRefPrefix: 'CASE',
    courtLabel_en: 'Competent Court', courtLabel_ar: 'المحكمة المختصة',
  },
} as const;

export type CountryCode = keyof typeof COUNTRY_CONFIG;

/* ─── Template definitions ─────────────────────────────────────── */
export const ESCALATION_TEMPLATES: EscalationTemplate[] = [
  {
    key: 'formal_warning',
    titleEn: 'Formal Warning Letter',
    titleAr: 'رسالة إنذار رسمية',
    descEn: 'A formal written warning to your lawyer documenting inactivity and demanding action within a set period.',
    descAr: 'إنذار رسمي مكتوب لمحاميك يوثّق التقصير ويطالب باتخاذ إجراء خلال مدة محددة.',
    tier: 'basic',
    fields: [
      { key: 'client_name',    labelEn: 'Your full name',           labelAr: 'اسمك الكامل',            type: 'text',     required: true },
      { key: 'lawyer_name',    labelEn: "Lawyer's full name",       labelAr: 'اسم المحامي كاملاً',      type: 'text',     required: true },
      { key: 'lawyer_email',   labelEn: "Lawyer's email",           labelAr: 'بريد المحامي',             type: 'text',     required: false },
      { key: 'case_title',     labelEn: 'Case title',               labelAr: 'عنوان القضية',             type: 'text',     required: true },
      { key: 'case_number',    labelEn: 'Case/reference number',    labelAr: 'رقم القضية',               type: 'text',     required: false, placeholderEn: 'Optional', placeholderAr: 'اختياري' },
      { key: 'court_name',     labelEn: 'Court name',               labelAr: 'اسم المحكمة',              type: 'text',     required: false },
      { key: 'last_contact',   labelEn: 'Date of last contact',     labelAr: 'تاريخ آخر تواصل',          type: 'date',     required: true },
      { key: 'deadline_days',  labelEn: 'Response deadline (days)', labelAr: 'مهلة الرد (أيام)',          type: 'text',     required: true, placeholderEn: '7', placeholderAr: '7' },
      { key: 'specific_issue', labelEn: 'Specific concern',         labelAr: 'المشكلة المحددة',           type: 'textarea', required: true, placeholderEn: 'e.g. No update for 30 days, missed court date…', placeholderAr: 'مثال: لا تحديث منذ 30 يوماً، غياب عن الجلسة…' },
    ],
  },
  {
    key: 'case_summary_request',
    titleEn: 'Case Summary Request',
    titleAr: 'طلب ملخص القضية',
    descEn: 'A formal request asking your lawyer to provide a written status update on your case.',
    descAr: 'طلب رسمي لمحاميك لتزويدك بتحديث مكتوب عن حالة قضيتك.',
    tier: 'basic',
    fields: [
      { key: 'client_name',  labelEn: 'Your full name',     labelAr: 'اسمك الكامل',       type: 'text', required: true },
      { key: 'lawyer_name',  labelEn: "Lawyer's name",      labelAr: 'اسم المحامي',        type: 'text', required: true },
      { key: 'lawyer_email', labelEn: "Lawyer's email",     labelAr: 'بريد المحامي',        type: 'text', required: false },
      { key: 'case_title',   labelEn: 'Case title',         labelAr: 'عنوان القضية',        type: 'text', required: true },
      { key: 'case_number',  labelEn: 'Case number',        labelAr: 'رقم القضية',          type: 'text', required: false },
      { key: 'request_date', labelEn: 'Date of request',    labelAr: 'تاريخ الطلب',         type: 'date', required: true },
      { key: 'reply_by',     labelEn: 'Reply requested by', labelAr: 'الرد مطلوب بتاريخ',   type: 'date', required: true },
    ],
  },
  {
    key: 'fee_dispute',
    titleEn: 'Fee Dispute Letter',
    titleAr: 'رسالة نزاع الرسوم',
    descEn: 'A structured letter disputing unexplained or excessive legal fees, requesting itemised breakdown.',
    descAr: 'رسالة منظّمة للاعتراض على رسوم قانونية غير مبررة، مع طلب تفصيل المستحقات.',
    tier: 'pro',
    fields: [
      { key: 'client_name',    labelEn: 'Your full name',         labelAr: 'اسمك الكامل',          type: 'text',     required: true },
      { key: 'lawyer_name',    labelEn: "Lawyer's name",          labelAr: 'اسم المحامي',           type: 'text',     required: true },
      { key: 'lawyer_email',   labelEn: "Lawyer's email",         labelAr: 'بريد المحامي',           type: 'text',     required: false },
      { key: 'case_title',     labelEn: 'Case title',             labelAr: 'عنوان القضية',           type: 'text',     required: true },
      { key: 'invoice_amount', labelEn: 'Invoice amount',         labelAr: 'مبلغ الفاتورة',          type: 'text',     required: true, placeholderEn: 'e.g. AED 15,000', placeholderAr: '15,000 درهم' },
      { key: 'invoice_date',   labelEn: 'Invoice date',           labelAr: 'تاريخ الفاتورة',         type: 'date',     required: false },
      { key: 'dispute_reason', labelEn: 'Reason for dispute',     labelAr: 'سبب الاعتراض',           type: 'textarea', required: true },
    ],
  },
  {
    key: 'bar_complaint',
    titleEn: 'Bar Association Complaint',
    titleAr: 'شكوى نقابة المحامين',
    descEn: 'A formal complaint to submit to the relevant bar association documenting professional misconduct.',
    descAr: 'مسودة شكوى رسمية لنقابة المحامين توثّق مخالفات مهنية.',
    tier: 'pro',
    fields: [
      { key: 'client_name',   labelEn: 'Complainant full name',     labelAr: 'اسم المشتكي كاملاً',     type: 'text',     required: true },
      { key: 'client_id',     labelEn: 'ID/Passport number',        labelAr: 'رقم الهوية/الجواز',       type: 'text',     required: true },
      { key: 'client_phone',  labelEn: 'Phone number',              labelAr: 'رقم الجوال',              type: 'text',     required: false },
      { key: 'lawyer_name',   labelEn: "Lawyer's full name",        labelAr: 'اسم المحامي كاملاً',      type: 'text',     required: true },
      { key: 'bar_number',    labelEn: 'Lawyer bar number',         labelAr: 'رقم قيد المحامي',         type: 'text',     required: false },
      { key: 'case_title',    labelEn: 'Case title',                labelAr: 'عنوان القضية',            type: 'text',     required: true },
      { key: 'case_number',   labelEn: 'Case number',               labelAr: 'رقم القضية',              type: 'text',     required: false },
      { key: 'incident_date', labelEn: 'Date of incident',          labelAr: 'تاريخ الحادثة',           type: 'date',     required: true },
      { key: 'misconduct',    labelEn: 'Description of misconduct', labelAr: 'وصف المخالفة المهنية',    type: 'textarea', required: true },
      { key: 'evidence',      labelEn: 'Evidence available',        labelAr: 'الأدلة المتوفرة',         type: 'textarea', required: false, placeholderEn: 'e.g. WhatsApp records, emails, court records…', placeholderAr: 'مثال: سجلات واتسآب، بريد، سجلات المحكمة…' },
    ],
  },
  {
    key: 'moj_complaint_uae',
    titleEn: 'UAE Ministry of Justice Complaint',
    titleAr: 'شكوى وزارة العدل الإماراتية',
    descEn: 'Official complaint to the UAE Ministry of Justice against your lawyer for professional misconduct.',
    descAr: 'شكوى رسمية لوزارة العدل الإماراتية ضد محاميك بسبب مخالفات مهنية.',
    tier: 'pro',
    fields: [
      { key: 'client_name',     labelEn: 'Full name (as on Emirates ID)', labelAr: 'الاسم الكامل (كما في الهوية)', type: 'text', required: true },
      { key: 'emirates_id',     labelEn: 'Emirates ID number',            labelAr: 'رقم الهوية الإماراتية',       type: 'text', required: true, placeholderEn: '784-XXXX-XXXXXXX-X', placeholderAr: '784-XXXX-XXXXXXX-X' },
      { key: 'client_phone',    labelEn: 'UAE mobile number',             labelAr: 'رقم الجوال الإماراتي',        type: 'text', required: true, placeholderEn: '+971 5X XXX XXXX', placeholderAr: '+971 5X XXX XXXX' },
      { key: 'client_email',    labelEn: 'Email address',                 labelAr: 'البريد الإلكتروني',           type: 'text', required: true },
      { key: 'lawyer_name',     labelEn: "Lawyer's full name",            labelAr: 'اسم المحامي كاملاً',          type: 'text', required: true },
      { key: 'bar_number',      labelEn: 'UAE bar license number',        labelAr: 'رقم الترخيص المهني',          type: 'text', required: false },
      { key: 'court_name',      labelEn: 'Court name & emirate',          labelAr: 'اسم المحكمة والإمارة',        type: 'text', required: true, placeholderEn: 'e.g. Dubai Courts', placeholderAr: 'مثال: محاكم دبي' },
      { key: 'case_number',     labelEn: 'Court case number',             labelAr: 'رقم القضية في المحكمة',       type: 'text', required: false },
      { key: 'case_title',      labelEn: 'Case title',                    labelAr: 'عنوان القضية',                type: 'text', required: true },
      { key: 'violation_type',  labelEn: 'Type of violation',             labelAr: 'نوع المخالفة',                type: 'text', required: true, placeholderEn: 'e.g. Negligence / Misappropriation of funds', placeholderAr: 'مثال: إهمال / اختلاس أموال' },
      { key: 'incident_date',   labelEn: 'Date(s) of incident',           labelAr: 'تاريخ/تواريخ الحادثة',        type: 'date', required: true },
      { key: 'details',         labelEn: 'Full details of complaint',     labelAr: 'تفاصيل الشكوى كاملة',         type: 'textarea', required: true },
      { key: 'remedy_sought',   labelEn: 'Remedy / compensation sought',  labelAr: 'الإجراء / التعويض المطلوب',   type: 'textarea', required: true },
    ],
  },
  {
    key: 'moj_complaint_ksa',
    titleEn: 'Saudi Ministry of Justice Complaint',
    titleAr: 'شكوى وزارة العدل السعودية',
    descEn: 'Official complaint to the Saudi Ministry of Justice against your lawyer.',
    descAr: 'شكوى رسمية لوزارة العدل السعودية ضد محاميك.',
    tier: 'pro',
    fields: [
      { key: 'client_name',    labelEn: 'Full name (as on Iqama/ID)', labelAr: 'الاسم الكامل (كما في الهوية)', type: 'text', required: true },
      { key: 'national_id',    labelEn: 'National ID / Iqama number', labelAr: 'رقم الهوية الوطنية / الإقامة', type: 'text', required: true },
      { key: 'client_phone',   labelEn: 'Saudi mobile number',        labelAr: 'رقم الجوال السعودي',           type: 'text', required: true, placeholderEn: '+966 5X XXX XXXX', placeholderAr: '+966 5X XXX XXXX' },
      { key: 'client_email',   labelEn: 'Email address',              labelAr: 'البريد الإلكتروني',            type: 'text', required: true },
      { key: 'lawyer_name',    labelEn: "Lawyer's full name",         labelAr: 'اسم المحامي كاملاً',           type: 'text', required: true },
      { key: 'license_number', labelEn: 'Lawyer license number',      labelAr: 'رقم ترخيص المحامي',            type: 'text', required: false },
      { key: 'court_name',     labelEn: 'Court name & city',          labelAr: 'اسم المحكمة والمدينة',         type: 'text', required: true, placeholderEn: 'e.g. Commercial Court Riyadh', placeholderAr: 'مثال: المحكمة التجارية الرياض' },
      { key: 'case_number',    labelEn: 'Case number',                labelAr: 'رقم القضية',                   type: 'text', required: false },
      { key: 'case_title',     labelEn: 'Case title',                 labelAr: 'عنوان القضية',                 type: 'text', required: true },
      { key: 'incident_date',  labelEn: 'Date of incident',           labelAr: 'تاريخ الحادثة',                type: 'date', required: true },
      { key: 'details',        labelEn: 'Full complaint details',     labelAr: 'تفاصيل الشكوى',                type: 'textarea', required: true },
      { key: 'nafath_ref',     labelEn: 'Nafath / Absher reference',  labelAr: 'مرجع نفاذ / أبشر',             type: 'text', required: false },
    ],
  },
  {
    key: 'moj_complaint_kuwait',
    titleEn: 'Kuwait Bar Association Complaint',
    titleAr: 'شكوى جمعية المحامين الكويتيين',
    descEn: 'Official complaint to the Kuwait Bar Association documenting lawyer misconduct.',
    descAr: 'شكوى رسمية لجمعية المحامين الكويتيين توثّق مخالفات محاميك.',
    tier: 'pro',
    fields: [
      { key: 'client_name',   labelEn: 'Full name',               labelAr: 'الاسم الكامل',         type: 'text', required: true },
      { key: 'civil_id',      labelEn: 'Civil ID number',         labelAr: 'رقم البطاقة المدنية',  type: 'text', required: true },
      { key: 'client_phone',  labelEn: 'Kuwait mobile number',    labelAr: 'رقم الجوال الكويتي',   type: 'text', required: true, placeholderEn: '+965 XXXX XXXX', placeholderAr: '+965 XXXX XXXX' },
      { key: 'client_email',  labelEn: 'Email address',           labelAr: 'البريد الإلكتروني',    type: 'text', required: true },
      { key: 'lawyer_name',   labelEn: "Lawyer's full name",      labelAr: 'اسم المحامي كاملاً',   type: 'text', required: true },
      { key: 'bar_number',    labelEn: 'Lawyer bar number',       labelAr: 'رقم قيد المحامي',      type: 'text', required: false },
      { key: 'case_number',   labelEn: 'Case number',             labelAr: 'رقم القضية',           type: 'text', required: false },
      { key: 'case_title',    labelEn: 'Case title',              labelAr: 'عنوان القضية',         type: 'text', required: true },
      { key: 'incident_date', labelEn: 'Date of incident',        labelAr: 'تاريخ الحادثة',        type: 'date', required: true },
      { key: 'details',       labelEn: 'Full complaint details',  labelAr: 'تفاصيل الشكوى',        type: 'textarea', required: true },
    ],
  },
];

export function getTemplate(key: string): EscalationTemplate | undefined {
  return ESCALATION_TEMPLATES.find((t) => t.key === key);
}

/* ─── Letter body builders ──────────────────────────────────────── */
export function buildLetterBody(
  template: EscalationTemplate,
  fields: Record<string, string>,
  locale: 'en' | 'ar',
  country: CountryCode = 'uae',
): string {
  const isAr  = locale === 'ar';
  const cc    = COUNTRY_CONFIG[country];
  const today = new Date().toLocaleDateString(isAr ? 'ar-AE' : 'en-AE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const headerEn = (subjectEn: string) => [
    `Date: ${today}`,
    fields.case_number ? `Case Reference: ${fields.case_number}` : '',
    ``,
    `To: ${fields.lawyer_name ?? cc.barEn}`,
    fields.court_name ? `Court: ${fields.court_name}` : '',
    ``,
    `Re: ${subjectEn}`,
    ``,
    `I, ${fields.client_name}, hereby submit the following:`,
    ``,
  ].filter(l => l !== undefined).join('\n');

  const headerAr = (subjectAr: string) => [
    `التاريخ: ${today}`,
    fields.case_number ? `رقم القضية: ${fields.case_number}` : '',
    ``,
    `إلى: ${fields.lawyer_name ?? cc.barAr}`,
    fields.court_name ? `المحكمة: ${fields.court_name}` : '',
    ``,
    `الموضوع: ${subjectAr}`,
    ``,
    `أنا ${fields.client_name}، أتقدم بما يلي:`,
    ``,
  ].filter(l => l !== undefined).join('\n');

  const footer_en = `\n\nYours sincerely,\n${fields.client_name}${fields.client_phone ? `\nPhone: ${fields.client_phone}` : ''}${fields.client_email ? `\nEmail: ${fields.client_email}` : ''}\n\n---\nGenerated by Wakeela Platform · Not legal advice · ${new Date().toISOString().split('T')[0]}`;
  const footer_ar = `\n\nمقدمه بكل احترام،\n${fields.client_name}${fields.client_phone ? `\nهاتف: ${fields.client_phone}` : ''}${fields.client_email ? `\nبريد: ${fields.client_email}` : ''}\n\n---\nأُنشئ بواسطة منصة وكيلا · وكيلا لا تقدم استشارات قانونية · ${new Date().toISOString().split('T')[0]}`;

  switch (template.key) {
    case 'formal_warning':
      return isAr
        ? `${headerAr(`إنذار رسمي — القضية: ${fields.case_title}`)}\nمنذ تاريخ ${fields.last_contact} لم يكن هناك أي تواصل أو تحديث بشأن القضية المذكورة.\n\nالمشكلة المحددة:\n${fields.specific_issue}\n\nأطالبكم بالرد واتخاذ الإجراء المناسب خلال ${fields.deadline_days ?? '7'} أيام. وإلا سأضطر إلى اللجوء إلى ${cc.barAr} واتخاذ الإجراءات القانونية اللازمة.${footer_ar}`
        : `${headerEn(`Formal Warning — Case: ${fields.case_title}`)}\nSince ${fields.last_contact}, there has been no communication or update regarding the above case.\n\nSpecific Concern:\n${fields.specific_issue}\n\nI demand a response and appropriate action within ${fields.deadline_days ?? '7'} days. Failure to comply may result in a formal complaint to the ${cc.barEn} and further legal action.${footer_en}`;

    case 'case_summary_request':
      return isAr
        ? `${headerAr(`طلب ملخص حالة القضية: ${fields.case_title}`)}\nأطلب منكم رسمياً تزويدي بتقرير مكتوب شامل عن الوضع الراهن للقضية.\n\nأرجو الرد بحلول تاريخ: ${fields.reply_by}${footer_ar}`
        : `${headerEn(`Case Status Summary Request — ${fields.case_title}`)}\nI formally request a comprehensive written status update on the above case.\n\nKindly provide the requested summary by: ${fields.reply_by}${footer_en}`;

    case 'fee_dispute':
      return isAr
        ? `${headerAr(`اعتراض على الرسوم القانونية — القضية: ${fields.case_title}`)}\nأتقدم باعتراض رسمي على الفاتورة${fields.invoice_date ? ` بتاريخ ${fields.invoice_date}` : ''} بمبلغ ${fields.invoice_amount}.\n\nسبب الاعتراض:\n${fields.dispute_reason}\n\nأطالب بتفصيل كامل ومُسبَّب لجميع المستحقات خلال 14 يوم عمل. وفي حال عدم الرد، سأتخذ الإجراءات اللازمة بما فيها الإبلاغ عن هذه المخالفة لـ${cc.barAr}.${footer_ar}`
        : `${headerEn(`Fee Dispute — Case: ${fields.case_title}`)}\nI hereby formally dispute the invoice${fields.invoice_date ? ` dated ${fields.invoice_date}` : ''} of ${fields.invoice_amount}.\n\nGrounds for Dispute:\n${fields.dispute_reason}\n\nI request a full itemised breakdown within 14 business days. Failure to respond may result in a formal report to the ${cc.barEn}.${footer_en}`;

    case 'bar_complaint':
      return isAr
        ? `${headerAr(`شكوى رسمية ضد المحامي ${fields.lawyer_name}`)}\nالشاكي: ${fields.client_name}${fields.client_id ? ` — رقم الهوية: ${fields.client_id}` : ''}\nالمحامي: ${fields.lawyer_name}${fields.bar_number ? ` — رقم القيد: ${fields.bar_number}` : ''}\nالقضية: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nتاريخ الحادثة: ${fields.incident_date}\n\nوصف المخالفة المهنية:\n${fields.misconduct}${fields.evidence ? `\n\nالأدلة المتوفرة:\n${fields.evidence}` : ''}\n\nأطلب من نقابتكم الموقرة التحقيق في هذه المخالفات واتخاذ الإجراءات التأديبية المناسبة.${footer_ar}`
        : `${headerEn(`Formal Complaint Against ${fields.lawyer_name}`)}\nComplainant: ${fields.client_name}${fields.client_id ? ` — ID: ${fields.client_id}` : ''}\nRespondent: ${fields.lawyer_name}${fields.bar_number ? ` — Bar No: ${fields.bar_number}` : ''}\nCase: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nDate of Incident: ${fields.incident_date}\n\nDescription of Misconduct:\n${fields.misconduct}${fields.evidence ? `\n\nEvidence Available:\n${fields.evidence}` : ''}\n\nI respectfully request that the Bar Association investigate this matter and take appropriate disciplinary action.${footer_en}`;

    case 'moj_complaint_uae':
      return isAr
        ? `إلى: وزارة العدل الإماراتية — إدارة شؤون المحامين\n${cc.barAddressAr}\nالتاريخ: ${today}\n\nالموضوع: شكوى رسمية ضد المحامي ${fields.lawyer_name}\n\nأنا ${fields.client_name}، رقم الهوية الإماراتية: ${fields.emirates_id}، أتقدم بهذه الشكوى الرسمية.\n\nبيانات المحامي المشتكى عليه:\nالاسم: ${fields.lawyer_name}${fields.bar_number ? `\nرقم القيد: ${fields.bar_number}` : ''}\n\nالقضية: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nالمحكمة: ${fields.court_name}\nتاريخ الحادثة: ${fields.incident_date}\n\nنوع المخالفة: ${fields.violation_type}\n\nتفاصيل الشكوى:\n${fields.details}\n\nالإجراء والتعويض المطلوب:\n${fields.remedy_sought}\n\nأُرفق بهذه الشكوى جميع المستندات الداعمة المتاحة من منصة وكيلا للتوثيق.\n\nمقدمه بكل احترام،\n${fields.client_name}\nهاتف: ${fields.client_phone}\nبريد: ${fields.client_email}${footer_ar}`
        : `To: UAE Ministry of Justice — Legal Affairs Department\n${cc.barAddressEn}\nDate: ${today}\n\nRe: Formal Complaint Against Lawyer ${fields.lawyer_name}\n\nI, ${fields.client_name}, Emirates ID: ${fields.emirates_id}, hereby submit this formal complaint.\n\nRespondent Lawyer Details:\nName: ${fields.lawyer_name}${fields.bar_number ? `\nBar License: ${fields.bar_number}` : ''}\n\nCase: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nCourt: ${fields.court_name}\nDate of Incident: ${fields.incident_date}\n\nType of Violation: ${fields.violation_type}\n\nFull Complaint Details:\n${fields.details}\n\nRemedy / Compensation Sought:\n${fields.remedy_sought}\n\nAll supporting documentation from the Wakeela platform is attached.\n\nRespectfully submitted,\n${fields.client_name}\nPhone: ${fields.client_phone}\nEmail: ${fields.client_email}${footer_en}`;

    case 'moj_complaint_ksa':
      return isAr
        ? `إلى: وزارة العدل — المملكة العربية السعودية\nالتاريخ: ${today}\n\nالموضوع: شكوى رسمية ضد المحامي ${fields.lawyer_name}\n\nمقدم الشكوى: ${fields.client_name}\nرقم الهوية: ${fields.national_id}\nالجوال: ${fields.client_phone}\nالبريد: ${fields.client_email}\n\nالمحامي: ${fields.lawyer_name}${fields.license_number ? ` — رقم الترخيص: ${fields.license_number}` : ''}\nالمحكمة: ${fields.court_name}\nالقضية: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nتاريخ الحادثة: ${fields.incident_date}\n${fields.nafath_ref ? `\nمرجع نفاذ: ${fields.nafath_ref}` : ''}\n\nتفاصيل الشكوى:\n${fields.details}\n\nأطلب من وزارة العدل الموقرة التحقيق في هذا الأمر واتخاذ الإجراءات اللازمة.${footer_ar}`
        : `To: Saudi Ministry of Justice\nDate: ${today}\n\nRe: Formal Complaint Against Lawyer ${fields.lawyer_name}\n\nComplainant: ${fields.client_name}\nID Number: ${fields.national_id}\nPhone: ${fields.client_phone}\nEmail: ${fields.client_email}\n\nLawyer: ${fields.lawyer_name}${fields.license_number ? ` — License: ${fields.license_number}` : ''}\nCourt: ${fields.court_name}\nCase: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nDate of Incident: ${fields.incident_date}\n${fields.nafath_ref ? `\nNafath Reference: ${fields.nafath_ref}` : ''}\n\nComplaint Details:\n${fields.details}\n\nI respectfully request the Ministry to investigate this matter.${footer_en}`;

    case 'moj_complaint_kuwait':
      return isAr
        ? `إلى: جمعية المحامين الكويتيين\nالتاريخ: ${today}\n\nالموضوع: شكوى رسمية ضد المحامي ${fields.lawyer_name}\n\nمقدم الشكوى: ${fields.client_name}\nرقم البطاقة المدنية: ${fields.civil_id}\nالجوال: ${fields.client_phone}\nالبريد: ${fields.client_email}\n\nالمحامي: ${fields.lawyer_name}${fields.bar_number ? ` — رقم القيد: ${fields.bar_number}` : ''}\nالقضية: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nتاريخ الحادثة: ${fields.incident_date}\n\nتفاصيل الشكوى:\n${fields.details}${footer_ar}`
        : `To: Kuwait Bar Association\nDate: ${today}\n\nRe: Formal Complaint Against Lawyer ${fields.lawyer_name}\n\nComplainant: ${fields.client_name}\nCivil ID: ${fields.civil_id}\nPhone: ${fields.client_phone}\nEmail: ${fields.client_email}\n\nLawyer: ${fields.lawyer_name}${fields.bar_number ? ` — Bar No: ${fields.bar_number}` : ''}\nCase: ${fields.case_title}${fields.case_number ? ` (${fields.case_number})` : ''}\nDate of Incident: ${fields.incident_date}\n\nComplaint Details:\n${fields.details}${footer_en}`;

    default:
      return '';
  }
}
