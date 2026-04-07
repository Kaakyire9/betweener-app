// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ALLOWED_REASON_KEYS = new Set([
  "not_enough_matches",
  "not_feeling_safe",
  "taking_a_break",
  "met_someone",
  "too_many_notifications",
  "too_expensive",
  "technical_issues",
  "privacy_concerns",
  "not_for_me",
  "other",
]);

type DeleteAccountPayload = {
  reasonKeys?: string[];
  feedback?: string | null;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let requestId: string | null = null;
  let service: ReturnType<typeof createClient> | null = null;

  try {
    const payload = (await req.json()) as DeleteAccountPayload;
    const reasonKeys = Array.isArray(payload.reasonKeys)
      ? Array.from(new Set(payload.reasonKeys.map((item) => String(item || "").trim()).filter(Boolean)))
      : [];
    const feedback = String(payload.feedback || "").trim();

    if (reasonKeys.length === 0) {
      return json(400, { error: "Select at least one reason before deleting your account." });
    }
    if (reasonKeys.some((key) => !ALLOWED_REASON_KEYS.has(key))) {
      return json(400, { error: "One or more account deletion reasons are invalid." });
    }
    if (feedback.length > 1000) {
      return json(400, { error: "Feedback must be 1000 characters or fewer." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(500, { error: "Server configuration is incomplete." });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json(401, { error: "Unauthorized" });
    }

    service = createClient(supabaseUrl, serviceRoleKey);
    const storageDb = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "storage" } });

    const { data: profileRow, error: profileError } = await service
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Unable to load profile before deletion: ${profileError.message}`);
    }

    const { data: insertedRequest, error: insertRequestError } = await service
      .from("account_deletion_requests")
      .insert({
        user_id: user.id,
        profile_id: profileRow?.id ?? null,
        contact_email: user.email ?? null,
        reason_keys: reasonKeys,
        feedback: feedback || null,
        metadata: {
          linked_providers: Array.isArray((user.app_metadata as any)?.providers)
            ? (user.app_metadata as any).providers
            : [],
          requested_via: "mobile_app",
        },
        status: "requested",
      })
      .select("id")
      .single();

    if (insertRequestError || !insertedRequest?.id) {
      throw new Error(insertRequestError?.message || "Unable to create deletion request.");
    }

    requestId = insertedRequest.id;

    const { data: ownedObjects, error: ownedObjectsError } = await storageDb
      .from("objects")
      .select("bucket_id,name")
      .eq("owner_id", user.id);

    if (ownedObjectsError) {
      throw new Error(`Unable to inspect owned media before deletion: ${ownedObjectsError.message}`);
    }

    const grouped = new Map<string, string[]>();
    for (const row of ownedObjects || []) {
      const bucket = String((row as any).bucket_id || "").trim();
      const name = String((row as any).name || "").trim();
      if (!bucket || !name) continue;
      if (!grouped.has(bucket)) grouped.set(bucket, []);
      grouped.get(bucket)!.push(name);
    }

    for (const [bucket, names] of grouped.entries()) {
      for (const batch of chunk(names, 100)) {
        const { error: removeError } = await service.storage.from(bucket).remove(batch);
        if (removeError) {
          throw new Error(`Unable to remove media from ${bucket}: ${removeError.message}`);
        }
      }
    }

    const nowIso = new Date().toISOString();

    const { error: profileUpdateError } = await service
      .from("profiles")
      .update({
        deleted_at: nowIso,
        discoverable_in_vibes: false,
        is_active: false,
        online: false,
        account_state: "deleted",
        paused_at: null,
        pause_reason: "account_deleted",
        account_state_updated_at: nowIso,
        profile_completed: false,
        updated_at: nowIso,
        ai_score: null,
        ai_score_updated_at: null,
        avatar_url: null,
        bio: null,
        city: null,
        current_country: null,
        current_country_code: null,
        education: null,
        full_name: null,
        future_ghana_plans: null,
        gender: null,
        has_children: null,
        height: null,
        languages_spoken: null,
        last_active: null,
        last_ghana_visit: null,
        latitude: null,
        living_situation: null,
        location: null,
        location_updated_at: null,
        longitude: null,
        looking_for: null,
        love_language: null,
        matchmaking_mode: false,
        max_age_interest: null,
        min_age_interest: null,
        occupation: null,
        personality_type: null,
        pets: null,
        phone_number: null,
        phone_verification_score: null,
        phone_verified: false,
        photos: [],
        profile_video: null,
        public_key: null,
        region: null,
        religion: null,
        search_name: null,
        smoking: null,
        tribe: null,
        username: null,
        verification_level: 0,
        wants_children: null,
        years_in_diaspora: null,
      })
      .eq("user_id", user.id);

    if (profileUpdateError) {
      throw new Error(`Unable to hide profile during deletion: ${profileUpdateError.message}`);
    }

    const { error: momentsUpdateError } = await service
      .from("moments")
      .update({ is_deleted: true })
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    if (momentsUpdateError) {
      throw new Error(`Unable to hide moments during deletion: ${momentsUpdateError.message}`);
    }

    const { error: deleteUserError } = await service.auth.admin.deleteUser(user.id, true);
    if (deleteUserError) {
      throw new Error(`Unable to delete auth account: ${deleteUserError.message}`);
    }

    const { error: completeRequestError } = await service
      .from("account_deletion_requests")
      .update({
        status: "completed",
        completed_at: nowIso,
        failure_reason: null,
      })
      .eq("id", requestId);

    if (completeRequestError) {
      throw new Error(`Unable to finalize deletion request: ${completeRequestError.message}`);
    }

    return json(200, { success: true });
  } catch (error) {
    console.error("delete-account error", error);
    if (service && requestId) {
      try {
        await service
          .from("account_deletion_requests")
          .update({
            status: "failed",
            failure_reason: error instanceof Error ? error.message : "Unknown deletion failure",
          })
          .eq("id", requestId);
      } catch (updateError) {
        console.error("delete-account request failure update error", updateError);
      }
    }
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to delete account right now.",
    });
  }
});
