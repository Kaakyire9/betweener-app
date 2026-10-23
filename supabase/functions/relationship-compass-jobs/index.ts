// @ts-nocheck
// Edge Function: background Relationship Compass ready jobs
//
// Deploy this function and schedule it to run periodically (e.g. every 15 minutes).
// It calls the DB RPC `rpc_process_relationship_compass_jobs()` using a privileged server key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdminHeaders } from "../_shared/supabase-admin-key.ts";

serve(async (req) => {
  const cronSecret = Deno.env.get("COMPASS_JOBS_SECRET");
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

    const resp = await fetch(`${url}/rest/v1/rpc/rpc_process_relationship_compass_jobs`, {
      method: "POST",
      headers: getSupabaseAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: "{}",
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error("rpc_process_relationship_compass_jobs failed", resp.status, text);
      return new Response(
        JSON.stringify({
          error: "rpc_process_relationship_compass_jobs_failed",
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
  } catch (e) {
    console.error("relationship-compass-jobs error", e);
    return new Response("Error", { status: 500 });
  }
});
