const test = require('node:test'), assert = require('node:assert/strict');
const { callHistoryLabel, loadRecentCallHistory } = require('../features/connect/domain/call-history.ts');
const { voiceCompletionMessage } = require('../features/connect/voice/call-presentation.ts');
const { fixture, deferred } = require('./fixtures/connect-product-fixture.cjs');
for (const media of ['voice', 'video']) test(`${media} history and missed-call wording stay media-specific`, () => {
  assert.equal(callHistoryLabel({ media, state: 'MISSED' }), `Missed ${media} call`);
  assert.equal(voiceCompletionMessage({ phase: 'ENDED', incoming: true, session: { media, state: 'MISSED' } }), `You missed this ${media} call.`);
});
test('recent history resolves a repeated peer once and preserves equal-timestamp calls', async () => {
  let peers = 0; const rows = Array.from({ length: 40 }, (_, id) => ({ id, caller_profile_id: 'self', recipient_profile_id: 'peer', created_at: 'same-timestamp' }));
  const result = await loadRecentCallHistory({ api: { getHistory: async (before, limit) => { assert.equal(before, null); return rows.slice(0, limit); } },
    selfProfileId: 'self', limit: 40, current: () => true, peer: async id => { peers++; return { profileId: id, name: 'Peer' }; } });
  assert.equal(result.length, 40); assert.equal(peers, 1);
});
test('logout during history loading discards rows before requesting peer details', async () => {
  const gate = deferred(); let current = true, peers = 0;
  const reading = loadRecentCallHistory({ api: { getHistory: () => gate.promise }, selfProfileId: 'self', limit: 20,
    current: () => current, peer: async () => { peers++; } });
  current = false; gate.resolve([{ caller_profile_id: 'self', recipient_profile_id: 'peer' }]);
  assert.equal(await reading, null); assert.equal(peers, 0);
});
test('foreground minimize preserves audio and stops video before returning to chat', async () => {
  const f = fixture(false, { media: 'video', videoCalling: true }); await f.active(); await f.composition.controller.toggleCamera();
  assert.equal(await f.composition.controller.minimize(), true);
  assert.equal(f.sdkState.cameraStatus, 'disabled'); assert.equal(f.sdkState.microphoneStatus, 'enabled');
  assert.equal(f.composition.controller.getSnapshot().minimized, true);
  f.composition.controller.restore(); assert.equal(f.cameraCounts().enabled, 1);
  await f.product.dispose(); await f.composition.owner().release();
});
