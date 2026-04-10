// @ts-nocheck
// Edge Function: background Relationship Compass ready jobs
//
// Deploy this function and schedule it to run periodically (e.g. every 15 minutes).
// It calls the DB RPC `rpc_process_relationship_compass_jobs()` using the service role key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response("Missing config", { status: 500 });
    }

    const resp = await fetch(`${url}/rest/v1/rpc/rpc_process_relationship_compass_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
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
