// @ts-nocheck -- imports and Deno globals checked using function-local Deno config.
/* eslint-disable import/no-unresolved -- Deno resolves pinned npm specifiers. */
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.7';
import { getSupabasePublicApiKey } from './supabase-public-key.ts';
import { getSupabaseAdminKey } from './supabase-admin-key.ts';
import { corsHeaders } from './cors.ts';
import { createConnectStreamAdapter } from './connect-stream-adapter.ts';
import { assertConnectEnvironment } from './connect-environment.ts';
export function connectEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('connect_configuration_unavailable');
  return value;
}
export function connectBackend() {
  const environment = connectEnv('CONNECT_ENVIRONMENT');
  const url = connectEnv('SUPABASE_URL');
  assertConnectEnvironment(environment, url);
  const stream = new StreamClient(connectEnv('CONNECT_STREAM_API_KEY'), connectEnv('CONNECT_STREAM_API_SECRET'));
  const service = createClient(url, getSupabaseAdminKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  return { adapter: createConnectStreamAdapter(stream, Number(connectEnv('CONNECT_STREAM_APP_ID'))), service, stream,
    authenticated: (authorization: string) => createClient(url, getSupabasePublicApiKey(), {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } },
    }) };
}
export function connectJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export async function connectRpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error('connect_unavailable');
  return data;
}
