'use strict';
// Executable specification only. Helpers stay inside this test file; no runtime exports.
// No provider, SDK client, database, native transport or analytical classifier is loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { createConnectStreamAdapter, assertConnectCallType } = require('../../../supabase/functions/_shared/connect-stream-adapter.ts');
const { runConnectEndJob } = require('../../../supabase/functions/_shared/connect-provider-worker.ts');
const sdkRoot = `${process.env.LOCALAPPDATA}/deno/npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63`;
const productPath = 'supabase/functions/_shared/connect-stream-adapter.ts';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalHash = hash(productPath);
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw new Error('offline_network_forbidden'); };
const results = [];
const scope = Object.freeze({ app: 1731011, type: 'betweener_connect', id: '00000000-0000-4000-8000-000000000034', generation: 'synthetic-generation' });
const sameScope = a => a && ['app', 'type', 'id', 'generation'].every(k => a[k] === scope[k]);
const error = (status, code) => ({ metadata: { responseCode: status }, code });
const capture = (overrides = {}) => ({ trustedServerBoundary: true, verifiedAppIdentity: true, serverAuthenticated: true,
  resourceVisibilityVerified: true,
  scope: { ...scope }, method: 'POST', route: 'mark_ended', requestId: 'synthetic-request',
  expectedRequestId: 'synthetic-request', before: 1, completed: 2, result: 'error', error: error(404, 16), ...overrides });
const absentRead = (overrides = {}) => capture({ method: 'GET', route: 'owned_call', before: 3, completed: 4,
  requestId: 'synthetic-read', expectedRequestId: 'synthetic-read', ...overrides });
const boundCapture = (c, method, route) => c && c.trustedServerBoundary === true && c.verifiedAppIdentity === true
  && c.serverAuthenticated === true && c.resourceVisibilityVerified === true
  && sameScope(c.scope) && c.method === method && c.route === route
  && typeof c.requestId === 'string' && c.requestId.length > 0 && c.requestId === c.expectedRequestId
  && Number.isFinite(c.before) && Number.isFinite(c.completed) && c.before <= c.completed;
const missing = c => c?.result === 'error' && c.error?.code === 16 && c.error?.metadata?.responseCode === 404;
const authError = c => c?.result === 'error' && [401, 403].includes(c.error?.metadata?.responseCode);

// Proposed normalised evidence contract. It makes no network calls and never certifies media.
function endOutcome(end, read) {
  const result = (outcome, reason) => ({ outcome, reason, scope:{...scope}, mediaEnforcement: 'UNVERIFIED',
    mayResolveControlIntent: ['END_ACCEPTED', 'CALL_ABSENCE_VERIFIED'].includes(outcome) });
  if (!boundCapture(end, 'POST', 'mark_ended')) return result('AMBIGUOUS', 'END_SCOPE_OR_PROVENANCE_INVALID');
  if (authError(end)) return result('AUTH_REJECTED', 'HTTP_AUTH_REJECTION');
  if (end.result === 'local_deadline' || (end.result === 'error' && end.error?.metadata?.responseCode === 408 && end.error?.code === 23)) {
    return result('TIMEOUT_UNKNOWN_EFFECT', 'TIMEOUT_DOES_NOT_PROVE_NONCOMMIT');
  }
  const status = end.response?.metadata?.responseCode;
  if (end.result === 'success' && Number.isInteger(status) && status >= 200 && status < 300
    && typeof end.response.duration === 'string' && end.response.duration.length > 0 && end.response.code === undefined) {
    return result('END_ACCEPTED', 'MATCHING_SUCCESS_RESPONSE');
  }
  if (missing(end)) {
    if (!boundCapture(read, 'GET', 'owned_call') || read.before < end.completed || read.requestId === end.requestId) {
      return result('AMBIGUOUS', 'ABSENCE_REPORT_UNCONFIRMED');
    }
    if (authError(read)) return result('AUTH_REJECTED', 'ABSENCE_READ_AUTH_REJECTION');
    if (missing(read)) return result('CALL_ABSENCE_VERIFIED', 'MATCHING_SERVER_READ_NOT_FOUND');
  }
  return result('AMBIGUOUS', 'NO_VALID_END_OR_ABSENCE_ACK');
}

function classifyCase(name, end, read, expected) {
  test(`ACK contract: ${name}`, () => {
    const actual = endOutcome(end, read);
    assert.equal(actual.outcome, expected);
    assert.equal(actual.mediaEnforcement, 'UNVERIFIED');
    assert.equal(actual.mayResolveControlIntent, ['END_ACCEPTED', 'CALL_ABSENCE_VERIFIED'].includes(expected));
    results.push({ name, expected, actual });
  });
}

test('pinned SDK end response and metadata have no media-cessation assertion', () => {
  const api = fs.readFileSync(`${sdkRoot}/src/gen/video/VideoApi.ts`, 'utf8');
  const types = fs.readFileSync(`${sdkRoot}/src/types.ts`, 'utf8');
  const models = fs.readFileSync(`${sdkRoot}/src/gen/models/index.ts`, 'utf8');
  assert.match(api, /async endCall[\s\S]*?mark_ended[\s\S]*?metadata: response.metadata/);
  assert.match(types, /responseCode: number/);
  const response = models.match(/export interface EndCallResponse \{([\s\S]*?)\n\}/)[1];
  assert.match(response, /duration: string/); assert.doesNotMatch(response, /cutoff|forwarding|terminated_at/);
});

async function originalEnd(thrown) {
  const adapter = createConnectStreamAdapter({ video: { call(type, id) {
    assert.equal(type, scope.type); assert.equal(id, scope.id);
    return { async end() { if (thrown) throw thrown; return { duration: '1ms', metadata: { responseCode: 200 } }; } };
  } } }, scope.app);
  return adapter.end({ id: scope.id });
}
test('current unmodified end accepts code-only, string-code and contradictory code16 errors', async () => {
  for (const e of [error(undefined, 16), error(401, 16), error(503, 16), error(404, '16')]) await assert.doesNotReject(originalEnd(e));
  await assert.rejects(originalEnd(error(403, 17)));
});
test('current worker can mark control completion true after the old code16/401 catch', async () => {
  const completions = [];
  const result = await runConnectEndJob({ call_id: scope.id, operation: 'end', lease: 'mock-only' },
    { async complete(_job, success) { completions.push(success); } }, { end: () => originalEnd(error(401, 16)) });
  assert.deepEqual(completions, [true]); assert.equal(result.success, true);
});
test('minimal proposed catch uses exact numeric code and HTTP status; it is not installed', () => {
  const wouldSwallow = e => e?.code === 16 && e.metadata?.responseCode === 404;
  assert.equal(wouldSwallow(error(404, 16)), true);
  for (const e of [error(undefined,16),error(401,16),error(403,16),error(503,16),error(404,'16'),error('404',16),error(404,17),{}]) assert.equal(wouldSwallow(e), false);
});

classifyCase('matching numeric 200 and SDK body', capture({ result:'success', response:{ duration:'1ms', metadata:{responseCode:200} } }), undefined, 'END_ACCEPTED');
classifyCase('matching numeric 201 also indicates acceptance only', capture({ result:'success', response:{ duration:'1ms', metadata:{responseCode:201} } }), undefined, 'END_ACCEPTED');
classifyCase('POST404/code16 plus fresh scoped server GET404/code16', capture(), absentRead(), 'CALL_ABSENCE_VERIFIED');
classifyCase('POST404 alone is not independently verified absence', capture(), undefined, 'AMBIGUOUS');
for (const status of [401,403]) classifyCase(`HTTP${status} takes precedence over contradictory code16`,capture({error:error(status,16)}),absentRead(),'AUTH_REJECTED');
classifyCase('trusted local deadline has unknown provider effect',capture({result:'local_deadline',error:undefined}),undefined,'TIMEOUT_UNKNOWN_EFFECT');
classifyCase('documented HTTP408/code23 timeout',capture({error:error(408,23)}),undefined,'TIMEOUT_UNKNOWN_EFFECT');
classifyCase('generic SDK wrapper cannot prove a timeout from prose',capture({error:{message:'request timeout'}}),undefined,'AMBIGUOUS');
for (const status of [429,500,503]) classifyCase(`HTTP${status} is not an end acknowledgement`,capture({error:error(status,16)}),absentRead(),'AMBIGUOUS');
classifyCase('code-only error cannot certify absence',capture({error:error(undefined,16)}),absentRead(),'AMBIGUOUS');
classifyCase('string code cannot certify absence',capture({error:error(404,'16')}),absentRead(),'AMBIGUOUS');
classifyCase('string HTTP status cannot certify absence',capture({error:error('404',16)}),absentRead(),'AMBIGUOUS');
classifyCase('204 with no pinned JSON response body remains ambiguous',capture({result:'success',response:{metadata:{responseCode:204}}}),undefined,'AMBIGUOUS');
classifyCase('resolved empty object remains ambiguous',capture({result:'success',response:{}}),undefined,'AMBIGUOUS');
classifyCase('2xx error envelope is contradictory',capture({result:'success',response:{duration:'1ms',code:16,metadata:{responseCode:200}}}),undefined,'AMBIGUOUS');
classifyCase('absence read finds an existing call',capture(),absentRead({result:'success',response:{metadata:{responseCode:200}}}),'AMBIGUOUS');
classifyCase('absence read is unauthorized',capture(),absentRead({error:error(403,17)}),'AUTH_REJECTED');
classifyCase('absence read times out',capture(),absentRead({result:'local_deadline',error:undefined}),'AMBIGUOUS');
classifyCase('wrong application cannot certify absence',capture(),absentRead({scope:{...scope,app:1731012}}),'AMBIGUOUS');
classifyCase('wrong call cannot certify absence',capture(),absentRead({scope:{...scope,id:'other'}}),'AMBIGUOUS');
classifyCase('wrong generation cannot certify absence',capture(),absentRead({scope:{...scope,generation:'old'}}),'AMBIGUOUS');
classifyCase('ordinary client report is not trusted server absence',capture(),absentRead({serverAuthenticated:false}),'AMBIGUOUS');
classifyCase('unknown application provenance cannot certify absence',capture({verifiedAppIdentity:false}),absentRead(),'AMBIGUOUS');
classifyCase('unverified resource visibility cannot certify absence',capture(),absentRead({resourceVisibilityVerified:false}),'AMBIGUOUS');
classifyCase('wrong route cannot certify absence',capture(),absentRead({route:'call_type'}),'AMBIGUOUS');
classifyCase('old read predates the end attempt',capture(),absentRead({before:0,completed:0.5}),'AMBIGUOUS');
classifyCase('inverted parent bracket is invalid',capture({before:3,completed:2}),absentRead(),'AMBIGUOUS');
classifyCase('mismatched request identity cannot certify an end',capture({requestId:'different'}),absentRead(),'AMBIGUOUS');

const conditions = Object.freeze({ authoritySerialized:true, noPostRevocationAuthorization:true, absoluteIssueTimeExpiry:true,
  lifetimeBound:true, allDevices:true, publication:true, reception:true, heldCredentialsCannotBypass:true,
  alternateIssuersCannotBypass:true, reconnectCannotReset:true, firstJoinCannotReset:true,
  restartedSessionCannotReset:true, delayedRenewalCannotExtend:true, controlOutageIndependent:true,
  authorityOutageStopsRenewal:true, clockAndEnforcementSlackBounded:true });
const conditionalCeiling = c => Object.keys(conditions).every(k=>c?.[k]===true)
  ? { status:'CONDITIONAL_ONLY', expression:'max(0,D-R)+e <= L+e', verified:false }
  : { status:'UNPROVEN', expression:null, verified:false };
test('symbolic exposure bound cancels R without choosing L or e', () => {
  // A=R-delta, D<=A+L, delta>=0. Coefficients are dimensionless, not time settings.
  const DminusRplusE={ R:1, delta:-1, L:1, e:1 }; DminusRplusE.R-=1;
  assert.deepEqual(DminusRplusE,{R:0,delta:-1,L:1,e:1});
  assert.equal(DminusRplusE.delta<=0,true);
  assert.equal(conditionalCeiling(conditions).status,'CONDITIONAL_ONLY');
  assert.equal(conditionalCeiling(conditions).verified,false);
});
for (const name of Object.keys(conditions)) test(`lease contract refuses a bound without ${name}`,()=>{
  assert.equal(conditionalCeiling({...conditions,[name]:false}).status,'UNPROVEN');
  assert.equal(conditionalCeiling({...conditions,[name]:undefined}).status,'UNPROVEN');
});
test('delayed relative-on-arrival renewal leaves an uncancelled arbitrary delay',()=>{
  const residual={L:1,e:1,deliveryDelay:1};assert.equal(residual.deliveryDelay>0,true);
  assert.equal(conditionalCeiling({...conditions,absoluteIssueTimeExpiry:false}).verified,false);
});

const initialSafety = () => ({ generation:scope.generation, local:'STOPPING', authority:'PENDING',
  provider:'PENDING', media:'EVIDENCE_UNAVAILABLE', rejoinAllowed:false });
function safety(state,event) {
  if(event.generation!==state.generation)return state;
  const next={...state};
  if(event.type==='LOCAL_VERIFIED') next.local=['microphoneStopped','cameraStopped','publisherClosed','receiverStopped'].every(k=>event[k]===true)?'STOPPED_VERIFIED':'STOP_UNVERIFIED';
  if(event.type==='LOCAL_FAILED')next.local='STOP_FAILED';
  if(event.type==='UI_CLOSED')return next;
  if(event.type==='AUTHORITY_COMMIT'&&event.trusted===true&&event.callId===scope.id&&event.app===scope.app)next.authority='COMMITTED';
  if(event.type==='PROVIDER_RECEIPT'&&sameScope(event.receipt?.scope)&&event.receipt?.mayResolveControlIntent===true
    && event.receipt.mediaEnforcement==='UNVERIFIED'&&['END_ACCEPTED','CALL_ABSENCE_VERIFIED'].includes(event.receipt.outcome))next.provider=event.receipt.outcome==='END_ACCEPTED'?'END_ACKNOWLEDGED':'ABSENCE_VERIFIED';
  return next;
}
const event=(type,rest={})=>({type,generation:scope.generation,...rest});
const stopped=()=>event('LOCAL_VERIFIED',{microphoneStopped:true,cameraStopped:true,publisherClosed:true,receiverStopped:true});
test('closing a screen proves neither local hardware shutdown nor server/provider termination',()=>{
  assert.deepEqual(safety(initialSafety(),event('UI_CLOSED')),initialSafety());
});
test('verified local shutdown leaves both remote axes pending',()=>{
  const s=safety(initialSafety(),stopped());assert.equal(s.local,'STOPPED_VERIFIED');assert.equal(s.authority,'PENDING');assert.equal(s.provider,'PENDING');assert.equal(s.media,'EVIDENCE_UNAVAILABLE');
});
test('one unverified local resource prevents a stopped confirmation',()=>{
  for(const field of ['microphoneStopped','cameraStopped','publisherClosed','receiverStopped'])assert.equal(safety(initialSafety(),{...stopped(),[field]:false}).local,'STOP_UNVERIFIED');
});
test('local failure can coexist with authoritative commit and provider acknowledgement',()=>{
  let s=safety(initialSafety(),event('LOCAL_FAILED'));
  s=safety(s,event('AUTHORITY_COMMIT',{trusted:true,callId:scope.id,app:scope.app}));
  s=safety(s,event('PROVIDER_RECEIPT',{receipt:endOutcome(capture({result:'success',response:{duration:'1ms',metadata:{responseCode:200}}}))}));
  assert.equal(s.local,'STOP_FAILED');assert.equal(s.authority,'COMMITTED');assert.equal(s.provider,'END_ACKNOWLEDGED');assert.equal(s.media,'EVIDENCE_UNAVAILABLE');assert.equal(s.rejoinAllowed,false);
});
test('a direct provider ACK before DB commit does not invent committed revocation',()=>{
  const receipt=endOutcome(capture({result:'success',response:{duration:'1ms',metadata:{responseCode:200}}}));
  const s=safety(initialSafety(),event('PROVIDER_RECEIPT',{receipt}));assert.equal(s.authority,'PENDING');assert.equal(s.local,'STOPPING');
});
test('stale generation and wrong-call commits cannot update this end intent',()=>{
  assert.deepEqual(safety(initialSafety(),{...stopped(),generation:'old'}),initialSafety());
  assert.deepEqual(safety(initialSafety(),event('AUTHORITY_COMMIT',{trusted:true,callId:'other',app:scope.app})),initialSafety());
});
test('malformed or wrong-scope provider receipts cannot change the local safety axes',()=>{
  for(const receipt of [{mayResolveControlIntent:true},{...endOutcome(capture(),absentRead()),scope:{...scope,id:'other'}},
    {...endOutcome(capture(),absentRead()),outcome:'MEDIA_SECURE'},{...endOutcome(capture(),absentRead()),mediaEnforcement:'VERIFIED'}])assert.deepEqual(safety(initialSafety(),event('PROVIDER_RECEIPT',{receipt})),initialSafety());
});
test('duplicate commit/ACK and reversed delivery never enable rejoin or assert enforcement',()=>{
  const commit=event('AUTHORITY_COMMIT',{trusted:true,callId:scope.id,app:scope.app});const ack=event('PROVIDER_RECEIPT',{receipt:endOutcome(capture(),absentRead())});
  const a=[commit,ack,commit,ack].reduce(safety,initialSafety()),b=[ack,commit].reduce(safety,initialSafety());assert.deepEqual(a,b);assert.equal(a.media,'EVIDENCE_UNAVAILABLE');assert.equal(a.rejoinAllowed,false);
});

const retained=JSON.parse(fs.readFileSync('docs/betweener-connect/stream-staging-connect-validation.json'));
const currentPolicy=retained.providerConfiguration.readback;
const proposedPolicy=structuredClone(currentPolicy);
for(const role of ['connect_voice','connect_video'])proposedPolicy.grants[role].push('end-call');
test('least-grant proposal adds only end-call to the two admitted membership roles',()=>{
  const changes=[];for(const [role,grants]of Object.entries(proposedPolicy.grants))for(const g of grants)if(!currentPolicy.grants[role].includes(g))changes.push([role,g]);
  assert.deepEqual(changes,[['connect_video','end-call'],['connect_voice','end-call']]);
  assert.deepEqual(proposedPolicy.settings,currentPolicy.settings);assert.deepEqual(proposedPolicy.grants.connect_invited,['read-call']);
});
test('current product policy validator continues to reject the proposed extra end grant',()=>{
  assert.doesNotThrow(()=>assertConnectCallType(currentPolicy));assert.throws(()=>assertConnectCallType(proposedPolicy),/connect_provider_policy_unsafe/);
});
// Narrow permission model, not a provider implementation. Existing other call grants are not changed.
const wouldAllowDirectEnd=({role,jwtValid,providerBlocked,member})=>jwtValid===true&&providerBlocked===false&&member===true
  && ['connect_voice','connect_video'].includes(role)&&proposedPolicy.grants[role].includes('end-call');
test('admitted voice/video role may end its member call but outsider/invited/global role gets no added power',()=>{
  for(const role of ['connect_voice','connect_video'])assert.equal(wouldAllowDirectEnd({role,jwtValid:true,providerBlocked:false,member:true}),true);
  for(const role of ['connect_invited','user','admin','call_member'])assert.equal(wouldAllowDirectEnd({role,jwtValid:true,providerBlocked:false,member:true}),false);
  assert.equal(wouldAllowDirectEnd({role:'connect_voice',jwtValid:true,providerBlocked:false,member:false}),false);
});
test('expired credentials, blocked and unknown-block-state participants cannot rely on direct end',()=>{
  for(const values of [{jwtValid:false,providerBlocked:false},{jwtValid:true,providerBlocked:true},{jwtValid:true,providerBlocked:undefined}])assert.equal(wouldAllowDirectEnd({role:'connect_voice',member:true,...values}),false);
});
test('membership grant is not a current DB-consent or physical-device binding',()=>{
  // The provider cannot infer an undelivered DB change. A stale member can still end, not reopen, its call.
  const oldMember={role:'connect_voice',jwtValid:true,providerBlocked:false,member:true,betaRevoked:true};
  assert.equal(wouldAllowDirectEnd(oldMember),true);assert.equal(proposedPolicy.grants.connect_voice.includes('join-ended-call'),false);
  assert.equal(proposedPolicy.grants.connect_voice.includes('send-video'),false);
});
test('control ACK does not imply current job lease completion, occupancy release or media proof',()=>{
  const receipt=endOutcome(capture(),absentRead());assert.equal(receipt.mayResolveControlIntent,true);
  const mayComplete=(databaseAck,currentLease,noCreatePending)=>receipt.mayResolveControlIntent&&databaseAck===true&&currentLease===true&&noCreatePending===true;
  assert.equal(mayComplete(false,true,true),false);assert.equal(mayComplete({},true,true),false);assert.equal(mayComplete(true,false,true),false);assert.equal(mayComplete(true,true,false),false);
  assert.equal(mayComplete(true,true,true),true);assert.equal(receipt.mediaEnforcement,'UNVERIFIED');
});

const capabilityQuestions=['absoluteExpiry','finiteSlack','controlOutage','rejoinRestart','renewalFence','apiVsSfuCredentials','ackSemantics','customTypeConfiguration'];
function paperGate(answers) {
  const values=capabilityQuestions.map(k=>answers?.[k]);
  const decision=values.includes('UNSUPPORTED')?'REMAIN_DISABLED_OR_REVIEW_ARCHITECTURE'
    :values.every(v=>v==='DOCUMENTED_SUPPORTED')&&answers.apiReferencesVerified===true?'SEPARATE_VERIFICATION_SCOPE_MAY_BE_PROPOSED':'CLARIFICATION_REQUIRED';
  return {decision,executionAuthorised:false,runtimeIntegration:'NOT_AUTHORISED',finiteRevocationBound:'UNVERIFIED'};
}
test('incomplete or unsupported provider answers never authorise capability execution',()=>{
  const all=Object.fromEntries(capabilityQuestions.map(k=>[k,'DOCUMENTED_SUPPORTED']));
  for(const k of capabilityQuestions){assert.equal(paperGate({...all,[k]:undefined,apiReferencesVerified:true}).decision,'CLARIFICATION_REQUIRED');
    assert.equal(paperGate({...all,[k]:'UNSUPPORTED',apiReferencesVerified:true}).decision,'REMAIN_DISABLED_OR_REVIEW_ARCHITECTURE');}
});
test('complete cited support answers permit only a separately reviewed future scope',()=>{
  const all=Object.fromEntries(capabilityQuestions.map(k=>[k,'DOCUMENTED_SUPPORTED']));
  assert.equal(paperGate(all).decision,'CLARIFICATION_REQUIRED');
  assert.deepEqual(paperGate({...all,apiReferencesVerified:true}),{decision:'SEPARATE_VERIFICATION_SCOPE_MAY_BE_PROPOSED',executionAuthorised:false,runtimeIntegration:'NOT_AUTHORISED',finiteRevocationBound:'UNVERIFIED'});
});

test.after(()=>{
  assert.equal(hash(productPath),originalHash);assert.equal(networkAttempts,0);
  const out=fs.mkdtempSync('tmp/connect-m2c0-contract-34/cases-');
  fs.writeFileSync(`${out}/contract-cases.json`,JSON.stringify({purpose:'OFFLINE_SPECIFICATION_ONLY',cases:results,networkAttempts,
    numericLeaseLifetimeChosen:false,numericEnforcementSlackChosen:false,hybridImplemented:false,liveAdapterChanged:false},null,2)+'\n',{flag:'wx'});
  console.log(`M2C0_CONTRACT_CASES=${out}/contract-cases.json`);
});
