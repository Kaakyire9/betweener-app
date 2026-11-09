const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticatedConnectServices } = require('../features/connect/data/authenticated-connect-services.ts');
const { fixture, id, jwt, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');

function preparedFixture(prepare) {
  const f = fixture();
  f.model.state = 'ACCEPTED';
  const services = createAuthenticatedConnectServices(f.nativeAuth.owner, id(2), f.ports, { prepareCredentials: prepare });
  return { ...f, prepared: services.api };
}

test('one fresh canonical RPC supplies key preparation and issuance, with no cached authority across requests', async () => {
  const calls = [], f = preparedFixture(async call => { calls.push(call); });
  try {
    await f.prepared.credentials(f.model.id, id(4));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, f.model.id);
    assert.equal(f.events.filter(event => event.rpc === 'rpc_connect_get_call').length, 1);
    assert.equal(f.counts().credentialCount, 1);
    await f.prepared.credentials(f.model.id, id(4));
    assert.equal(calls.length, 2);
    assert.equal(f.events.filter(event => event.rpc === 'rpc_connect_get_call').length, 2);
  } finally { await f.product.dispose(); }
});

test('credential issuance waits for key preparation and never runs when preparation fails', async () => {
  const gate = deferred(), f = preparedFixture(() => gate.promise);
  try {
    const result = assert.rejects(f.prepared.credentials(f.model.id, id(4)), /key-preparation-denied/);
    await settle();
    assert.equal(f.counts().credentialCount, 0);
    gate.reject(Error('key-preparation-denied'));
    await result;
    assert.equal(f.counts().credentialCount, 0);
  } finally { await f.product.dispose(); }
});

test('account switching during key preparation prevents a credential request under the old account', async () => {
  const gate = deferred(), f = preparedFixture(() => gate.promise);
  try {
    const result = assert.rejects(f.prepared.credentials(f.model.id, id(4)), /connect_unauthenticated/);
    await settle(); f.nativeAuth.invalidate(); gate.resolve(); await result;
    assert.equal(f.counts().credentialCount, 0);
  } finally { await f.product.dispose(); }
});

test('the issuer still rejects revoked eligibility after successful preparation', async () => {
  const gate = deferred(), f = preparedFixture(() => gate.promise);
  try {
    const result = assert.rejects(f.prepared.credentials(f.model.id, id(4)), /connect_unavailable/);
    await settle(); f.eligible(false); gate.resolve(); await result;
    assert.equal(f.counts().credentialCount, 1);
  } finally { await f.product.dispose(); }
});

test('a third-party call cannot reach key preparation or credential issuance', async () => {
  let prepared = 0;
  const f = preparedFixture(async () => { prepared++; });
  try {
    f.model.caller_profile_id = id(8); f.model.recipient_profile_id = id(9);
    await assert.rejects(f.prepared.credentials(f.model.id, id(4)), /connect_unavailable/);
    assert.equal(prepared, 0); assert.equal(f.counts().credentialCount, 0);
  } finally { await f.product.dispose(); }
});


test('a same-account token refresh during preparation uses the current bearer for issuance', async () => {
  const gate = deferred(), f = preparedFixture(() => gate.promise);
  try {
    const result = f.prepared.credentials(f.model.id, id(4));
    await settle();
    const token = jwt(id(1), id(5), Date.now() + 7200000);
    f.nativeAuth.accept({ user: { id: id(1) }, access_token: token });
    gate.resolve(); await result;
    assert.equal(f.events.find(event => event.credential).token, token);
  } finally { await f.product.dispose(); }
});
