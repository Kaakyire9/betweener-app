import type { PremiumPlan } from "@/lib/subscriptions";

export type PremiumFeatureKey =
  | "profile_boosts"
  | "advanced_vibes_filters"
  | "profile_notes"
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

export const PREMIUM_FEATURE_REQUIREMENTS: Record<PremiumFeatureKey, PremiumPlan> = {
  profile_boosts: "SILVER",
  advanced_vibes_filters: "SILVER",
  profile_notes: "SILVER",
  standard_gifts: "SILVER",
  signature_gifts: "GOLD",
  date_plan_initiation: "SILVER",
  date_plan_concierge: "GOLD",
  priority_support: "SILVER",
  premium_badge: "SILVER",
  elite_positioning: "GOLD",
};

export function hasPlanAccess(currentPlan: PremiumPlan, requiredPlan: PremiumPlan) {
  return PREMIUM_PLAN_ORDER[currentPlan] >= PREMIUM_PLAN_ORDER[requiredPlan];
}

export function hasFeatureAccess(currentPlan: PremiumPlan, feature: PremiumFeatureKey) {
  return hasPlanAccess(currentPlan, PREMIUM_FEATURE_REQUIREMENTS[feature]);
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
