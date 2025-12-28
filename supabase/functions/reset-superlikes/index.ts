// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async () => {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response("Missing config", { status: 500 });
    }

    const resp = await fetch(`${url}/rest/v1/rpc/reset_daily_superlikes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
      },
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
