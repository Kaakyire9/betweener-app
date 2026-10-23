import { useAuth } from "@/lib/auth-context";
import { hasPlanAccess } from "@/lib/premium-access";
import { supabase } from "@/lib/supabase";
import type { MembershipTier } from "@/lib/economy/types";
import {
  getMembershipBenefits,
  hasMembershipFeature,
} from "@/lib/membership/membership-benefits";
import {
  MEMBERSHIP_TIER_RANK,
  resolveEffectiveMembershipTier,
} from "@/lib/membership/membership-resolver";
import { logger } from "@/lib/telemetry/logger";
import {
  PremiumPlan,
  derivePlanFromCustomerInfo,
  getPlanEndsAtFromCustomerInfo,
  loadRevenueCatState,
  subscribeToRevenueCatCustomerInfo,
} from "@/lib/subscriptions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerInfo, PurchasesOfferings } from "react-native-purchases";

type PremiumStatePayload = {
  plan?: PremiumPlan | null;
  is_active?: boolean | null;
  started_at?: string | null;
  ends_at?: string | null;
  has_active_boost?: boolean | null;
  active_boost_ends_at?: string | null;
};

const EMPTY_STATE: Required<PremiumStatePayload> = {
  plan: "FREE",
  is_active: false,
  started_at: null,
  ends_at: null,
  has_active_boost: false,
  active_boost_ends_at: null,
};

const toMembershipTier = (plan: PremiumPlan): MembershipTier => plan.toLowerCase() as MembershipTier;
const toPremiumPlan = (tier: MembershipTier): PremiumPlan => tier.toUpperCase() as PremiumPlan;
const productionAuthorityCompatibilityEnabled = () =>
  String(process.env.EXPO_PUBLIC_ENVIRONMENT || "").trim().toLowerCase() === "production";

function normalizePremiumState(payload: unknown) {
  const value = (payload ?? {}) as PremiumStatePayload;
  const plan: PremiumPlan = value.plan === "SILVER" || value.plan === "GOLD" ? value.plan : "FREE";
  return {
    plan,
    is_active: Boolean(value.is_active),
    started_at: value.started_at ?? null,
    ends_at: value.ends_at ?? null,
    has_active_boost: Boolean(value.has_active_boost),
    active_boost_ends_at: value.active_boost_ends_at ?? null,
  };
}

export function useMembership() {
  const { user } = useAuth();
  const [serverState, setServerState] = useState(EMPTY_STATE);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [billingReady, setBillingReady] = useState(false);
  const [billingSupported, setBillingSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setServerState(EMPTY_STATE);
      setCustomerInfo(null);
      setOfferings(null);
      setBillingReady(false);
      setBillingSupported(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [premiumStateResult, revenueCatResult] = await Promise.allSettled([
        supabase.rpc("rpc_get_my_premium_state"),
        loadRevenueCatState({
          appUserID: user.id,
        }),
      ]);

      if (premiumStateResult.status === "fulfilled") {
        if (premiumStateResult.value.error) setError(premiumStateResult.value.error.message);
        setServerState(normalizePremiumState(premiumStateResult.value.data));
      } else {
        setServerState(EMPTY_STATE);
        setError("Unable to load the membership mirror.");
      }

      if (revenueCatResult.status === "fulfilled") {
        const revenueCatState = revenueCatResult.value;
        setCustomerInfo(revenueCatState.customerInfo);
        setOfferings(revenueCatState.offerings);
        setBillingReady(revenueCatState.enabled);
        setBillingSupported(revenueCatState.canMakePayments);
      } else {
        setCustomerInfo(null);
        setOfferings(null);
        setBillingReady(false);
        setBillingSupported(false);
        setError("Membership purchasing is temporarily unavailable.");
        logger.warn("economy.config.failed", { area: "membership_offering" });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load premium state.");
      setServerState(EMPTY_STATE);
      setCustomerInfo(null);
      setOfferings(null);
      setBillingReady(false);
      setBillingSupported(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribeToRevenueCatCustomerInfo(setCustomerInfo), []);

  const revenueCatPlan = useMemo(() => derivePlanFromCustomerInfo(customerInfo), [customerInfo]);
  const authoritativeRevenueCatTier = useMemo(
    () => toMembershipTier(revenueCatPlan),
    [revenueCatPlan],
  );
  const mirroredSupabaseTier = useMemo(
    () => toMembershipTier(serverState.plan),
    [serverState.plan],
  );
  const effectiveTier = useMemo<MembershipTier>(() => {
    return resolveEffectiveMembershipTier({
      authoritativeRevenueCatTier,
      mirroredSupabaseTier,
      preserveProductionMirrorPromotion: productionAuthorityCompatibilityEnabled(),
    });
  }, [authoritativeRevenueCatTier, mirroredSupabaseTier]);
  const currentPlan = useMemo(() => {
    return toPremiumPlan(effectiveTier);
  }, [effectiveTier]);
  const currentPlanEndsAt = useMemo(() => {
    if (currentPlan === "FREE") return null;
    const revenueCatPlanEndsAt = getPlanEndsAtFromCustomerInfo(customerInfo, revenueCatPlan);

    if (!productionAuthorityCompatibilityEnabled()) return revenueCatPlanEndsAt;

    if (MEMBERSHIP_TIER_RANK[authoritativeRevenueCatTier] >= MEMBERSHIP_TIER_RANK[mirroredSupabaseTier]) {
      return revenueCatPlanEndsAt ?? serverState.ends_at;
    }

    return serverState.ends_at ?? revenueCatPlanEndsAt;
  }, [authoritativeRevenueCatTier, currentPlan, customerInfo, mirroredSupabaseTier, revenueCatPlan, serverState.ends_at]);

  const mirrorMismatch = authoritativeRevenueCatTier !== mirroredSupabaseTier;
  const benefits = useMemo(() => getMembershipBenefits(effectiveTier), [effectiveTier]);

  useEffect(() => {
    if (!user?.id || loading) return;
    logger.info("membership.resolved", {
      authoritativeRevenueCatTier,
      mirroredSupabaseTier,
      effectiveTier,
      productionCompatibility: productionAuthorityCompatibilityEnabled(),
    });
    if (mirrorMismatch) {
      logger.warn("membership.mirror_mismatch", {
        authoritativeRevenueCatTier,
        mirroredSupabaseTier,
        effectiveTier,
      });
    }
  }, [authoritativeRevenueCatTier, effectiveTier, loading, mirrorMismatch, mirroredSupabaseTier, user?.id]);

  return {
    loading,
    error,
    authoritativeRevenueCatTier,
    mirroredSupabaseTier,
    effectiveTier,
    mirrorMismatch,
    benefits,
    serverPlan: serverState.plan,
    revenueCatPlan,
    currentPlan,
    currentPlanEndsAt,
    hasPaidPlan: currentPlan !== "FREE",
    hasActiveBoost: serverState.has_active_boost,
    activeBoostEndsAt: serverState.active_boost_ends_at,
    billingReady,
    billingSupported,
    managementURL: customerInfo?.managementURL ?? null,
    offerings,
    hasMembershipFeature: (feature: Parameters<typeof hasMembershipFeature>[1]) =>
      hasMembershipFeature(effectiveTier, feature),
    hasAccess: (requiredPlan: PremiumPlan) => hasPlanAccess(currentPlan, requiredPlan),
    hasServerAccess: (requiredPlan: PremiumPlan) => hasPlanAccess(serverState.plan, requiredPlan),
    refresh,
  };
}

export function usePremiumState() {
  return useMembership();
}
