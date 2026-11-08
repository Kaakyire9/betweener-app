const test = require('node:test'), assert = require('node:assert/strict');
const { createNativeCallCoordinator } = require('../features/connect/application/native-call-coordinator.ts');
const { createNativeAnswerLease } = require('../features/connect/media/native-answer-lease.ts');
const { createProductLeaseRegistry } = require('../features/connect/application/product-lease.ts');
const { createNativeSessionOwner } = require('../lib/auth/native-session-owner.ts');
const { nativeIncomingPolicy } = require('../features/connect/config/native-incoming-policy.ts');
const { id, jwt, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { fixture: productFixture } = require('./fixtures/connect-product-fixture.cjs');
function fixture() {
  let active = true, enabled = true, loads = 0, answers = 0, declines = 0, ends = 0, disposed = 0, released = 0;
  const call = { id: id(40), created_at: new Date().toISOString(), caller_profile_id: id(2), recipient_profile_id: id(3), media: 'voice',
    state: 'RINGING', authorization: 'matched', grant_id: null, version: 1, native_incoming: true, ended_at: null, deadline: new Date(Date.now() + 45000).toISOString() };
  const view = { session: null, phase: 'IDLE' }, closed = [], gate = deferred(); let wait = false;
  const product = { selfProfileId: id(3), accountUserId: id(1), authGeneration: 'epoch',
    services: { api: { getCall: async () => ({ ...call }), act: async () => { declines++; call.state = 'DECLINED'; call.ended_at = new Date().toISOString(); } } },
    controller: { getSnapshot: () => view, async hangup() { ends++; call.state = 'ENDED'; call.ended_at = new Date().toISOString(); view.phase = 'ENDED'; } },
    async answerNative() { answers++; if (wait) await gate.promise; if (!active || call.ended_at) return false; view.session = { ...call }; view.phase = 'ACTIVE'; call.state = 'ACTIVE'; return true; },
    async dispose() { disposed++; },
  };
  const coordinator = createNativeCallCoordinator({ enabled: () => enabled, load: async () => { loads++; return product; }, deviceId: async () => id(4),
    current: () => active, close: async (cid, reason) => { closed.push([cid, reason]); }, now: Date.now,
    keepAlive: async () => async () => { released++; } });
  const event = action => ({ cid: `betweener_connect:${call.id}`, action });
  return { coordinator, product, call, event, closed, gate, wait: () => { wait = true; }, switchAccount: () => { active = false; }, disable: () => { enabled = false; },
    counts: () => ({ loads, answers, declines, ends, disposed, released }) };
}
test('non-Connect native events leave Live dispatch untouched', async () => {
  const f = fixture(); assert.equal((await f.coordinator.handle({ cid: `livestream:${id(9)}`, action: 'answer' })).handled, false);
  assert.equal(f.counts().loads, 0); assert.deepEqual(f.closed, []);
});
test('disabled native actions never fall through to SDK auto-join', async () => {
  const f = fixture(); f.disable(); assert.deepEqual(await f.coordinator.handle(f.event('answer')), { handled: true, success: false });
  assert.equal(f.counts().loads, 0); assert.equal(f.closed.length, 1);
});
test('incoming inspection performs no accept, call creation or media work', async () => {
  const f = fixture(); assert.equal((await f.coordinator.handle(f.event('incoming'))).success, true);
  assert.equal(f.counts().answers, 0); assert.equal(f.counts().declines, 0); await f.coordinator.dispose();
});

test('pre-match native incoming and Answer cannot bypass matched-only launch', async () => {
  for (const action of ['incoming', 'answer']) {
    const f = fixture(); f.call.authorization = 'pre_match'; f.call.grant_id = id(9);
    assert.equal((await f.coordinator.handle(f.event(action))).success, false);
    assert.equal(f.counts().answers, 0); assert.equal(f.closed.length, 1); await f.coordinator.dispose();
  }
});

test('native End retains authority cleanup for a legacy pre-match call', async () => {
  const f = fixture(); f.call.authorization = 'pre_match'; f.call.grant_id = id(9);
  f.call.state = 'ACTIVE'; const view = f.product.controller.getSnapshot(); view.session = { ...f.call }; view.phase = 'ACTIVE';
  assert.equal((await f.coordinator.handle(f.event('end'))).success, true);
  assert.ok(f.counts().ends >= 1); assert.equal(f.call.state, 'ENDED'); await f.coordinator.dispose();
});
test('duplicate native Answer accepts exactly once; delayed ring does not end the active call', async () => {
  const f = fixture(); await f.coordinator.handle(f.event('incoming'));
  const values = await Promise.all([f.coordinator.handle(f.event('answer')), f.coordinator.handle(f.event('answer'))]);
  assert.ok(values.every(value => value.success)); assert.equal(f.counts().answers, 1);
  assert.equal((await f.coordinator.handle(f.event('incoming'))).success, true); assert.equal(f.counts().ends, 0);
  await f.coordinator.handle(f.event('end')); assert.ok(f.counts().ends >= 1); assert.equal(f.counts().released, 1);
});
test('system decline uses authenticated recipient decline and never answers', async () => {
  const f = fixture(); await f.coordinator.handle(f.event('end')); assert.equal(f.counts().declines, 1); assert.equal(f.counts().answers, 0);
});

test('late incoming or system Answer cannot retire the same call already answered in the app',async()=>{
  const f=fixture();f.call.state='ACTIVE';const view=f.product.controller.getSnapshot();view.session={...f.call};view.phase='ACTIVE';
  assert.equal((await f.coordinator.handle(f.event('incoming'))).success,true);
  let ready=0;assert.equal((await f.coordinator.handle({...f.event('answer'),onAnswerReady:()=>ready++})).success,true);
  assert.equal(ready,1);assert.equal(f.counts().ends,0);assert.equal(f.counts().answers,0);assert.deepEqual(f.closed,[]);
  await f.coordinator.dispose();
});

test('system End of an owned outgoing invitation uses the existing hangup controller',async()=>{
  const f=fixture();f.call.caller_profile_id=f.product.selfProfileId;f.call.recipient_profile_id=id(2);
  const view=f.product.controller.getSnapshot();view.session={...f.call};view.phase='RINGING';
  assert.equal((await f.coordinator.handle(f.event('end'))).success,true);
  assert.ok(f.counts().ends>=1);assert.equal(f.counts().declines,0);await f.coordinator.dispose();
});
for (const state of ['expired', 'terminal', 'wrong_recipient', 'disabled_call', 'switched_account']) test(`native Answer rejects ${state}`, async () => {
  const f = fixture();
  if (state === 'expired') f.call.deadline = '2000-01-01T00:00:00Z';
  if (state === 'terminal') f.call.ended_at = new Date().toISOString();
  if (state === 'wrong_recipient') f.call.recipient_profile_id = id(8);
  if (state === 'disabled_call') f.call.native_incoming = false;
  if (state === 'switched_account') f.switchAccount();
  assert.equal((await f.coordinator.handle(f.event('answer'))).success, false); assert.equal(f.counts().answers, 0); await f.coordinator.dispose();
});
test('account switch during native Answer cannot commit a late success', async () => {
  const f = fixture(); f.wait(); const work = f.coordinator.handle(f.event('answer')); await settle();
  f.switchAccount(); f.gate.resolve(); assert.equal((await work).success, false); await f.coordinator.dispose();
});
test('native setup lease expires and cannot grant another call or account', () => {
  let current = true, now = 0; const p = createNativeAnswerLease(() => current, () => now), cid = `betweener_connect:${id(1)}`;
  const release = p.begin(cid); assert.equal(p.allowed(cid), true); assert.equal(p.allowed(`betweener_connect:${id(2)}`), false);
  now = 20000; assert.equal(p.allowed(cid), false); release(); now = 0; p.begin(cid); current = false; assert.equal(p.allowed(cid), false);
});

test('native Answer readiness is fulfilled once and only for its live owned call', () => {
  let current=true,now=0,ready=0; const cid=`betweener_connect:${id(1)}`;
  const permit=createNativeAnswerLease(()=>current,()=>now);
  permit.ready(cid); assert.equal(ready,0);
  const release=permit.begin(cid,()=>ready++);
  permit.ready(`betweener_connect:${id(2)}`); assert.equal(ready,0);
  permit.ready(cid);permit.ready(cid); assert.equal(ready,1);
  release();permit.begin(cid,()=>ready++);current=false;permit.ready(cid);assert.equal(ready,1);
  current=true;now=20000;permit.ready(cid);assert.equal(ready,1);
});
test('React and native cold-start acquire one product and release it once', async () => {
  const native = createNativeSessionOwner(); native.accept({ user: { id: id(1) }, access_token: jwt() });
  const acquire = createProductLeaseRegistry(); let loads = 0, disposals = 0;
  const build = async () => { loads++; return { controller: {}, dispose: async () => { disposals++; } }; };
  const [a, b] = await Promise.all([acquire(native.owner, build), acquire(native.owner, build)]);
  assert.equal(a.controller, b.controller); assert.equal(loads, 1);
  await a.dispose(); assert.equal(disposals, 0); await b.dispose(); await b.dispose(); assert.equal(disposals, 1);
});
test('incoming configuration requires exact native staging identity and explicit provider aliases', () => {
  const identity = { development: true, platform: 'ios', variant: 'staging', environment: 'staging', bundleIdentifier: 'com.aduboffour.betweener.staging', supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co' };
  const config = { enabled: 'true', apnsProvider: 'connect-staging-apns', fcmProvider: 'connect-staging-fcm' };
  assert.equal(nativeIncomingPolicy(identity, config).enabled, true);
  for (const patch of [{ development: false }, { variant: 'production' }, { platform: 'web' }, { supabaseUrl: 'https://unapproved.invalid' }]) assert.equal(nativeIncomingPolicy({ ...identity, ...patch }, config).enabled, false);
  assert.equal(nativeIncomingPolicy(identity, { ...config, fcmProvider: '' }).enabled, false);
});
test('an explicit native Answer joins through existing admission while locked and keeps camera off', async () => {
  let permit = true;
  const f = productFixture(true, { nativeIncoming: true, backgroundAudio: true, nativeAnswerAllowed: () => permit, videoCalling: true, media: 'video' });
  f.background('background');
  await f.composition.controller.openCall(f.model.id); await f.composition.controller.accept();
  const state = f.composition.controller.getSnapshot();
  assert.equal(state.audioSetupStage, 'ready'); assert.equal(state.backgroundAudio, 'enabled'); assert.equal(state.muted, false);
  assert.equal(f.counts().createCount, 0); assert.equal(f.counts().credentialCount, 1); assert.equal(f.counts().permissionCalls, 0);
  assert.equal(f.cameraPreparationCount(), 0); assert.equal(f.cameraCounts().enabled, 0);
  permit = false; assert.equal(f.composition.owner().canContinueAudio(), true);
  await f.composition.controller.hangup(); assert.equal(f.tracks.every(track => track.readyState === 'ended'), true); await f.product.dispose();
});
test('missing prior microphone permission cannot activate capture from a locked Answer', async () => {
  const f = productFixture(true, { nativeIncoming: true, backgroundAudio: true, nativeAnswerAllowed: () => true });
  f.permission('blocked'); f.background('background'); await f.composition.controller.openCall(f.model.id); await f.composition.controller.accept();
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.counts().permissionCalls, 0); assert.equal(f.events.includes('capture'), false); await f.product.dispose();
});
