// @ts-nocheck
// RevenueCat webhook sync for subscriptions.
// - verifies webhook auth using a shared secret, with URL fallback for providers
//   like RevenueCat when the platform intercepts Authorization headers
// - stores every event for idempotency / debugging
// - syncs current RevenueCat subscriber state into public.subscriptions

// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SILVER_ENTITLEMENT = (Deno.env.get("REVENUECAT_SILVER_ENTITLEMENT") || "silver").toLowerCase();
const GOLD_ENTITLEMENT = (Deno.env.get("REVENUECAT_GOLD_ENTITLEMENT") || "gold").toLowerCase();
const SILVER_PRODUCT_HINT = (Deno.env.get("REVENUECAT_SILVER_PRODUCT") || "silver").toLowerCase();
const GOLD_PRODUCT_HINT = (Deno.env.get("REVENUECAT_GOLD_PRODUCT") || "gold").toLowerCase();
const REVENUECAT_API_BASE = (Deno.env.get("REVENUECAT_API_BASE") || "https://api.revenuecat.com").replace(/\/+$/, "");
const SYNC_SANDBOX = String(Deno.env.get("REVENUECAT_SYNC_SANDBOX") || "true").toLowerCase() !== "false";

type RevenueCatEvent = {
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

type SubscriptionSync = {
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

const isUuid = (value: string | null | undefined) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const asArray = (value: unknown) => (Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []);

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const extractEvent = (payload: any): RevenueCatEvent => {
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

const collectCandidateIds = (event: RevenueCatEvent) => {
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

const choosePlanFromSubscriber = (subscriber: any, fallbackUserId: string, fallbackEnvironment: string | null): SubscriptionSync => {
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

const fetchSubscriberSnapshot = async (apiKey: string, appUserId: string) => {
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

const updateWebhookEvent = async (admin: any, eventId: string, patch: Record<string, unknown>) => {
  await admin
    .from("revenuecat_webhook_events")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
};

const syncUserSubscription = async (
  admin: any,
  revenueCatApiKey: string,
  userId: string,
  eventEnvironment: string | null,
) => {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.id) {
    return { userId, skipped: true, reason: "user_not_found" };
  }

  const snapshot = await fetchSubscriberSnapshot(revenueCatApiKey, userId);
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
    return { userId, plan: "FREE" };
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
    plan: resolved.plan,
    productId: resolved.productId,
    endsAt: resolved.endsAt,
  };
};

serve(async (req) => {
  let admin: any = null;
  let eventId: string | null = null;

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
    const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    const webhookAuth = (Deno.env.get("REVENUECAT_WEBHOOK_AUTH") || "").trim();
    const revenueCatApiKey = (Deno.env.get("REVENUECAT_SECRET_API_KEY") || "").trim();

    if (!supabaseUrl || !serviceRoleKey || !webhookAuth || !revenueCatApiKey) {
      return new Response(JSON.stringify({
        error: "Missing required function secrets",
        details: {
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasServiceRoleKey: Boolean(serviceRoleKey),
          hasWebhookAuth: Boolean(webhookAuth),
          hasRevenueCatApiKey: Boolean(revenueCatApiKey),
        },
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestUrl = new URL(req.url);
    const providedAuth = (req.headers.get("Authorization") || "").trim();
    const querySecret = (
      requestUrl.searchParams.get("webhook_secret") ||
      requestUrl.searchParams.get("secret") ||
      ""
    ).trim();
    const isAuthorized =
      (providedAuth && providedAuth === webhookAuth) ||
      (querySecret && querySecret === webhookAuth);

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    admin = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json();
    const event = extractEvent(payload);
    eventId = event.id || null;

    if (!event.id || !event.type) {
      return new Response(JSON.stringify({ error: "Invalid RevenueCat payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventRow = {
      event_id: event.id,
      event_type: event.type,
      app_user_id: event.app_user_id,
      original_app_user_id: event.original_app_user_id,
      aliases: event.aliases || [],
      transferred_from: event.transferred_from || [],
      transferred_to: event.transferred_to || [],
      environment: event.environment,
      event_timestamp_ms: event.event_timestamp_ms,
      processing_status: "received",
      last_error: null,
      payload,
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await admin
      .from("revenuecat_webhook_events")
      .insert(eventRow);

    if (insertError) {
      const isDuplicate = String(insertError.code || "") === "23505" || String(insertError.message || "").toLowerCase().includes("duplicate");
      if (!isDuplicate) {
        throw new Error(`Unable to log webhook event: ${insertError.message}`);
      }

      const { data: existing } = await admin
        .from("revenuecat_webhook_events")
        .select("processing_status")
        .eq("event_id", event.id)
        .maybeSingle();

      if (existing?.processing_status === "processed" || existing?.processing_status === "ignored") {
        return new Response(JSON.stringify({ ok: true, duplicate: true, event_id: event.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await updateWebhookEvent(admin, event.id, {
        ...eventRow,
        processing_status: "received",
      });
    }

    if (!SYNC_SANDBOX && String(event.environment || "").toUpperCase() === "SANDBOX") {
      await updateWebhookEvent(admin, event.id, {
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        synced_user_ids: [],
        last_error: "sandbox sync disabled",
      });

      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "sandbox_sync_disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.type === "TEST") {
      await updateWebhookEvent(admin, event.id, {
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        synced_user_ids: [],
      });

      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "test_event" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidateIds = collectCandidateIds(event).filter(isUuid);
    if (!candidateIds.length) {
      await updateWebhookEvent(admin, event.id, {
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        synced_user_ids: [],
        last_error: "no uuid app_user_id candidates found",
      });

      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_uuid_candidates" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const syncResults = [];
    for (const userId of candidateIds) {
      const result = await syncUserSubscription(admin, revenueCatApiKey, userId, event.environment || null);
      syncResults.push(result);
    }

    await updateWebhookEvent(admin, event.id, {
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      synced_user_ids: syncResults.filter((entry) => !entry.skipped).map((entry) => entry.userId),
      last_error: null,
    });

    return new Response(JSON.stringify({
      ok: true,
      event_id: event.id,
      synced_user_ids: syncResults.filter((entry) => !entry.skipped).map((entry) => entry.userId),
      results: syncResults,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[revenuecat-webhook] error", error);

    if (admin && eventId) {
      await updateWebhookEvent(admin, eventId, {
        processing_status: "failed",
        last_error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }

    return new Response(JSON.stringify({
      error: "Internal error",
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
