import type {
  MembershipBenefits,
  MembershipFeature,
  MembershipTier,
} from '@/lib/economy/types';

const FREE_FEATURES: MembershipFeature[] = [
  'base_discovery',
  'matching',
  'matched_messaging',
  'mutual_communication',
  'base_live_access',
  'limited_insights',
];

const SILVER_FEATURES: MembershipFeature[] = [
  ...FREE_FEATURES,
  'premium_profile_experience',
  'full_profile_insights',
  'advanced_filters',
  'enhanced_premium_access',
  'membership_spark_pricing',
];

const GOLD_FEATURES: MembershipFeature[] = [
  ...SILVER_FEATURES,
  'gold_spark_pricing',
  'gold_match_night_included',
];

export const MEMBERSHIP_BENEFITS: Readonly<Record<MembershipTier, MembershipBenefits>> = {
  free: {
    tier: 'free',
    features: new Set(FREE_FEATURES),
    monthlyMemberSparks: 0,
    monthlyProfileBoostAllowance: 0,
    firstEligibleMatchNightEntryIncluded: false,
  },
  silver: {
    tier: 'silver',
    features: new Set(SILVER_FEATURES),
    monthlyMemberSparks: 150,
    monthlyProfileBoostAllowance: 1,
    firstEligibleMatchNightEntryIncluded: false,
  },
  gold: {
    tier: 'gold',
    features: new Set(GOLD_FEATURES),
    monthlyMemberSparks: 150,
    monthlyProfileBoostAllowance: 2,
    firstEligibleMatchNightEntryIncluded: true,
  },
};

export function getMembershipBenefits(tier: MembershipTier): MembershipBenefits {
  return MEMBERSHIP_BENEFITS[tier];
}

export function hasMembershipFeature(
  tier: MembershipTier,
  feature: MembershipFeature,
): boolean {
  return MEMBERSHIP_BENEFITS[tier].features.has(feature);
}
