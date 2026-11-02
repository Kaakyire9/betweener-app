const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readIntentCallingContext, intentConsentPresentation } = require('../features/connect/domain/intent-consent.ts');
const { readConnectPushData, connectPushDeliveryOptions, CONNECT_PUSH_TYPES } = require('../supabase/functions/_shared/connect-push-contract.ts');
const { boundConnectNotificationTarget, readNotificationBinding, notificationMatchesCall, connectNotificationAccountAllowed } = require('../features/connect/domain/notification-binding.ts');
const { subscribePushRegistrations, notifyPushRegistration } = require('../lib/notifications/push-registration-events.ts');
const { fixture, id, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { createAuthenticatedConnectServices } = require('../features/connect/data/authenticated-connect-services.ts');
const expiry = '2099-01-01T00:00:00Z';
const consent = () => ({ intent_id: id(20), requester_profile_id: id(2), recipient_profile_id: id(3), intent_status: 'pending', intent_expires_at: expiry,
  available: true, offer_voice: true, offer_video: true, can_call_voice: false, grant: null });
const grant = patch => ({ id: id(21), intent_id: id(20), requester_profile_id: id(2), recipient_profile_id: id(3), voice: false, video: false,
  requested_voice: true, requested_video: true, status: 'pending', expires_at: expiry, accepted_at: null, revoked_at: null, ...patch });
const payload = type => ({ type, call_id: id(10), call_generation: '2026-10-31 10:00:00+00', call_version: 2, recipient_user_id: id(1) });
test('text Intent acceptance and sender offers never imply media permission', () => {
  for (const intent_status of ['pending','accepted']) {
    const c = { ...consent(), intent_status, grant: grant() };
    assert.equal(intentConsentPresentation(c, id(2)).canCallVoice, false);
    assert.equal(intentConsentPresentation(c, id(2)).canDecide, false);
    assert.equal(intentConsentPresentation(c, id(3)).canDecide, true);
  }
});
test('voice approval does not approve video or reverse initiation', () => {
  const c = { ...consent(), can_call_voice: true, grant: grant({ status: 'accepted', voice: true, accepted_at: '2026-10-31T00:00:00Z' }) };
  assert.equal(intentConsentPresentation(c, id(2)).canCallVoice, true); assert.equal(c.grant.video, false);
  assert.equal(intentConsentPresentation(c, id(3)).canCallVoice, false);
});
for (const status of ['passed','expired','cancelled','matched']) test(`${status} text Intent cannot offer or start pre-match calling`, () => {
  const c = { ...consent(), intent_status: status, can_call_voice: true, grant: grant({ status: 'accepted', voice: true }) };
  const p = intentConsentPresentation(c, id(2)); assert.equal(p.canOffer, false); assert.equal(p.canCallVoice, false);
});
for (const patch of [{ available: false }, { intent_expires_at: '2000-01-01' }, { grant: grant({ status: 'revoked', revoked_at: '2026-10-31' }) },
  { grant: grant({ status: 'accepted', voice: true, expires_at: '2000-01-01' }) }]) test(`revoked/expired/unavailable context fails closed ${JSON.stringify(patch)}`, () => {
  const c = { ...consent(), can_call_voice: true, grant: grant({ status: 'accepted', voice: true }), ...patch };
  assert.equal(intentConsentPresentation(c, id(2)).canCallVoice, false);
});
test('grant response binding rejects wrong Intent, party, media and malformed flags', () => {
  for (const patch of [{ intent_id: id(99) }, { requester_profile_id: id(9) }, { available: 'true' }, { grant: grant({ recipient_profile_id: id(8) }) },
    { grant: grant({ voice: true, requested_voice: false }) }, { grant: grant({ expires_at: 'invalid' }) }]) assert.throws(() => readIntentCallingContext({ ...consent(), ...patch }, id(20), id(2)), /unavailable/);
  assert.equal(readIntentCallingContext(consent(), id(20), id(2)).grant, null);
});
test('consent methods use existing recipient RPCs and pinned epoch, never credentials', async () => {
  const f = fixture(), events = [];
  const services = createAuthenticatedConnectServices(f.nativeAuth.owner, id(2), { rpc: async (name, args, token) => { events.push({ name,args,token }); return { data: name.includes('get_intent') ? consent() : null, error:null }; }, credentials:()=>{throw Error('forbidden');}, peer:()=>{throw Error('forbidden');} });
  await services.consent.get(id(20)); await services.consent.offer(id(20),true,false); await services.consent.decide(id(21),false,false); await services.consent.withdraw(id(21));
  assert.deepEqual(events.map(e=>e.name),['rpc_connect_get_intent_consent','rpc_connect_request_grant','rpc_connect_decide_grant','rpc_connect_revoke_grant']);
  assert.deepEqual(events[2].args,{p_grant:id(21),p_voice:false,p_video:false});
  f.nativeAuth.invalidate(); await assert.rejects(services.consent.offer(id(20),true,false), /unauthenticated/); assert.equal(events.length,4); await f.product.dispose();
});
test('late consent responses are rejected after account retirement', async () => {
  const f=fixture(), gate=deferred();
  const s=createAuthenticatedConnectServices(f.nativeAuth.owner,id(2),{rpc:()=>gate.promise,credentials:async()=>null,peer:async()=>null});
  const read=s.consent.get(id(20)); f.nativeAuth.invalidate(); gate.resolve({data:consent(),error:null});
  await assert.rejects(read,/unauthenticated/); await f.product.dispose();
});
for (const type of CONNECT_PUSH_TYPES) test(`${type} has a closed private-free account/generation envelope`, () => {
  const d=payload(type), t=boundConnectNotificationTarget(d,true); assert.equal(t.params.recipientUserId,id(1));
  assert.equal(t.params.callId,id(10)); assert.equal(t.params.callVersion,'2'); assert.equal(boundConnectNotificationTarget(d,false),null);
  for(const [key,value] of Object.entries({token:'secret',api_key:'secret',accepted:true,name:'private',avatar:'private',media:'video'})) assert.equal(readConnectPushData({...d,[key]:value}),null);
});
test('malformed and incomplete push binding cannot fall back to a generic call route', () => {
  for(const patch of [{call_id:'wrong'},{recipient_user_id:null},{call_generation:'bad'},{call_version:0},{call_version:'2'},{type:'connect_voice_accepted'}]) assert.equal(boundConnectNotificationTarget({...payload('connect_voice_incoming'),...patch},true),null);
  assert.equal(readNotificationBinding({recipientUserId:id(1)}),'invalid'); assert.equal(readNotificationBinding({}),null);
});
test('logged-out/switched-account deferred routes deny while ordinary routes are preserved', () => {
  const t=boundConnectNotificationTarget(payload('connect_voice_incoming'),true);
  assert.equal(connectNotificationAccountAllowed(t.pathname,t.params,null),false);
  assert.equal(connectNotificationAccountAllowed(t.pathname,t.params,id(9)),false);
  assert.equal(connectNotificationAccountAllowed(t.pathname,t.params,id(1)),true);
  assert.equal(connectNotificationAccountAllowed('/chat/[id]',{},null),true);
});
test('stale notification can show a canonical terminal call but cannot substitute a generation/future version', () => {
  const d=payload('connect_voice_incoming'), b=readNotificationBinding(boundConnectNotificationTarget(d,true).params);
  const call={created_at:d.call_generation,version:4,state:'MISSED'};
  assert.equal(notificationMatchesCall(b,id(1),call),true);
  assert.equal(notificationMatchesCall(b,id(9),call),false);
  assert.equal(notificationMatchesCall(b,id(1),{...call,created_at:'2026-10-30'}),false);
  assert.equal(notificationMatchesCall({...b,callVersion:'9'},id(1),call),false);
});
test('Edge push switch requires explicit staging and never enables production', () => {
  const d=payload('connect_voice_incoming'), good={enabled:true,environment:'staging',applicationId:'com.aduboffour.betweener.staging'};
  assert.equal(connectPushDeliveryOptions(d,good).ttl,45);
  for(const patch of [{enabled:false},{environment:'production'},{applicationId:'com.aduboffour.betweener'}]) assert.equal(connectPushDeliveryOptions(d,{...good,...patch}),null);
});
test('push registration events cannot prevent normal push and unsubscribe cleanly', () => {
  let count=0; const a=subscribePushRegistrations(()=>{throw Error('consumer');}),b=subscribePushRegistrations(()=>count++);
  notifyPushRegistration(id(1),id(6));assert.equal(count,1);a();b();notifyPushRegistration(id(1),id(6));assert.equal(count,1);
});
test('duplicate incoming/accept and delayed terminal notification never mint a second owner', async () => {
  const f=fixture(true); await Promise.all([f.product.controller.openCall(f.model.id),f.product.controller.openCall(f.model.id)]);
  await Promise.all([f.product.controller.accept(),f.product.controller.accept()]);
  assert.equal(f.counts().credentialCount,1); await f.product.controller.hangup();
  const count=f.counts().credentialCount; await f.product.controller.openCall(f.model.id);assert.equal(f.counts().credentialCount,count);await f.product.dispose();
});
test('blocked during ringing cannot produce accepted media and still cleans up', async () => {
  const f=fixture(true);await f.product.controller.openCall(f.model.id);f.eligible(false);await f.product.controller.accept();
  assert.equal(f.counts().credentialCount,0);assert.equal(f.events.includes('capture'),false);await f.product.dispose();
});
test('signed out consent recovery cannot retain the native owner', async()=>{
  const f=fixture();await f.active();f.nativeAuth.invalidate();await settle();assert.equal(f.composition.owner().getSnapshot().retired,true);await f.product.dispose();
});
test('server code reuses canonical outbox and staging voice leaves video and push off', () => {
  const sql=fs.readFileSync('supabase/migrations/20261031191352_connect_m3_1_intent_and_notifications.sql','utf8');
  assert.ok(!/create table/i.test(sql));assert.match(sql,/notifications_enabled boolean not null default false/);
  assert.match(sql,/dispatch_push_notification_event_v1/);assert.match(sql,/connect_push_current\(p_event_id\)/);
  const {connectRuntimeAvailability}=require('../features/connect/config/connect-runtime-policy.ts');
  const identity={development:true,platform:'android',variant:'staging',environment:'staging',bundleIdentifier:'com.aduboffour.betweener.staging',supabaseUrl:'https://xsgzxadwuxuziubglvps.supabase.co'};
  assert.deepEqual(connectRuntimeAvailability(identity),{ui:true,runtime:true,video:false});
  assert.equal(connectRuntimeAvailability({...identity,variant:'production'}).runtime,false);
});
test('staging pair restriction retains every existing match, preference and media-specific grant predicate',()=>{
  const read=p=>fs.readFileSync(p,'utf8');
  const body=s=>s.match(/function private\.connect_authorized\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)[1].replace(/\s+/g,' ').trim();
  const original=body(read('supabase/migrations/20261028074908_connect_v1_foundation.sql'));
  const current=body(read('supabase/migrations/20261031191352_connect_m3_1_intent_and_notifications.sql'));
  assert.equal(current.replace('private.connect_test_pair_allowed(p_caller,p_recipient) and ',''),original);
});
