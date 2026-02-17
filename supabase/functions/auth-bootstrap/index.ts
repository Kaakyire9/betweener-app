// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// TypeScript errors are expected in VS Code Node.js environment

// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type BootstrapRequest = {
  signupSessionId?: string | null;
  signup_session_id?: string | null;
};

type BootstrapResponse = {
  user_id: string;
  profile_id: string | null;
  verified: boolean;
  phone_number: string | null;
  profile_completed: boolean;
  linked?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[auth-bootstrap] start", { method: req.method, url: req.url });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.log("[auth-bootstrap] missing env", {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceRoleKey,
      });
      return new Response(JSON.stringify({ error: "Missing env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    console.log("[auth-bootstrap] auth header", { present: authHeader.length > 0 });
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      console.log("[auth-bootstrap] missing bearer token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    console.log("[auth-bootstrap] fetching user");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData?.user ?? null;
    if (userError || !user?.id) {
      console.log("[auth-bootstrap] invalid user", { error: userError?.message ?? null });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: BootstrapRequest = {};
    if (req.method !== "GET") {
      try {
        body = (await req.json()) as BootstrapRequest;
      } catch {
        body = {};
      }
    }
    const signupSessionId = body.signupSessionId ?? body.signup_session_id ?? null;
    console.log("[auth-bootstrap] resolved user", {
      userId: user.id,
      hasSignupSessionId: !!signupSessionId,
    });

    // Ensure profile exists (Phase-2 allows minimal row)
    console.log("[auth-bootstrap] ensure profile");
    await admin.from("profiles").upsert({ user_id: user.id }, { onConflict: "user_id" });

    let linked = false;
    if (signupSessionId) {
      console.log("[auth-bootstrap] linking signup session");
      const { error: linkError } = await admin
        .from("phone_verifications")
        .update({ user_id: user.id })
        .eq("signup_session_id", signupSessionId)
        .eq("status", "verified");
      linked = !linkError;
      if (linkError) {
        console.log("[auth-bootstrap] link error", { message: linkError.message });
      }
    }

    // Get latest verified phone for this user
    console.log("[auth-bootstrap] query verified phone");
    let verifiedRows: any[] | null = null;
    try {
      const res = await admin
        .from("phone_verifications")
        .select("phone_number,status,is_verified,verified_at,updated_at")
        .eq("user_id", user.id)
        .or("status.eq.verified,is_verified.eq.true")
        .order("verified_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(1);
      verifiedRows = res.data ?? null;
      if (res.error && res.error.code === "42703") {
        // Older schema: retry without is_verified.
        const res2 = await admin
          .from("phone_verifications")
          .select("phone_number,status,verified_at,updated_at")
          .eq("user_id", user.id)
          .eq("status", "verified")
          .order("verified_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(1);
        verifiedRows = res2.data ?? null;
      }
    } catch {
      verifiedRows = null;
    }

    const verifiedRow = Array.isArray(verifiedRows) ? verifiedRows[0] : null;
    const verifiedPhone = verifiedRow?.phone_number ?? null;
    const isVerified = !!verifiedPhone;
    console.log("[auth-bootstrap] verified lookup", { isVerified, phone: verifiedPhone ?? null });

    if (isVerified) {
      console.log("[auth-bootstrap] update profile verified");
      await admin
        .from("profiles")
        .update({
          phone_verified: true,
          phone_number: verifiedPhone,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .in("phone_verified", [false, null]);
    }

    console.log("[auth-bootstrap] fetch profile");
    const { data: profileRow } = await admin
      .from("profiles")
      .select("id,profile_completed,phone_verified,phone_number")
      .eq("user_id", user.id)
      .maybeSingle();

    const response: BootstrapResponse = {
      user_id: user.id,
      profile_id: profileRow?.id ?? null,
      verified: profileRow?.phone_verified === true || isVerified,
      phone_number: profileRow?.phone_number ?? verifiedPhone,
      profile_completed: profileRow?.profile_completed === true,
      linked,
    };
    console.log("[auth-bootstrap] response", {
      verified: response.verified,
      profileCompleted: response.profile_completed,
      linked: response.linked ?? false,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log("[auth-bootstrap] error", { message: (error as Error)?.message ?? String(error) });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
