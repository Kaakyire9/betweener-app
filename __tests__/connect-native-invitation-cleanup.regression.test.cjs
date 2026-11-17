const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativeCallCoordinator } = require('../features/connect/application/native-call-coordinator.ts');
const { id, settle } = require('./fixtures/connect-product-fixture.cjs');

function fixture({ identifyFails = false, answerFails = false } = {}) {
  const call = { id: id(40), created_at: new Date().toISOString(), caller_profile_id: id(2),
    recipient_profile_id: id(3), media: 'voice', authorization: 'matched', grant_id: null,
    state: 'RINGING', version: 1, native_incoming: true, ended_at: null, deadline: null };
  const view = { session: { ...call }, phase: 'RINGING' };
  const counts = { hangups: 0, acts: 0, answers: 0, releases: 0, leaseDisposals: 0 };
  const closed = [];
  let readsFail = false;
  const product = { selfProfileId: id(3), accountUserId: id(1), authGeneration: 'epoch',
    services: { api: {
      async getCall() { if (readsFail) throw Error('network_unavailable'); return { ...call }; },
      async act() { counts.acts++; call.state = 'DECLINED'; return { ...call }; },
    } },
    controller: { getSnapshot: () => view, async hangup() {
      counts.hangups++; call.state = 'DECLINED'; view.phase = 'ENDED'; view.session = { ...call };
    } },
    async answerNative() { counts.answers++; if (answerFails) return false;
      call.state = 'ACTIVE'; view.phase = 'ACTIVE'; view.session = { ...call }; return true; },
    // The foreground product retains its independent lease.
    async dispose() { counts.leaseDisposals++; },
  };
  const coordinator = createNativeCallCoordinator({ enabled: () => true, load: async () => product,
    deviceId: async () => id(4), current: () => true, now: Date.now,
    close: async (_cid, reason) => { closed.push(reason); },
    keepAlive: async () => async () => { counts.releases++; },
    identify: async () => { if (identifyFails) throw Error('metadata_unavailable'); },
  });
  return { call, view, counts, closed, coordinator, failReads() { readsFail = true; },
    event: action => ({ cid: `betweener_connect:${call.id}`, action }) };
}

test('incoming metadata failure releases native presentation without declining the foreground invitation', async () => {
  const f = fixture({ identifyFails: true });
  assert.deepEqual(await f.coordinator.handle(f.event('incoming')), { handled: true, success: false });
  assert.equal(f.counts.hangups, 0);
  assert.equal(f.counts.acts, 0);
  assert.equal(f.call.state, 'RINGING');
  assert.equal(f.view.phase, 'RINGING');
  assert.equal(f.counts.releases, 1);
  assert.equal(f.counts.leaseDisposals, 1);
  assert.deepEqual(f.closed, ['error']);
  await f.coordinator.dispose();
});

test('incoming authority-read failure cannot turn an unanswered invitation into recipient decline', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture();
  assert.equal((await f.coordinator.handle(f.event('incoming'))).success, true);
  f.failReads(); t.mock.timers.tick(2000); await settle(); await settle();
  assert.equal(f.counts.hangups, 0);
  assert.equal(f.counts.acts, 0);
  assert.equal(f.call.state, 'RINGING');
  assert.equal(f.counts.releases, 1);
  assert.deepEqual(f.closed, ['error']);
  await f.coordinator.dispose();
});

test('coordinator disposal does not manufacture decline for an unanswered foreground invitation', async () => {
  const f = fixture(); await f.coordinator.handle(f.event('incoming'));
  await f.coordinator.dispose();
  assert.equal(f.counts.hangups, 0);
  assert.equal(f.counts.acts, 0);
  assert.equal(f.call.state, 'RINGING');
  assert.equal(f.counts.releases, 1);
});

test('explicit native End still declines the same unanswered call', async () => {
  const f = fixture(); await f.coordinator.handle(f.event('incoming'));
  assert.equal((await f.coordinator.handle(f.event('end'))).success, true);
  assert.equal(f.counts.hangups, 1);
  assert.equal(f.call.state, 'DECLINED');
  await f.coordinator.dispose();
});

test('a failed explicit Answer still stops its owned setup even before the phase changes', async () => {
  const f = fixture({ answerFails: true });
  assert.equal((await f.coordinator.handle(f.event('answer'))).success, false);
  assert.equal(f.counts.answers, 1);
  assert.equal(f.counts.hangups, 1);
  assert.equal(f.counts.releases, 1);
  await f.coordinator.dispose();
});

test('an accepted native call still stops media ownership when authority polling fails', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); assert.equal((await f.coordinator.handle(f.event('answer'))).success, true);
  f.failReads(); t.mock.timers.tick(2000); await settle(); await settle();
  assert.equal(f.counts.hangups, 1);
  assert.equal(f.counts.releases, 1);
  await f.coordinator.dispose();
});
