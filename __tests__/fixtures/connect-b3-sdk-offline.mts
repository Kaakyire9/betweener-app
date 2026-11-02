// Actual pinned SDK and actual shared builder, with synthetic credentials and denied network.
// eslint-disable-next-line import/no-unresolved -- Pinned cached Deno dependency.
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
import requestModule from '../../scripts/lib/connect-media-truth/request.cjs';
import diagnosticModule from '../../scripts/lib/connect-media-truth/provider-diagnostics.cjs';
const { buildCreateRequest } = requestModule;
const { captureErrorResponse, providerDiagnosticV2 } = diagnosticModule;
const input = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const request = buildCreateRequest(input.manifest, input.ledger);
let captured; let beforeSdk; let transportCalls = 0;
globalThis.fetch = async (url, init) => {
  transportCalls++;
  const serializedBody = String(init?.body);
  captured = { method: init?.method, path: new URL(String(url)).pathname, serializedBody, body: JSON.parse(serializedBody) };
  const response = new Response(JSON.stringify({ code: 4, status_code: 400,
    message: 'data.settings_override.video.target_resolution.height width required PRIVATE_B3_SENTINEL',
    exception_fields: { 'videoSettings.target_resolution.height': 'required PRIVATE_B3_SENTINEL', width: 'required' },
    details: 'PRIVATE_B3_SENTINEL', Authorization: 'PRIVATE_B3_SENTINEL' }), { status: 400 });
  beforeSdk = await captureErrorResponse(response, { diagnosticVersion: 2 });
  return response;
};
const client = new StreamClient('offline-key-not-real', 'offline-secret-not-real');
let sdkError;
try { await client.video.call(input.manifest.application.callType, input.ledger.callId).getOrCreate(request); }
catch (error) { sdkError = providerDiagnosticV2(error); }
console.log(JSON.stringify({ mode: 'OFFLINE_SYNTHETIC_RESPONSE_NOT_PROVIDER_ACCEPTANCE', serverSdk: '0.7.63',
  deno: Deno.version.deno, networkPermission: (await Deno.permissions.query({ name: 'net' })).state,
  credentialReadPermission: (await Deno.permissions.query({ name: 'read', path: '.env.stream-audit.local' })).state,
  actualNetworkCalls: 0, transportCalls, captured, beforeSdk, sdkError }));
