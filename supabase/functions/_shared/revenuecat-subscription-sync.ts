// @ts-nocheck

const SILVER_ENTITLEMENT = (Deno.env.get("REVENUECAT_SILVER_ENTITLEMENT") || "silver").toLowerCase();
const GOLD_ENTITLEMENT = (Deno.env.get("REVENUECAT_GOLD_ENTITLEMENT") || "gold").toLowerCase();
const SILVER_PRODUCT_HINT = (Deno.env.get("REVENUECAT_SILVER_PRODUCT") || "silver").toLowerCase();
const GOLD_PRODUCT_HINT = (Deno.env.get("REVENUECAT_GOLD_PRODUCT") || "gold").toLowerCase();
const REVENUECAT_API_BASE = (Deno.env.get("REVENUECAT_API_BASE") || "https://api.revenuecat.com").replace(/\/+$/, "");

export type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
  environment?: string | null;
  event_timestamp_ms?: number | null;
};

export type SubscriptionSync = {
  userId: string;
  plan: "FREE" | "SILVER" | "GOLD";
  startedAt: string | null;
  endsAt: string | null;
  productId: string | null;
  entitlementId: string | null;
  customerId: string | null;
  environment: string | null;
};

const PLAN_PRIORITY: Record<SubscriptionSync["plan"], number> = {
  FREE: 0,
  SILVER: 1,
  GOLD: 2,
};

export const isUuid = (value: string | null | undefined) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const asArray = (value: unknown) => (Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []);

export const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const extractEvent = (payload: any): RevenueCatEvent => {
  const event = payload?.event && typeof payload.event === "object" ? payload.event : payload;
  return {
    id: normalizeString(event?.id),
    type: normalizeString(event?.type),
    app_user_id: normalizeString(event?.app_user_id),
    original_app_user_id: normalizeString(event?.original_app_user_id),
    aliases: asArray(event?.aliases),
    transferred_from: asArray(event?.transferred_from),
    transferred_to: asArray(event?.transferred_to),
    environment: normalizeString(event?.environment),
    event_timestamp_ms: typeof event?.event_timestamp_ms === "number" ? event.event_timestamp_ms : null,
  };
};

export const collectCandidateIds = (event: RevenueCatEvent) => {
  return Array.from(
    new Set(
      [
        event.app_user_id,
        event.original_app_user_id,
        ...(event.aliases || []),
        ...(event.transferred_to || []),
        ...(event.transferred_from || []),
      ].filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const parseMaybeDate = (value: unknown) => {
  const text = normalizeString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isActiveAt = (isoDate: string | null) => {
  if (!isoDate) return false;
  return new Date(isoDate).getTime() > Date.now();
};

export const choosePlanFromSubscriber = (
  subscriber: any,
  fallbackUserId: string,
  fallbackEnvironment: string | null,
): SubscriptionSync => {
  const entitlements = subscriber?.entitlements && typeof subscriber.entitlements === "object"
    ? Object.entries(subscriber.entitlements)
    : [];
  const subscriptions = subscriber?.subscriptions && typeof subscriber.subscriptions === "object"
    ? Object.entries(subscriber.subscriptions)
    : [];

  const entitlementRows = entitlements
    .map(([entitlementId, value]) => {
      const row = value as Record<string, unknown>;
      const expiresAt = parseMaybeDate(row.expires_date);
      const purchaseDate = parseMaybeDate(row.purchase_date);
      const productId = normalizeString(row.product_identifier);
      const normalizedEntitlement = String(entitlementId || "").toLowerCase();
      const inferredPlan =
        normalizedEntitlement.includes(GOLD_ENTITLEMENT) ? "GOLD" :
        normalizedEntitlement.includes(SILVER_ENTITLEMENT) ? "SILVER" :
        productId?.toLowerCase().includes(GOLD_PRODUCT_HINT) ? "GOLD" :
        productId?.toLowerCase().includes(SILVER_PRODUCT_HINT) ? "SILVER" :
        "FREE";

      return {
        entitlementId,
        productId,
        expiresAt,
        purchaseDate,
        plan: inferredPlan as "FREE" | "SILVER" | "GOLD",
        active: !expiresAt || isActiveAt(expiresAt),
      };
    })
    .filter((row) => row.plan !== "FREE" && row.active)
    .sort((a, b) => PLAN_PRIORITY[b.plan] - PLAN_PRIORITY[a.plan]);

  if (entitlementRows.length > 0) {
    const selected = entitlementRows[0];
    return {
      userId: fallbackUserId,
      plan: selected.plan,
      startedAt: selected.purchaseDate,
      endsAt: selected.expiresAt,
      productId: selected.productId,
      entitlementId: selected.entitlementId,
      customerId: normalizeString(subscriber?.original_app_user_id) || fallbackUserId,
      environment: fallbackEnvironment,
    };
  }

  const subscriptionRows = subscriptions
    .map(([productId, value]) => {
      const row = value as Record<string, unknown>;
      const normalizedProduct = String(productId || "").toLowerCase();
      const expiresAt = parseMaybeDate(row.expires_date);
      const purchaseDate = parseMaybeDate(row.purchase_date);
      const inferredPlan =
        normalizedProduct.includes(GOLD_PRODUCT_HINT) ? "GOLD" :
        normalizedProduct.includes(SILVER_PRODUCT_HINT) ? "SILVER" :
        "FREE";

      return {
        productId,
        expiresAt,
        purchaseDate,
        plan: inferredPlan as "FREE" | "SILVER" | "GOLD",
        active: !expiresAt || isActiveAt(expiresAt),
      };
    })
    .filter((row) => row.plan !== "FREE" && row.active)
    .sort((a, b) => PLAN_PRIORITY[b.plan] - PLAN_PRIORITY[a.plan]);

  if (subscriptionRows.length > 0) {
    const selected = subscriptionRows[0];
    return {
      userId: fallbackUserId,
      plan: selected.plan,
      startedAt: selected.purchaseDate,
      endsAt: selected.expiresAt,
      productId: selected.productId,
      entitlementId: null,
      customerId: normalizeString(subscriber?.original_app_user_id) || fallbackUserId,
      environment: fallbackEnvironment,
    };
  }

  return {
    userId: fallbackUserId,
    plan: "FREE",
    startedAt: null,
    endsAt: null,
    productId: null,
    entitlementId: null,
    customerId: normalizeString(subscriber?.original_app_user_id) || fallbackUserId,
    environment: fallbackEnvironment,
  };
};

export const fetchSubscriberSnapshot = async (apiKey: string, appUserId: string) => {
  const response = await fetch(`${REVENUECAT_API_BASE}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RevenueCat subscriber lookup failed (${response.status}): ${body.slice(0, 240)}`);
  }

  return await response.json();
};

export const syncUserSubscription = async (
  admin: any,
  revenueCatApiKey: string,
  userId: string,
  eventEnvironment: string | null,
  options?: { revenueCatAppUserId?: string | null },
) => {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.id) {
    return { userId, revenueCatAppUserId: options?.revenueCatAppUserId ?? userId, skipped: true, reason: "user_not_found" };
  }

  const revenueCatAppUserId = normalizeString(options?.revenueCatAppUserId) || userId;
  const snapshot = await fetchSubscriberSnapshot(revenueCatApiKey, revenueCatAppUserId);
  const subscriber = snapshot?.subscriber ?? null;
  const resolved = choosePlanFromSubscriber(subscriber, userId, eventEnvironment);
  const nowIso = new Date().toISOString();

  const { error: deactivateError } = await admin
    .from("subscriptions")
    .update({ is_active: false, updated_at: nowIso })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (deactivateError) {
    throw new Error(`Deactivate subscriptions failed: ${deactivateError.message}`);
  }

  if (resolved.plan === "FREE" || !resolved.productId || !resolved.endsAt) {
    return { userId, revenueCatAppUserId, plan: "FREE" };
  }

  const payload = {
    user_id: userId,
    type: resolved.plan,
    started_at: resolved.startedAt || nowIso,
    ends_at: resolved.endsAt,
    is_active: true,
    source: "revenuecat",
    external_customer_id: resolved.customerId,
    external_product_id: resolved.productId,
    external_entitlement: resolved.entitlementId,
    external_environment: resolved.environment,
    updated_at: nowIso,
  };

  const { error: upsertError } = await admin
    .from("subscriptions")
    .upsert(payload, { onConflict: "user_id,source,external_product_id,ends_at" });

  if (upsertError) {
    throw new Error(`Upsert subscription failed: ${upsertError.message}`);
  }

  return {
    userId,
    revenueCatAppUserId,
    plan: resolved.plan,
    productId: resolved.productId,
    endsAt: resolved.endsAt,
  };
};
