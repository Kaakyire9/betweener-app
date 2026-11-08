const test = require('node:test');
const assert = require('node:assert/strict');
const { accountDeletionFixture } = require('./fixtures/account-deletion-edge-fixture.cjs');

test('the real handler binds the guarded mask to its server-created deletion request', async () => {
  const fixture = accountDeletionFixture();
  const response = await fixture.run({ reasonKeys: ['privacy_concerns'], userId: 'forged-owner', profileId: 'forged-profile' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  const mask = fixture.events.find(event => event.kind === 'mask');
  assert.equal(mask.name, 'rpc_mask_account_deletion_profile');
  assert.deepEqual(Object.keys(mask.args), ['p_request_id']);
  assert.equal(mask.args.p_request_id, fixture.requestId);
  const request = fixture.events.find(event => event.kind === 'query' && event.table === 'account_deletion_requests' && event.operation === 'insert');
  assert.equal(request.payload.user_id, fixture.userId);
  assert.ok(fixture.events.indexOf(mask) < fixture.events.findIndex(event => event.kind === 'storage-list'));
  const auth = fixture.events.find(event => event.kind === 'auth-delete');
  assert.equal(auth.userId, fixture.userId);
  assert.equal(auth.softDelete, true);
  assert.ok(fixture.events.some(event => event.kind === 'query' && event.payload?.status === 'completed'));
});

test('a failed mask halts storage and Auth deletion and records a retryable failure', async () => {
  const fixture = accountDeletionFixture({ maskError: true });
  const response = await fixture.run();
  assert.equal(response.status, 500);
  assert.equal(fixture.events.some(event => event.kind.startsWith('storage-') || event.kind === 'auth-delete'), false);
  assert.ok(fixture.events.some(event => event.kind === 'query' && event.payload?.status === 'failed'));
});

test('a missing server-created request halts before any account cleanup', async () => {
  const fixture = accountDeletionFixture({ missingRequest: true });
  assert.equal((await fixture.run()).status, 500);
  assert.equal(fixture.events.some(event => ['mask', 'auth-delete', 'storage-list'].includes(event.kind)), false);
});

test('accounts without profiles still clean their own storage and Auth account', async () => {
  const fixture = accountDeletionFixture({ noProfile: true });
  assert.equal((await fixture.run()).status, 200);
  assert.ok(fixture.events.some(event => event.kind === 'auth-delete'));
  assert.ok(fixture.events.filter(event => event.kind === 'storage-list').every(event => event.prefix === `${fixture.userId}/`));
  assert.equal(fixture.events.some(event => event.kind === 'query' && event.table === 'matches'), false);
});

test('unauthenticated requests cannot create an audit request or mask an account', async () => {
  const fixture = accountDeletionFixture({ unauthorized: true });
  assert.equal((await fixture.run()).status, 401);
  assert.equal(fixture.events.some(event => event.kind !== 'authenticate'), false);
});

test('invalid deletion reasons are rejected before authentication and cleanup', async () => {
  const fixture = accountDeletionFixture();
  assert.equal((await fixture.run({ reasonKeys: ['unrecognised'] })).status, 400);
  assert.equal(fixture.events.length, 0);
});
