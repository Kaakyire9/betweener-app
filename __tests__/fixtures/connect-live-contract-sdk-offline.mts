// Pinned SDK serializer only. Run with --deny-net and synthetic credentials.
// eslint-disable-next-line import/no-unresolved -- Exact cached Deno dependency.
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
import diagnostics from '../../scripts/lib/connect-media-truth/provider-diagnostics.cjs';

const input = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const results: unknown[] = [];
const client = new StreamClient('offline-key-not-real', 'offline-secret-not-real');
for (const item of input.cases) {
  let captured; let projected;
  globalThis.fetch = async (url, init) => {
    const serializedBody = String(init?.body);
    captured = { method: init?.method, path: new URL(String(url)).pathname, serializedBody, body: JSON.parse(serializedBody) };
    // Same synthetic response for every shape; this does not implement server validation.
    const response = new Response(JSON.stringify({ code: 4, status_code: 400,
      message: 'data.settings_override.video.target_resolution.width PRIVATE_SYNTHETIC_SENTINEL',
      exception_fields: { 'data.settings_override.video.target_resolution.height': 'PRIVATE_SYNTHETIC_SENTINEL' },
      unknown: 'PRIVATE_SYNTHETIC_SENTINEL' }), { status: 400 });
    projected = await diagnostics.captureErrorResponse(response);
    return response;
  };
  try { await client.video.call(item.type, input.callId).getOrCreate(item.request); }
  catch (error) { results.push({ name: item.name, captured, projected, sdkDiagnostic: diagnostics.providerDiagnostic(error) }); }
}
console.log(JSON.stringify({ mode: 'OFFLINE_SERIALIZATION_NOT_PROVIDER_VALIDATION', deno: Deno.version.deno,
  serverSdk: '0.7.63', networkPermission: (await Deno.permissions.query({ name: 'net' })).state,
  credentialReadPermission: (await Deno.permissions.query({ name: 'read', path: '.env.stream-audit.local' })).state,
  actualNetworkCalls: 0, results }));
