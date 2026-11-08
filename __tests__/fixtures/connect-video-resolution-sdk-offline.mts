// Offline serializer probe only: synthetic credentials, replaced fetch, Deno --deny-net.
// eslint-disable-next-line import/no-unresolved -- Exact cached SDK version.
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
import diagnostics from '../../scripts/lib/connect-media-truth/provider-diagnostics.cjs';

const input = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const { buildCreateRequest } = (await import('../../scripts/lib/connect-media-truth/request.cjs')).default;
const reconstructed = buildCreateRequest(input.manifest, input.ledger);
const candidate = structuredClone(reconstructed);
candidate.data.settings_override.video.target_resolution = { width: 640, height: 480, bitrate: 600000 };
const empty = structuredClone(reconstructed);
empty.data.settings_override.video.target_resolution = {};
const explicitNull = structuredClone(reconstructed);
explicitNull.data.settings_override.video.target_resolution = null;
const withoutVideo = structuredClone(reconstructed);
delete withoutVideo.data.settings_override.video;
const cases = [
  { name: 'b2', request: reconstructed }, { name: 'candidate', request: candidate },
  { name: 'empty-resolution', request: empty }, { name: 'null-resolution', request: explicitNull },
  { name: 'without-video-object', request: withoutVideo },
];
const fields = ['data.settings_override.video.target_resolution.height', 'data.settings_override.video.target_resolution.width'];
const captures: unknown[] = [];
const client = new StreamClient('offline-key-not-real', 'offline-secret-not-real');
for (const item of cases) {
  let beforeSdk;
  globalThis.fetch = async (url, init) => {
    const serializedBody = String(init?.body);
    captures.push({ name: item.name, method: init?.method, path: new URL(String(url)).pathname, serializedBody, body: JSON.parse(serializedBody) });
    // Deliberately the same synthetic error for every body. This is not a server validator.
    const response = new Response(JSON.stringify({ code: 4, status_code: 400,
      message: `${fields.join(' ')} PRIVATE_SYNTHETIC_SENTINEL`,
      exception_fields: Object.fromEntries(fields.map((field) => [field, 'PRIVATE_SYNTHETIC_SENTINEL'])),
      details: { ignored: 'PRIVATE_SYNTHETIC_SENTINEL' } }), { status: 400 });
    beforeSdk = await diagnostics.captureErrorResponse(response);
    return response;
  };
  try { await client.video.call('betweener_connect', input.ledger.callId).getOrCreate(item.request); }
  catch (error) {
    captures.push({ name: item.name, beforeSdk, sdkDiagnostic: diagnostics.providerDiagnostic(error) });
  }
}
console.log(JSON.stringify({ mode: 'OFFLINE_SYNTHETIC_RESPONSES_NOT_PROVIDER_ACCEPTANCE',
  deno: Deno.version.deno, serverSdk: '0.7.63', networkPermission: (await Deno.permissions.query({ name: 'net' })).state,
  credentialReadPermission: (await Deno.permissions.query({ name: 'read', path: '.env.stream-audit.local' })).state,
  transportCalls: captures.filter((item) => Object.hasOwn(item as object, 'method')).length,
  actualNetworkCalls: 0, captures }));
