import type { MembershipTier } from '@/lib/economy/types';

export type RevenueCatCustomerInfoLike = {
  entitlements?: {
    active?: Record<string, { isActive?: boolean; productIdentifier?: string | null }>;
  };
  activeSubscriptions?: string[];
};

export type MembershipResolution = {
  tier: MembershipTier;
  source: 'entitlement' | 'legacy_product' | 'none';
};

export function getMembershipTier(customerInfo: RevenueCatCustomerInfoLike | null): MembershipTier {
  const active = customerInfo?.entitlements?.active ?? {};
  if (active.gold && active.gold.isActive !== false) return 'gold';
  if (active.silver && active.silver.isActive !== false) return 'silver';
  return 'free';
}

export function resolveLegacyMembershipTierFromProducts(
  customerInfo: RevenueCatCustomerInfoLike | null,
  productHints: { silver: string; gold: string },
): MembershipTier {
  const products = customerInfo?.activeSubscriptions ?? [];
  const normalized = products.map((productId) => productId.toLowerCase());
  const goldHint = productHints.gold.trim().toLowerCase();
  const silverHint = productHints.silver.trim().toLowerCase();
  if (goldHint && normalized.some((productId) => productId.includes(goldHint))) return 'gold';
  if (silverHint && normalized.some((productId) => productId.includes(silverHint))) return 'silver';
  return 'free';
}

export function resolveMembershipTier(
  customerInfo: RevenueCatCustomerInfoLike | null,
  options?: {
    allowLegacyProductFallback?: boolean;
    legacyProductHints?: { silver: string; gold: string };
  },
): MembershipResolution {
  const entitlementTier = getMembershipTier(customerInfo);
  if (entitlementTier !== 'free') return { tier: entitlementTier, source: 'entitlement' };

  if (options?.allowLegacyProductFallback && options.legacyProductHints) {
    const legacyTier = resolveLegacyMembershipTierFromProducts(
      customerInfo,
      options.legacyProductHints,
    );
    if (legacyTier !== 'free') return { tier: legacyTier, source: 'legacy_product' };
  }

  return { tier: 'free', source: 'none' };
}

export const MEMBERSHIP_TIER_RANK: Readonly<Record<MembershipTier, number>> = {
  free: 0,
  silver: 1,
  gold: 2,
};

export function resolveEffectiveMembershipTier(args: {
  authoritativeRevenueCatTier: MembershipTier;
  mirroredSupabaseTier: MembershipTier;
  preserveProductionMirrorPromotion: boolean;
}): MembershipTier {
  if (!args.preserveProductionMirrorPromotion) return args.authoritativeRevenueCatTier;
  return MEMBERSHIP_TIER_RANK[args.mirroredSupabaseTier] >=
    MEMBERSHIP_TIER_RANK[args.authoritativeRevenueCatTier]
    ? args.mirroredSupabaseTier
    : args.authoritativeRevenueCatTier;
}
