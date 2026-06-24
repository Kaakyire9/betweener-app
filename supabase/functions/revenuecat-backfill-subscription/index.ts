// @ts-nocheck
// Admin-only RevenueCat subscription backfill.
// - verifies the caller is an authenticated internal admin
// - fetches the current RevenueCat subscriber snapshot for a target app user id
// - upserts public.subscriptions using the same logic as the webhook
// - logs a synthetic revenuecat_webhook_events row for auditability

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  isUuid,
  normalizeString,
  syncUserSubscription,
} from "../_shared/revenuecat-subscription-sync.ts";

type BackfillPayload = {
  targetUserId?: string | null;
  revenueCatAppUserId?: string | null;
  environment?: string | null;
  reason?: string | null;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
    const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    const revenueCatApiKey = (Deno.env.get("REVENUECAT_SECRET_API_KEY") || "").trim();
    const authHeader = req.headers.get("Authorization") || "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !revenueCatApiKey) {
      return json(500, {
        error: "Server configuration is incomplete.",
        details: {
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasAnonKey: Boolean(anonKey),
          hasServiceRoleKey: Boolean(serviceRoleKey),
          hasRevenueCatApiKey: Boolean(revenueCatApiKey),
        },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json(401, { error: "Unauthorized" });
    }

    const { data: isAdmin, error: adminError } = await authClient.rpc("is_internal_admin");
    if (adminError) {
      return json(403, { error: adminError.message || "Unable to verify admin access." });
    }
    if (isAdmin !== true) {
      return json(403, { error: "Internal admin access required." });
    }

    const payload = (await req.json()) as BackfillPayload;
    const targetUserId = normalizeString(payload.targetUserId);
    const revenueCatAppUserId = normalizeString(payload.revenueCatAppUserId) || targetUserId;
    const environment = normalizeString(payload.environment);
    const reason = normalizeString(payload.reason) || "manual_backfill";

    if (!targetUserId || !isUuid(targetUserId)) {
      return json(400, { error: "A valid targetUserId is required." });
    }

    if (!revenueCatAppUserId) {
      return json(400, { error: "A revenueCatAppUserId could not be resolved." });
    }

    const result = await syncUserSubscription(
      service,
      revenueCatApiKey,
      targetUserId,
      environment,
      { revenueCatAppUserId },
    );

    const eventId = `manual-backfill:${targetUserId}:${Date.now()}:${crypto.randomUUID()}`;
    const syncedUserIds =
      result.skipped === true ? [] : [targetUserId];

    await service.from("revenuecat_webhook_events").insert({
      event_id: eventId,
      event_type: "MANUAL_BACKFILL",
      app_user_id: revenueCatAppUserId,
      original_app_user_id: revenueCatAppUserId,
      aliases: [revenueCatAppUserId],
      transferred_from: [],
      transferred_to: [],
      environment,
      event_timestamp_ms: Date.now(),
      processing_status: "processed",
      synced_user_ids: syncedUserIds,
      last_error: null,
      payload: {
        source: "revenuecat-backfill-subscription",
        triggered_by_user_id: user.id,
        target_user_id: targetUserId,
        revenuecat_app_user_id: revenueCatAppUserId,
        reason,
        result,
      },
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return json(200, {
      ok: true,
      targetUserId,
      revenueCatAppUserId,
      result,
    });
  } catch (error) {
    console.error("revenuecat-backfill-subscription error", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to backfill subscription.",
    });
  }
});
