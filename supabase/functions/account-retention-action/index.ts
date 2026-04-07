// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ALLOWED_ACTIONS = new Set(["take_break", "quiet_notifications", "hide_profile"]);
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

type RetentionPayload = {
  action?: string;
  triggerReason?: string | null;
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
    const payload = (await req.json()) as RetentionPayload;
    const action = String(payload.action || "").trim();
    const triggerReason = payload.triggerReason ? String(payload.triggerReason).trim() : null;

    if (!ALLOWED_ACTIONS.has(action)) {
      return json(400, { error: "Unsupported retention action." });
    }
    if (triggerReason && !ALLOWED_REASON_KEYS.has(triggerReason)) {
      return json(400, { error: "Invalid retention reason." });
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

    const service = createClient(supabaseUrl, serviceRoleKey);

    const { data: profileRow, error: profileError } = await service
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Unable to load profile: ${profileError.message}`);
    }

    const nowIso = new Date().toISOString();
    let nextMessage = "Your account settings were updated.";
    let notificationPrefsPatch: Record<string, unknown> | null = null;
    let profileStatePatch: Record<string, unknown> | null = null;

    if (action === "quiet_notifications" || action === "take_break") {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      notificationPrefsPatch = {
        user_id: user.id,
        push_enabled: false,
        announcements: false,
        likes: false,
        superlikes: false,
        matches: false,
        reactions: false,
        message_reactions: false,
        quiet_hours_enabled: true,
        quiet_hours_start: "22:00:00",
        quiet_hours_end: "08:00:00",
        quiet_hours_tz: localTz,
        updated_at: nowIso,
      };

      const { error: notificationError } = await service
        .from("notification_prefs")
        .upsert(notificationPrefsPatch, { onConflict: "user_id" });

      if (notificationError) {
        throw new Error(`Unable to update notification preferences: ${notificationError.message}`);
      }
    }

    if (action === "hide_profile" || action === "take_break") {
      if (!profileRow?.id) {
        throw new Error("No profile was found for this account.");
      }

      profileStatePatch = {
        discoverable_in_vibes: false,
        online: false,
        account_state: action === "take_break" ? "paused" : "hidden",
        paused_at: action === "take_break" ? nowIso : null,
        pause_reason: action === "take_break" ? triggerReason ?? "taking_a_break" : triggerReason ?? "hide_profile",
        account_state_updated_at: nowIso,
        updated_at: nowIso,
      };

      const { error: profileUpdateError } = await service
        .from("profiles")
        .update(profileStatePatch)
        .eq("user_id", user.id);

      if (profileUpdateError) {
        throw new Error(`Unable to update profile visibility: ${profileUpdateError.message}`);
      }
    }

    if (action === "quiet_notifications") {
      nextMessage = "Notifications are quieter now. You can keep your account without the noise.";
    } else if (action === "hide_profile") {
      nextMessage = "Your profile is hidden for now. You can return later without starting over.";
    } else if (action === "take_break") {
      nextMessage = "Betweener is quieter now. Your profile is hidden and notifications are softened for now.";
    }

    const { error: auditError } = await service
      .from("account_retention_events")
      .insert({
        user_id: user.id,
        profile_id: profileRow?.id ?? null,
        action,
        source: "delete_flow",
        trigger_reason: triggerReason,
        metadata: {
          notification_patch_applied: Boolean(notificationPrefsPatch),
          profile_patch_applied: Boolean(profileStatePatch),
        },
      });

    if (auditError) {
      throw new Error(`Unable to log retention event: ${auditError.message}`);
    }

    return json(200, {
      success: true,
      message: nextMessage,
      notificationPrefs: notificationPrefsPatch,
      profileState: profileStatePatch,
    });
  } catch (error) {
    console.error("account-retention-action error", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to update account state right now.",
    });
  }
});
