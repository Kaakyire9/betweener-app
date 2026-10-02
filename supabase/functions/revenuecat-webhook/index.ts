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
import { getSupabaseAdminKey } from "../_shared/supabase-admin-key.ts";
import {
  collectCandidateIds,
  extractEvent,
  isUuid,
  syncUserSubscription,
} from "../_shared/revenuecat-subscription-sync.ts";
import { resolveRevenueCatEventEnvironment } from "../_shared/revenuecat-event.ts";
import { verifyRevenueCatWebhookSignature } from "../_shared/revenuecat-webhook-signature.ts";
import { isRevenueCatWebhookAuthorized } from "../_shared/revenuecat-webhook-auth.ts";
const SYNC_SANDBOX = String(Deno.env.get("REVENUECAT_SYNC_SANDBOX") || "true").toLowerCase() !== "false";

const updateWebhookEvent = async (admin: any, eventId: string, patch: Record<string, unknown>) => {
  const { error } = await admin
    .from("revenuecat_webhook_events")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
  if (error) throw new Error(`Unable to update legacy webhook event: ${error.message}`);
};

const updateInboxEvent = async (admin: any, eventId: string, patch: Record<string, unknown>) => {
  const { error } = await admin
    .from("revenuecat_webhook_inbox")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("revenuecat_event_id", eventId);
  if (error) throw new Error(`Unable to update webhook inbox event: ${error.message}`);
};

const sha256Hex = async (value: Uint8Array) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  let admin: any = null;
  let eventId: string | null = null;
  let inboxClaimed = false;

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
    const serviceRoleKey = getSupabaseAdminKey();
    const webhookAuth = (Deno.env.get("REVENUECAT_WEBHOOK_AUTH") || "").trim();
    const revenueCatApiKey = (
      Deno.env.get("REVENUECAT_V1_SECRET_API_KEY") ||
      Deno.env.get("REVENUECAT_SECRET_API_KEY") ||
      ""
    ).trim();
    const webhookSigningSecret = (Deno.env.get("REVENUECAT_WEBHOOK_SIGNING_SECRET") || "").trim();
    const signatureToleranceSeconds = Number.parseInt(
      Deno.env.get("REVENUECAT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS") || "300",
      10,
    );

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
    const isAuthorized = isRevenueCatWebhookAuthorized({
      authorizationHeader: req.headers.get("Authorization"),
      webhookSecret: webhookAuth,
      webhookSecretQuery: requestUrl.searchParams.get("webhook_secret"),
      legacySecretQuery: requestUrl.searchParams.get("secret"),
    });

    if (!isAuthorized) {
      console.warn(JSON.stringify({ event: "revenuecat.webhook.rejected", reason: "authorization" }));
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = new Uint8Array(await req.arrayBuffer());
    if (webhookSigningSecret) {
      const signatureResult = await verifyRevenueCatWebhookSignature({
        rawBody,
        header: req.headers.get("X-RevenueCat-Webhook-Signature"),
        secret: webhookSigningSecret,
        toleranceSeconds: Number.isFinite(signatureToleranceSeconds)
          ? signatureToleranceSeconds
          : 300,
      });
      if (!signatureResult.valid) {
        console.warn(JSON.stringify({
          event: "revenuecat.webhook.rejected",
          reason: signatureResult.reason,
        }));
        return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    admin = createClient(supabaseUrl, serviceRoleKey);
    const payload = JSON.parse(new TextDecoder().decode(rawBody));
    const event = extractEvent(payload);
    const environmentResolution = resolveRevenueCatEventEnvironment(event);
    eventId = event.id || null;
    console.info(JSON.stringify({
      event: "revenuecat.webhook.received",
      eventId: event.id ?? null,
      eventType: event.type ?? null,
      environment: environmentResolution.environment,
      environmentSource: environmentResolution.source,
      hmacVerified: Boolean(webhookSigningSecret),
    }));

    if (!event.id || !event.type) {
      return new Response(JSON.stringify({ error: "Invalid RevenueCat payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!environmentResolution.environment) {
      console.warn(JSON.stringify({
        event: "revenuecat.webhook.environment_unresolved",
        eventId: event.id,
        eventType: event.type,
        environmentSource: environmentResolution.source,
        rawEnvironment: environmentResolution.rawValue,
      }));
    }

    const eventRow = {
      event_id: event.id,
      event_type: event.type,
      app_user_id: event.app_user_id,
      original_app_user_id: event.original_app_user_id,
      aliases: event.aliases || [],
      transferred_from: event.transferred_from || [],
      transferred_to: event.transferred_to || [],
      environment: environmentResolution.environment,
      event_timestamp_ms: event.event_timestamp_ms,
      processing_status: "received",
      last_error: null,
      payload,
      updated_at: new Date().toISOString(),
    };

    if (event.type !== "TEST") {
      const payloadSha256 = await sha256Hex(rawBody);
      const { data: claim, error: claimError } = await admin.rpc(
        "rpc_service_claim_revenuecat_webhook_event_v1",
        {
          p_revenuecat_event_id: event.id,
          p_event_type: event.type,
          p_environment: environmentResolution.environment,
          p_environment_source: environmentResolution.source,
          p_app_user_id: event.app_user_id,
          p_payload: payload,
          p_payload_sha256: payloadSha256,
        },
      );

      if (claimError) {
        throw new Error(`Unable to claim webhook inbox event: ${claimError.message}`);
      }

      if (!claim?.should_process) {
        const { data: inboxEvent, error: inboxReadError } = await admin
          .from("revenuecat_webhook_inbox")
          .select(
            "environment,environment_source,processing_state,attempt_count,delivery_count,received_at,last_received_at",
          )
          .eq("revenuecat_event_id", event.id)
          .single();
        if (inboxReadError) {
          throw new Error(`Unable to read duplicate webhook inbox event: ${inboxReadError.message}`);
        }
        console.info(JSON.stringify({
          event: "revenuecat.webhook.duplicate",
          eventId: event.id,
          processingState: inboxEvent.processing_state,
          deliveryCount: inboxEvent.delivery_count,
        }));
        return new Response(JSON.stringify({
          ok: true,
          duplicate: true,
          event_id: event.id,
          inbox: inboxEvent,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      inboxClaimed = true;
      if (!environmentResolution.environment) {
        await updateInboxEvent(admin, event.id, {
          last_error_code: environmentResolution.source === "missing"
            ? "environment_missing"
            : "environment_unsupported",
          error: environmentResolution.source === "missing"
            ? "RevenueCat event environment is missing"
            : `Unsupported RevenueCat environment: ${environmentResolution.rawValue}`,
        });
      }
    }

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
        .select("processing_status,processed_at")
        .eq("event_id", event.id)
        .maybeSingle();

      if (existing?.processing_status === "processed" || existing?.processing_status === "ignored") {
        if (inboxClaimed) {
          await updateInboxEvent(admin, event.id, {
            processing_state: existing.processing_status,
            processed_at: existing.processed_at || new Date().toISOString(),
          });
        }
        console.info(JSON.stringify({
          event: "revenuecat.webhook.duplicate",
          eventId: event.id,
        }));
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

    if (!SYNC_SANDBOX && environmentResolution.environment === "SANDBOX") {
      await updateWebhookEvent(admin, event.id, {
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        synced_user_ids: [],
        last_error: "sandbox sync disabled",
      });
      if (inboxClaimed) {
        await updateInboxEvent(admin, event.id, {
          processing_state: "ignored",
          processed_at: new Date().toISOString(),
          last_error_code: "sandbox_sync_disabled",
          error: "sandbox sync disabled",
        });
      }

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
      await updateInboxEvent(admin, event.id, {
        processing_state: "ignored",
        processed_at: new Date().toISOString(),
        last_error_code: "no_uuid_candidates",
        error: "no uuid app_user_id candidates found",
      });

      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_uuid_candidates" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const syncResults = [];
    for (const userId of candidateIds) {
      const result = await syncUserSubscription(
        admin,
        revenueCatApiKey,
        userId,
        environmentResolution,
      );
      syncResults.push(result);
    }

    await updateWebhookEvent(admin, event.id, {
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      synced_user_ids: syncResults.filter((entry) => !entry.skipped).map((entry) => entry.userId),
      last_error: null,
    });
    await updateInboxEvent(admin, event.id, {
      processing_state: "processed",
      processed_at: new Date().toISOString(),
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
      if (inboxClaimed) {
        const message = error instanceof Error ? error.message : String(error);
        await updateInboxEvent(admin, eventId, {
          processing_state: "failed",
          last_error_code: "processing_failed",
          error: message.slice(0, 2000),
        }).catch(() => undefined);
      }
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
