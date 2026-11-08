const test = require('node:test');
const assert = require('node:assert/strict');
const { providerDiagnostic, projectDiagnostic, captureErrorResponse } = require('../scripts/lib/connect-media-truth/provider-diagnostics.cjs');
const { jsonProcess } = require('../scripts/lib/connect-media-truth/process.cjs');
const { experiment } = require('../scripts/lib/connect-media-truth/experiment.cjs');
const { readManifest } = require('../scripts/lib/connect-media-truth/approval.cjs');

const field = 'data.settings_override.frame_recording.capture_interval_in_seconds';
const raw = () => ({ code: 4, status_code: 400, message: `${field} is required`, exception_fields: { [field]: 'required' } });

test('known field paths and rule hints survive without provider prose', () => {
  const d = providerDiagnostic(raw(), 400);
  assert.equal(d.status, 400); assert.equal(d.code, 4);
  assert.deepEqual(d.fields, [field]); assert.deepEqual(d.ruleHints, ['required']);
  assert.equal(d.textOmitted, true); assert.equal(d.capture, 'parsed');
  assert.equal('message' in d, false);
});

test('SDK error status metadata and field hints are recognized', () => {
  const d = providerDiagnostic({ metadata: { responseCode: 400 }, code: 4, message: `Stream error code 4: ${field} must be >= 2` });
  assert.equal(d.status, 400); assert.deepEqual(d.fields, [field]); assert.ok(d.ruleHints.includes('minimum'));
});

test('tokens, secrets, identities, headers, URLs, SDP and arbitrary response fields are discarded', () => {
  const secret = 'PRIVATE_SECRET_22A';
  const input = { ...raw(), message: `${field} is required; ${secret} Jane Example jane@example.com https://private.invalid/?token=${secret} v=0\na=ice-pwd:${secret} eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature`,
    Authorization: secret, details: [secret], more_info: `https://private.invalid/${secret}`, unknown: { secret },
    exception_fields: { [field]: `required ${secret}`, [`custom.${secret}`]: secret, user_id: 'Jane Example' } };
  const d = providerDiagnostic(input, 400); const text = JSON.stringify(d);
  for (const forbidden of [secret, 'Jane', 'jane@example.com', 'https:', 'ice-pwd', 'eyJ', 'Authorization', 'unknown', 'more_info']) assert.equal(text.includes(forbidden), false);
  assert.deepEqual(d.fields, [field]);
});

test('unknown validation fields remain unknown instead of being copied', () => {
  const d = providerDiagnostic({ message: 'customer.private_setting has an invalid value', exception_fields: { 'customer.private_setting': 'required' } }, 400);
  assert.deepEqual(d.fields, []); assert.deepEqual(d.ruleHints, []);
});

test('ambiguous leaf names never become invented full paths', () => {
  const d = providerDiagnostic({ message: 'mode is required; enabled is invalid' }, 400);
  assert.deepEqual(d.fields, []);
});

test('bare unique required field and qualified Go field are recognized as hints', () => {
  for (const name of ['capture_interval_in_seconds', 'FrameRecordingSettings.CaptureIntervalInSeconds']) {
    assert.deepEqual(providerDiagnostic({ message: `${name} is required` }, 400).fields, [field]);
  }
});

test('bridge projection accepts only known fields, finite codes and known rule labels', () => {
  const d = projectDiagnostic({ version: 1, status: 400, code: 4, capture: 'parsed', fields: [field, 'private.raw', field], ruleHints: ['required', 'private-secret'], message: 'PRIVATE', headers: { Authorization: 'PRIVATE' } });
  assert.deepEqual(d.fields, [field]); assert.deepEqual(d.ruleHints, ['required']);
  assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
  assert.equal(projectDiagnostic(null), null);
  assert.equal(projectDiagnostic({ status: '400', fields: ['private'] }).status, null);
});

test('error capture reads a clone and keeps the original SDK response intact', async () => {
  const response = new Response(JSON.stringify({ ...raw(), more_info: 'https://private.invalid', unknown: 'PRIVATE' }), { status: 400, headers: { Authorization: 'PRIVATE' } });
  const d = await captureErrorResponse(response);
  assert.deepEqual(d.fields, [field]); assert.equal(d.code, 4);
  assert.deepEqual(await response.json(), { ...raw(), more_info: 'https://private.invalid', unknown: 'PRIVATE' });
  assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
});

test('malformed diagnostic collections never become raw data or throw', () => {
  const d = projectDiagnostic({ fields: [null, {}, 3], ruleHints: [null, { toString: null }, [], 4], capture: { raw: 'PRIVATE' } });
  assert.deepEqual(d.fields, []); assert.deepEqual(d.ruleHints, []);
  assert.equal(d.capture, 'unavailable'); assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
});

test('transport status takes precedence over untrusted status_code', async () => {
  const d = await captureErrorResponse(new Response(JSON.stringify({ ...raw(), status_code: 200 }), { status: 400 }));
  assert.equal(d.status, 400);
});

test('success responses are not cloned, parsed or changed', async () => {
  assert.equal(await captureErrorResponse({ status: 200, clone: () => { throw Error('must_not_read'); } }), null);
});

test('invalid response JSON is visible without raw body text', async () => {
  const d = await captureErrorResponse(new Response('PRIVATE_NOT_JSON', { status: 400 }));
  assert.equal(d.capture, 'invalid_json'); assert.deepEqual(d.fields, []);
  assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
});

test('oversized error body is bounded and omitted', async () => {
  const d = await captureErrorResponse(new Response('PRIVATE'.repeat(1000), { status: 400 }), { maxBytes: 100 });
  assert.equal(d.capture, 'too_large'); assert.deepEqual(d.fields, []);
});

test('stalled error stream is bounded without changing HTTP error semantics', async () => {
  let cancelled = false;
  const d = await captureErrorResponse({ status: 400, clone: () => ({ body: new ReadableStream({ cancel() { cancelled = true; } }) }) }, { timeoutMs: 20 });
  assert.equal(d.capture, 'timeout'); assert.equal(cancelled, true);
});

test('response clone/read failures stay diagnostic failures with no raw exception', async () => {
  const d = await captureErrorResponse({ status: 400, clone() { throw Error('PRIVATE'); } });
  assert.equal(d.capture, 'unavailable'); assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
});

test('provider diagnostic reaches parent evidence through the actual child bridge', async () => {
  const d = { ...providerDiagnostic(raw(), 400), unknown: 'PRIVATE', fields: [field, 'private.secret'] };
  const code = `console.log(JSON.stringify({ready:true}));process.stdin.on('data',b=>{const r=JSON.parse(b.toString());console.log(JSON.stringify({id:r.id,error:{status:400,code:4,reason:'provider_operation_failed',message:'PRIVATE',diagnostic:${JSON.stringify(d)}}}))})`;
  const port = jsonProcess(process.execPath, ['-e', code], { timeoutMs: 2000 });
  try {
    await port.ready;
    const { manifest } = readManifest();
    const provider = { request: async (op) => op === 'preflight' ? { absent: true, baselineHash: 'offline' } : op === 'createUsers' ? {} : port.request(op) };
    const result = await experiment({ provider, openPeer: () => { throw Error('must_not_join'); }, ledger: {}, persist: () => {}, manifest });
    assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.phases.length, 0);
    const detail = result.errors[0].detail;
    assert.equal(detail.status, 400); assert.equal(detail.code, 4);
    assert.deepEqual(detail.diagnostic.fields, [field]); assert.deepEqual(detail.diagnostic.ruleHints, ['required']);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  } finally { await port.close(); }
});
