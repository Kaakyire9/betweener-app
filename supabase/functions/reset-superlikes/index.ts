// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdminHeaders } from "../_shared/supabase-admin-key.ts";

serve(async () => {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    if (!url) {
      console.error("Missing SUPABASE_URL");
      return new Response("Missing config", { status: 500 });
    }

    const resp = await fetch(`${url}/rest/v1/rpc/reset_daily_superlikes`, {
      method: "POST",
      headers: getSupabaseAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: "{}", // no args
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("reset_daily_superlikes failed", resp.status, text);
      return new Response("RPC failed", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("reset-superlikes error", e);
    return new Response("Error", { status: 500 });
  }
});
