// @ts-nocheck
// Edge Function: background V4 Vibes summary repair / backfill jobs
//
// Deploy this function and schedule it to run periodically (recommended: every 15 minutes).
// It calls the DB RPC `rpc_process_vibes_v4_jobs()` using a privileged server key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdminHeaders } from "../_shared/supabase-admin-key.ts";

serve(async (req) => {
  const cronSecret = Deno.env.get("VIBES_V4_JOBS_SECRET");
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (!provided || provided !== cronSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    if (!url) {
      console.error("Missing SUPABASE_URL");
      return new Response("Missing config", { status: 500 });
    }

    const resp = await fetch(`${url}/rest/v1/rpc/rpc_process_vibes_v4_jobs`, {
      method: "POST",
      headers: getSupabaseAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: "{}",
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error("rpc_process_vibes_v4_jobs failed", resp.status, text);
      return new Response(
        JSON.stringify({
          error: "rpc_process_vibes_v4_jobs_failed",
          status: resp.status,
          details: text,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(text || "OK", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("vibes-recommendation-jobs error", error);
    return new Response("Error", { status: 500 });
  }
});
