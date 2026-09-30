import type { PremiumPlan } from "@/lib/subscriptions";
import type { MembershipFeature, MembershipTier } from "@/lib/economy/types";
import { hasMembershipFeature } from "@/lib/membership/membership-benefits";
import { MEMBERSHIP_TIER_RANK } from "@/lib/membership/membership-resolver";

export type PremiumFeatureKey =
  | "profile_boosts"
  | "advanced_vibes_filters"
  | "standard_gifts"
  | "signature_gifts"
  | "date_plan_initiation"
  | "date_plan_concierge"
  | "priority_support"
  | "premium_badge"
  | "elite_positioning";

export const PREMIUM_PLAN_ORDER: Record<PremiumPlan, number> = {
  FREE: 0,
  SILVER: 1,
  GOLD: 2,
};

const PREMIUM_FEATURE_POLICY_MAP: Record<PremiumFeatureKey, MembershipFeature> = {
  profile_boosts: "premium_profile_experience",
  advanced_vibes_filters: "advanced_filters",
  standard_gifts: "enhanced_premium_access",
  signature_gifts: "gold_spark_pricing",
  date_plan_initiation: "enhanced_premium_access",
  date_plan_concierge: "gold_match_night_included",
  priority_support: "enhanced_premium_access",
  premium_badge: "premium_profile_experience",
  elite_positioning: "gold_spark_pricing",
};

export const PREMIUM_FEATURE_REQUIREMENTS: Record<PremiumFeatureKey, PremiumPlan> = {
  profile_boosts: "SILVER",
  advanced_vibes_filters: "SILVER",
  standard_gifts: "SILVER",
  signature_gifts: "GOLD",
  date_plan_initiation: "SILVER",
  date_plan_concierge: "GOLD",
  priority_support: "SILVER",
  premium_badge: "SILVER",
  elite_positioning: "GOLD",
};

export function hasPlanAccess(currentPlan: PremiumPlan, requiredPlan: PremiumPlan) {
  return MEMBERSHIP_TIER_RANK[currentPlan.toLowerCase() as MembershipTier] >=
    MEMBERSHIP_TIER_RANK[requiredPlan.toLowerCase() as MembershipTier];
}

export function hasFeatureAccess(currentPlan: PremiumPlan, feature: PremiumFeatureKey) {
  return hasMembershipFeature(
    currentPlan.toLowerCase() as MembershipTier,
    PREMIUM_FEATURE_POLICY_MAP[feature],
  );
}

export function getPremiumPlanLabel(plan: PremiumPlan) {
  switch (plan) {
    case "SILVER":
      return "Silver";
    case "GOLD":
      return "Gold";
    default:
      return "Free";
  }
}
