const test = require('node:test'), assert = require('node:assert/strict');
const { createNativeCallCoordinator } = require('../features/connect/application/native-call-coordinator.ts');
const { id } = require('./fixtures/connect-product-fixture.cjs');

for (const phase of ['RINGING', 'ACTIVE']) test(`stale native cleanup preserves a replacement ${phase} generation with the same call ID`, async () => {
  const call = { id: id(40), created_at: '2026-11-17T09:00:00.000Z', caller_profile_id: id(2), recipient_profile_id: id(3),
    media: 'voice', authorization: 'matched', grant_id: null, state: phase, version: 1, native_incoming: true, ended_at: null, deadline: null };
  const replacement = { ...call, created_at: '2026-11-17T09:01:00.000Z' };
  const view = { phase, session: call };
  const counts = { hangups: 0, actions: 0, releases: 0 };
  const product = { selfProfileId: id(2), accountUserId: id(1), authGeneration: 'epoch',
    services: { api: { getCall: async () => call, act: async () => { counts.actions++; return call; } } },
    controller: { getSnapshot: () => view, hangup: async () => { counts.hangups++; view.phase = 'ENDED'; } },
    answerNative: async () => { throw Error('End must not answer'); }, dispose: async () => {} };
  const coordinator = createNativeCallCoordinator({ enabled: () => true, current: () => true, now: Date.now,
    load: async () => product, deviceId: async () => id(4), close: async () => {},
    keepAlive: async () => { view.session = replacement; return async () => { counts.releases++; }; } });
  try {
    assert.deepEqual(await coordinator.handle({ cid: `betweener_connect:${call.id}`, action: 'end' }), { handled: true, success: false });
    assert.equal(counts.hangups, 0); assert.equal(counts.actions, 0); assert.equal(counts.releases, 1);
    assert.equal(view.session, replacement); assert.equal(view.phase, phase);
  } finally { await coordinator.dispose(); }
});
