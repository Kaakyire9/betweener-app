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
import {
  collectCandidateIds,
  extractEvent,
  isUuid,
  syncUserSubscription,
} from "../_shared/revenuecat-subscription-sync.ts";
const SYNC_SANDBOX = String(Deno.env.get("REVENUECAT_SYNC_SANDBOX") || "true").toLowerCase() !== "false";

const updateWebhookEvent = async (admin: any, eventId: string, patch: Record<string, unknown>) => {
  await admin
    .from("revenuecat_webhook_events")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
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
