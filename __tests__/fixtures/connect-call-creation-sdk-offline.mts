// The real pinned SDK, a replaced fetch, and Deno --deny-net. No provider module or credentials.
// eslint-disable-next-line import/no-unresolved -- Cached, exact Deno npm version.
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
import diagnostics from '../../scripts/lib/connect-media-truth/provider-diagnostics.cjs';

const input = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const request = Deno.args.includes('--b2-builder')
  ? (await import('../../scripts/lib/connect-media-truth/request.cjs')).default.buildCreateRequest(input.manifest, input.ledger) : input;
const field = 'data.settings_override.frame_recording.capture_interval_in_seconds';
let transportCalls = 0; let captured; let beforeSdk;
globalThis.fetch = async (input, init) => {
  transportCalls++;
  captured = { method: init?.method, path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) };
  const response = new Response(JSON.stringify({ code: 4, status_code: 400, duration: '0ms',
    message: `${field} is required`, exception_fields: { [field]: 'required' }, unknown: 'PRIVATE_SYNTHETIC_SENTINEL' }), { status: 400 });
  beforeSdk = await diagnostics.captureErrorResponse(response);
  return response;
};
const client = new StreamClient('offline-key-not-real', 'offline-secret-not-real');
let sdkError;
try { await client.video.call('betweener_connect', '00000000-0000-4000-8000-000000000001').getOrCreate(request); }
catch (error) {
  sdkError = { diagnostic: diagnostics.providerDiagnostic(error),
    descriptiveMessagePreserved: error instanceof Error && error.message.includes(field),
    exceptionFieldsPreserved: Object.hasOwn(error as object, 'exception_fields') };
}
console.log(JSON.stringify({ mode: 'OFFLINE_SYNTHETIC_RESPONSE_NOT_PROVIDER_EVIDENCE',
  deno: Deno.version.deno, serverSdk: '0.7.63', transportCalls, actualNetworkCalls: 0, captured, beforeSdk, sdkError }));
