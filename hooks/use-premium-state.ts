import { useAuth } from "@/lib/auth-context";
import { hasPlanAccess } from "@/lib/premium-access";
import { supabase } from "@/lib/supabase";
import {
  PremiumPlan,
  derivePlanFromCustomerInfo,
  loadRevenueCatState,
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

export function usePremiumState() {
  const { user, profile } = useAuth();
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
      const [premiumStateRes, revenueCatState] = await Promise.all([
        supabase.rpc("rpc_get_my_premium_state"),
        loadRevenueCatState({
          appUserID: user.id,
          email: user.email ?? null,
          displayName: profile?.full_name ?? null,
        }),
      ]);

      if (premiumStateRes.error) {
        setError(premiumStateRes.error.message);
      }

      setServerState(normalizePremiumState(premiumStateRes.data));
      setCustomerInfo(revenueCatState.customerInfo);
      setOfferings(revenueCatState.offerings);
      setBillingReady(revenueCatState.enabled);
      setBillingSupported(revenueCatState.canMakePayments);
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
  }, [profile?.full_name, user?.email, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revenueCatPlan = useMemo(() => derivePlanFromCustomerInfo(customerInfo), [customerInfo]);
  const currentPlan = useMemo(() => {
    const rank = { FREE: 0, SILVER: 1, GOLD: 2 } as const;
    return rank[serverState.plan] >= rank[revenueCatPlan] ? serverState.plan : revenueCatPlan;
  }, [revenueCatPlan, serverState.plan]);

  return {
    loading,
    error,
    currentPlan,
    currentPlanEndsAt: serverState.ends_at,
    hasPaidPlan: currentPlan !== "FREE",
    hasActiveBoost: serverState.has_active_boost,
    activeBoostEndsAt: serverState.active_boost_ends_at,
    billingReady,
    billingSupported,
    customerInfo,
    offerings,
    hasAccess: (requiredPlan: PremiumPlan) => hasPlanAccess(currentPlan, requiredPlan),
    refresh,
  };
}
