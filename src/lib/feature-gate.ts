import type { SubscriptionTier, TierFeature } from '@/types';
import { TIER_GATES } from '@/types';

export function canAccess(
  tier: SubscriptionTier | undefined | null,
  feature: TierFeature
): boolean {
  const safeTier = tier ?? 'basic';
  return TIER_GATES[safeTier][feature] as boolean;
}

export function getGate(tier: SubscriptionTier | undefined | null) {
  return TIER_GATES[tier ?? 'basic'];
}

// ── Storage enforcement (PRD v1.1 gap fix) ────────────────────
// Basic: 1 GB | Pro: 10 GB | Premium: 30 GB
// Uses SUM(documents.file_size) across all client-owned cases.

const GB = 1_073_741_824; // bytes per GB

/**
 * Returns total bytes used by a user across all their cases.
 * Requires a Supabase client with access to the documents table.
 */
export async function getUserStorageUsed(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  // Fetch all case IDs owned by the user
  const { data: cases } = await supabase
    .from('cases')
    .select('id')
    .eq('client_id', userId);

  if (!cases?.length) return 0;

  const caseIds = cases.map((c: { id: string }) => c.id);

  // Sum file_size for all documents across those cases
  const { data: docs } = await supabase
    .from('documents')
    .select('file_size')
    .in('case_id', caseIds);

  if (!docs?.length) return 0;

  return docs.reduce(
    (sum: number, d: { file_size: number | null }) => sum + (d.file_size ?? 0),
    0
  );
}

export interface StorageCheckResult {
  allowed:     boolean;
  bytes_used:  number;
  bytes_limit: number;
  percentage:  number;
  tier:        SubscriptionTier;
}

/**
 * Checks whether a user is within their storage quota.
 * Pass `additionalBytes` to simulate a pending upload.
 */
export async function checkStorageLimit(
  userId:          string,
  tier:            SubscriptionTier | undefined | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:        any,
  additionalBytes  = 0
): Promise<StorageCheckResult> {
  const safeTier   = tier ?? 'basic';
  const bytes_limit = TIER_GATES[safeTier].storage_gb * GB;
  const bytes_used  = await getUserStorageUsed(userId, supabase);
  const total       = bytes_used + additionalBytes;
  const percentage  = bytes_limit === 0 ? 100 : Math.round((total / bytes_limit) * 100);

  return {
    allowed:    total <= bytes_limit,
    bytes_used: total,
    bytes_limit,
    percentage: Math.min(percentage, 100),
    tier:       safeTier,
  };
}
