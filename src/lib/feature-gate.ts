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
