export type DataRegion = 'uae' | 'ksa' | 'eu';
export type UserRole = 'client' | 'lawyer' | 'admin';
export type SubscriptionTier = 'basic' | 'pro' | 'premium';
export type Locale = 'ar' | 'en';
export type CaseStatus = 'active' | 'closed' | 'archived';
export type CaseType = 'employment' | 'family' | 'commercial' | 'property' | 'criminal' | 'other';
export type DeadlineType = 'court' | 'submission' | 'internal';
export type DeadlineStatus = 'pending' | 'completed' | 'missed';
export type NDESeverity = 'low' | 'medium' | 'high' | 'critical';
export type NDERuleId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Currency = 'AED' | 'SAR' | 'KWD' | 'USD';

export interface WakeelaUser {
  id: string;
  email: string;
  phone?: string;
  full_name: string;
  role: UserRole;
  locale: Locale;
  timezone: string;
  data_region: DataRegion;
  subscription_tier: SubscriptionTier;
  hijri_calendar: boolean;   // PRD §7.1 — show Hijri dates alongside Gregorian
  avatar_url?: string;
  created_at: string;
}

export interface Case {
  id: string;
  client_id: string;
  title: string;
  case_type: CaseType;
  jurisdiction?: string;
  status: CaseStatus;
  health_score: number;
  lawyer_name?: string;
  lawyer_bar_number?: string;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  actor_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  is_system_generated: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  case_id: string;
  uploader_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  version: number;
  label?: string;
  created_at: string;
}

export interface Deadline {
  id: string;
  case_id: string;
  title: string;
  due_date: string;
  type: DeadlineType;
  reminder_days: number[];
  status: DeadlineStatus;
  created_by: string;
  created_at: string;
}

export interface NDEFlag {
  id: string;
  case_id: string;
  rule_id: NDERuleId;
  triggered_at: string;
  severity: NDESeverity;
  resolved_at?: string;
  resolved_by?: string;
  action_taken?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id?: string;
  tier: SubscriptionTier;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_end: string;
  currency: Currency;
  created_at: string;
}

export const REGION_CONFIG: Record<
  DataRegion,
  { label: string; labelAr: string; flag: string; description: string; descriptionAr: string }
> = {
  uae: {
    label: 'UAE North',
    labelAr: '\u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a \u0627\u0644\u0634\u0645\u0627\u0644\u064a\u0629',
    flag: '\uD83C\uDDE6\uD83C\uDDEA',
    description: 'UAE PDPL compliant',
    descriptionAr: '\u0645\u062a\u0648\u0627\u0641\u0642 \u0645\u0639 \u0642\u0627\u0646\u0648\u0646 \u062d\u0645\u0627\u064a\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a\u064a',
  },
  ksa: {
    label: 'Saudi Central',
    labelAr: '\u0648\u0633\u0637 \u0627\u0644\u0645\u0645\u0644\u0643\u0629',
    flag: '\uD83C\uDDF8\uD83C\uDDE6',
    description: 'Saudi PDPL compliant',
    descriptionAr: '\u0645\u062a\u0648\u0627\u0641\u0642 \u0645\u0639 \u0646\u0638\u0627\u0645 \u062d\u0645\u0627\u064a\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0633\u0639\u0648\u062f\u064a',
  },
  eu: {
    label: 'EU (Frankfurt)',
    labelAr: '\u0623\u0648\u0631\u0648\u0628\u0627 (\u0641\u0631\u0627\u0646\u0643\u0641\u0648\u0631\u062a)',
    flag: '\uD83C\uDDEA\uD83C\uDDFA',
    description: 'GDPR compliant',
    descriptionAr: '\u0645\u062a\u0648\u0627\u0641\u0642 \u0645\u0639 \u0627\u0644\u0644\u0627\u0626\u062d\u0629 \u0627\u0644\u0623\u0648\u0631\u0648\u0628\u064a\u0629 GDPR',
  },
};

// ── Phase 2: Lawyer Layer ──────────────────────────────────────

export type InviteStatus   = 'pending' | 'accepted' | 'revoked' | 'expired';
export type CaseLawyerStatus = 'active' | 'revoked';
export type ActionType =
  | 'court_hearing'
  | 'document_filed'
  | 'client_contacted'
  | 'research'
  | 'negotiation'
  | 'correspondence'
  | 'document_request'   // PRD Rule 5: lawyer requests a document from client
  | 'other';

export interface LawyerInvite {
  id:           string;
  case_id:      string;
  created_by:   string;
  token:        string;
  lawyer_email?: string;
  status:       InviteStatus;
  expires_at:   string;
  accepted_by?: string;
  accepted_at?: string;
  created_at:   string;
}

export interface CaseLawyer {
  id:         string;
  case_id:    string;
  lawyer_id:  string;
  invited_by: string;
  status:     CaseLawyerStatus;
  created_at: string;
  // joined
  lawyer?: WakeelaUser;
}

export interface ActionLog {
  id:          string;
  case_id:     string;
  lawyer_id:   string;
  action_type: ActionType;
  description: string;
  action_date: string;
  created_at:  string;
  // joined
  lawyer?: Pick<WakeelaUser, 'id' | 'full_name'>;
}

// ChatMessage moved to Phase 2A enhanced version below

export interface LawyerPerformanceScore {
  total:            number;  // 0–100
  activity:         number;  // logs per 7 days
  recency:          number;  // days since last log
  deadline_respect: number;  // % of deadlines logged before due
  responsiveness:   number;  // hours to first log after case created
  logs_count:       number;
  last_activity?:   string;
}

// ── Phase 3: Escalation + Notifications + Billing ─────────────

export type NotificationType =
  | 'nde_flag' | 'deadline_reminder' | 'lawyer_joined'
  | 'lawyer_action' | 'chat_message' | 'escalation_sent'
  | 'subscription_updated' | 'system'
  | 'invoice_issued' | 'invoice_paid' | 'invoice_overdue';

export interface AppNotification {
  id:         string;
  user_id:    string;
  case_id?:   string;
  type:       NotificationType;
  title:      string;
  body?:      string;
  read_at?:   string;
  action_url?: string;
  created_at: string;
}

export type EscalationTemplateKey =
  | 'formal_warning'
  | 'bar_complaint'
  | 'case_summary_request'
  | 'fee_dispute'
  | 'moj_complaint_uae'
  | 'moj_complaint_ksa'
  | 'moj_complaint_kuwait';

export interface EscalationTemplate {
  key:         EscalationTemplateKey;
  titleEn:     string;
  titleAr:     string;
  descEn:      string;
  descAr:      string;
  tier:        SubscriptionTier;   // minimum tier required
  fields:      EscalationField[];
}

export interface EscalationField {
  key:          string;
  labelEn:      string;
  labelAr:      string;
  type:         'text' | 'textarea' | 'date';
  required:     boolean;
  placeholderEn?: string;
  placeholderAr?: string;
}

export interface EscalationDraft {
  id:           string;
  case_id:      string;
  user_id:      string;
  template_key: EscalationTemplateKey;
  fields:       Record<string, string>;
  status:       'draft' | 'sent' | 'downloaded';
  sent_at?:     string;
  created_at:   string;
  updated_at:   string;
}

// ── Subscription feature gates ─────────────────────────────────
// PRD v1.1: Basic tier upgraded to 3 active cases + 1 GB storage
// (previously 1 case + 500 MB — corrected here per gap analysis Task 1)
export const TIER_GATES = {
  basic: {
    max_cases:         3,          // PRD v1.1: was 1, now 3
    max_docs:          5,
    storage_gb:        1,          // 1 GB storage cap
    whatsapp:          false,
    escalation:        false,
    lawyer_invite:     false,
    chat:              false,
    vault:             false,
    voice_queries_day: 5,
    voice_tts:         false,      // browser TTS only
  },
  pro: {
    max_cases:         10,
    max_docs:          50,
    storage_gb:        10,         // 10 GB storage cap
    whatsapp:          true,
    escalation:        true,
    lawyer_invite:     true,
    chat:              true,
    vault:             true,
    voice_queries_day: 50,
    voice_tts:         true,       // high-quality TTS
  },
  premium: {
    max_cases:         Infinity,
    max_docs:          Infinity,
    storage_gb:        30,         // 30 GB storage cap
    whatsapp:          true,
    escalation:        true,
    lawyer_invite:     true,
    chat:              true,
    vault:             true,
    voice_queries_day: Infinity,
    voice_tts:         true,
  },
} as const satisfies Record<SubscriptionTier, {
  max_cases: number; max_docs: number; storage_gb: number; whatsapp: boolean;
  escalation: boolean; lawyer_invite: boolean; chat: boolean; vault: boolean;
  voice_queries_day: number; voice_tts: boolean;
}>;

export type TierFeature = keyof (typeof TIER_GATES)['basic'];

// Stripe price IDs — set these in env vars, referenced here for type safety
export interface StripePlan {
  tier:       SubscriptionTier;
  priceIdMonthly: string;
  priceIdAnnual:  string;
  usd: { monthly: number; annual: number };
  aed: { monthly: number; annual: number };
}

// ── Phase 2A: Enhanced Chat ────────────────────────────────────

export type MessageType = 'text' | 'attachment' | 'system';

export interface ChatMessage {
  id:                string;
  case_id:           string;
  sender_id:         string;
  content:           string;
  content_encrypted?: string;
  is_encrypted:      boolean;
  message_type:      MessageType;
  attachment_doc_id?: string;
  attachment_name?:  string;
  attachment_size?:  number;
  read_at?:          string;
  edited_at?:        string;
  deleted_at?:       string;
  created_at:        string;
  // joined
  sender?: {
    id:        string;
    full_name: string;
    role:      string;
  };
}

export interface ChatParticipant {
  id:          string;
  full_name:   string;
  role:        'client' | 'lawyer' | 'admin';
  status:      'active' | 'not_joined' | 'revoked';
  last_seen?:  string;
}

export interface VaultDocument {
  id:        string;
  file_name: string;
  file_size: number;
  file_hash: string;
  mime_type?: string;
  created_at: string;
}

// ── Invoice System ─────────────────────────────────────────────────

export type InvoiceStatus =
  | 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';

export type InvoiceItemType = 'professional_service' | 'disbursement';

export interface InvoiceItem {
  id:             string;
  invoice_id:     string;
  item_type:      InvoiceItemType;
  sort_order:     number;
  action_log_id?: string;
  item_date:      string;
  description:    string;
  hours?:         number;
  rate?:          number;
  quantity:       number;
  unit_cost:      number;
  amount:         number;
  receipts?:      DisbursementReceipt[];
}

export interface DisbursementReceipt {
  id:              string;
  invoice_item_id: string;
  uploaded_by:     string;
  file_path:       string;
  file_name:       string;
  file_size?:      number;
  created_at:      string;
}

export interface Invoice {
  id:                     string;
  case_id:                string;
  lawyer_id:              string;
  client_id:              string;
  invoice_number:         string;
  invoice_date:           string;
  due_date:               string;
  jofotara_ref?:          string;
  tax_id?:                string;
  tax_rate:               number;
  matter_description:     string;
  subtotal_services:      number;
  subtotal_disbursements: number;
  tax_amount:             number;
  total_amount:           number;
  currency:               string;
  retainer_applied:       number;
  retainer_balance:       number;
  status:                 InvoiceStatus;
  payment_method?:        string;
  payment_reference?:     string;
  paid_at?:               string;
  payment_proof_path?:    string;
  notes?:                 string;
  late_payment_rate?:     number;
  sent_at?:               string;
  viewed_at?:             string;
  created_at:             string;
  updated_at:             string;
  // Joined
  items?:                 InvoiceItem[];
  lawyer?:                Pick<WakeelaUser, 'id' | 'full_name' | 'email' | 'phone'>;
  client?:                Pick<WakeelaUser, 'id' | 'full_name' | 'email' | 'phone'>;
  case?:                  Pick<Case, 'id' | 'title' | 'case_type' | 'jurisdiction'>;
}

