/* global Deno, RequestInfo, RequestInit */
// Test transport seam only. Actual handler, SDK, helpers and SQL remain loaded.
// Replaces external Expo delivery with an in-memory synthetic sink.
import { serve as stdServe } from '../../../tmp/connect-push-rollback-48/vendor/std-0.168.0/http/server.ts';

let fault = '';
const deliveries: Record<string, unknown>[][] = [];
const nativeFetch = globalThis.fetch.bind(globalThis);
const origin = Deno.env.get('SUPABASE_URL')!;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://exp.host/--/api/v2/push/send') {
    if (fault === 'expo_503') return new Response('{}', { status: 503 });
    const messages = JSON.parse(String(init?.body));
    deliveries.push(messages);
    if (fault === 'crash_after_delivery') Deno.exit(63);
    return Response.json({ data: messages.map(() => ({ status: 'ok', id: 'synthetic-ticket' })) });
  }
  if (!url.startsWith(origin + '/rest/v1/')) throw Error('rehearsal_external_network_denied');
  const reserve = url.endsWith('/rpc/rpc_service_reserve_push_notification_deliveries_v1');
  if (reserve && fault === 'crash_before_reservation') Deno.exit(61);
  const response = await nativeFetch(input, init);
  if (reserve && fault === 'crash_after_reservation') Deno.exit(62);
  return response;
};

export function serve(handler: (request: Request) => Response | Promise<Response>) {
  return stdServe(async request => {
    if (new URL(request.url).pathname === '/__rehearsal') {
      const command = request.method === 'POST' ? await request.json() : {};
      if (command.fault !== undefined) fault = command.fault;
      if (command.clear) deliveries.length = 0;
      for (const [name, value] of Object.entries(command.env ?? {})) {
        if (value === null) Deno.env.delete(name); else Deno.env.set(name, String(value));
      }
      return Response.json({ deliveries, fault, runtime: Deno.version,
        externalNetPermission: (await Deno.permissions.query({ name: 'net', host: 'exp.host:443' })).state });
    }
    return handler(request);
  }, { hostname: '127.0.0.1', port: Number(Deno.env.get('REHEARSAL_PORT')), onListen: () => console.log('REHEARSAL_READY') });
}
