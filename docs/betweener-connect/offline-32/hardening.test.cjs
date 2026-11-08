'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const { analysePhase, analyseBoundary } = require('./analysis.ts');
const { replayB3, replayBoundary, contextForReceipt } = require('./receipts.ts');
const { phase, context, injectFresh, healthy, bytes, eligibleComparison } = require('./test-fixtures.cjs');
const codes = a => a.issues?.map(x => x.code) ?? [];
function changed(name, change, expectedCode) {
  test(name, () => {
    const p = phase(); const c = context(); change(p, c); const a = analysePhase(p, c);
    assert.equal(a.media, 'INCONCLUSIVE'); assert.ok(codes(a).includes(expectedCode), JSON.stringify(a.issues));
    assert.equal(a.universalSecurityPass, false);
  });
}
changed('duplicated provider user identities reject positive and negative corroboration', p => { p.bindings[1].userId=p.bindings[0].userId; injectFresh(p); }, 'USER_OR_RAW_SESSION_DUPLICATED');
changed('duplicated raw identities cannot be rescued by a valid-looking fresh frame', p => { p.bindings[1].rawSessionId=p.bindings[0].rawSessionId; injectFresh(p); }, 'USER_OR_RAW_SESSION_DUPLICATED');
changed('wrong call CID rejects analytical corroboration', p => { p.trigger.provider.cid='betweener_connect:other'; }, 'ENDED_CALL_BINDING_MISMATCH');
changed('wrong provider session rejects corroboration', (p,c) => { c.providerSessionId='other-session'; }, 'PROVIDER_SESSION_PROVENANCE_INVALID');
changed('contradictory session in an ended provider read is invalid', p => { p.trigger.provider.session={id:'other-session'}; }, 'ENDED_PROVIDER_SESSION_MISMATCH');
changed('parent target generation UTC cannot precede its trigger', p => { p.targets[0].generated.utc='2020-01-01T00:00:00Z'; }, 'FRESH_TARGET_INVALID');
changed('blank raw-session identity is invalid even when both context and binding agree', (p,c) => { c.participants[0].rawSessionId=' ';p.bindings[0].rawSessionId=' '; }, 'PARTICIPANT_CONTEXT_INVALID');
changed('wrong receiver tag rejects corroboration', p => { p.samples[3].peers[0].audio.receivers[0].receiver=2; }, 'TRACK_SSRC_RECEIVER_BINDING_MISMATCH');
changed('changed track is invalid evidence', p => { p.samples[4].peers[0].audio.receivers[0].trackId='other'; }, 'TRACK_SSRC_RECEIVER_BINDING_MISMATCH');
changed('changed outbound source track is invalid evidence', p => { p.samples[4].peers[0].peers.publisher.rtp[0].trackIdentifier='other'; }, 'TRACK_SSRC_RECEIVER_BINDING_MISMATCH');
changed('changed SSRC is invalid evidence', p => { p.samples[4].peers[0].peers.sub.rtp[0].ssrc++; }, 'TRACK_SSRC_RECEIVER_BINDING_MISMATCH');
changed('duplicate RTP observations are not extra independent streams', p => { p.samples[4].peers[0].peers.sub.rtp.push({...p.samples[4].peers[0].peers.sub.rtp[0]}); }, 'TRACK_SSRC_RECEIVER_BINDING_MISMATCH');
changed('browser clock epoch change is invalid', p => { p.samples[4].peers[0].audio.clock.timeOrigin++; }, 'BROWSER_CLOCK_EPOCH_CHANGED');
changed('SFU end before join is invalid in the same child clock', p => { for(const s of p.samples)for(const signal of s.signaling){const j=signal.events.find(e=>e.type==='joinResponse');for(const e of signal.events)if(e.type==='callEnded')e.at={...j.at,mono:j.at.mono-1};} }, 'EVENT_CLOCK_ORDER_INVALID');
changed('malformed event arrays fail closed without throwing', p => { p.samples[3].signaling[0].events='broken'; }, 'EVENT_ARRAY_MISSING');
changed('malformed signaling pair is explicit invalid evidence', p => { p.samples[3].signaling={}; }, 'SIGNALING_PAIR_MISSING_OR_INVALID');
changed('missing event stamp is not substituted with a later valid event', p => { p.samples[0].signaling[0].events.unshift({type:'callEnded'}); }, 'EVENT_STAMP_OR_TYPE_INVALID');
changed('duplicate event within a snapshot is invalid', p => { const e=p.samples[0].signaling[0].events.find(e=>e.type==='callEnded');p.samples[0].signaling[0].events.push({...e}); }, 'DUPLICATE_EVENT_OBSERVATION');
changed('cumulative history cannot silently lose an observed event', p => { p.samples[10].signaling[0].events=p.samples[10].signaling[0].events.filter(e=>e.type!=='callEnded'); }, 'CUMULATIVE_EVENT_HISTORY_REGRESSED');
changed('contradictory duplicate timestamp is rejected', p => { const e=p.samples[10].signaling[0].events.find(e=>e.type==='callEnded');e.at.utc='2030-01-01T00:00:00Z'; }, 'EVENT_OBSERVATION_CONTRADICTED');
changed('relabelled control PCM cannot become a fresh target', p => { const f=p.controls[1].audio.receivers[0].frames[0];p.samples.at(-1).peers[1].audio.receivers[0].frames.push({...f,nonce:p.targets[0].nonce,phase:1,sender:1}); }, 'PCM_INTERVAL_REASSIGNED');
changed('stale worklet clock cannot qualify a later PCM interval', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1)f.audioWorkletFrame=1; }, 'FRESH_PCM_CLOCK_PROVENANCE_INVALID');
changed('future browser observation cannot qualify a frame', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1)f.observed.mono+=1e9; }, 'FRESH_PCM_CLOCK_PROVENANCE_INVALID');
changed('frame UTC contradiction in its own browser epoch is invalid', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1)f.observed.utc='2030-01-01T00:00:00Z'; }, 'FRESH_PCM_CLOCK_PROVENANCE_INVALID');
changed('wrong frame sample rate is not the calibrated sample clock', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1){f.sampleRate=44100;f.endSample=f.startSample+176400;} }, 'FRESH_PCM_CLOCK_PROVENANCE_INVALID');
changed('out-of-range frame interval cannot qualify', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1){f.startSample=s.peers[1].audio.receivers[0].samples+1;f.endSample=f.startSample+192000;} }, 'FRESH_PCM_CLOCK_PROVENANCE_INVALID');
changed('bad CRC does not qualify and does not establish cutoff', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1)f.crcValid=false; }, 'TARGET_FRAME_NOT_QUALIFIED');
changed('low confidence never weakens the original threshold', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1)f.confidence=0.969; }, 'TARGET_FRAME_NOT_QUALIFIED');
changed('impossible confidence does not certify fresh content', p => { injectFresh(p);for(const s of p.samples)for(const f of s.peers[1].audio.receivers[0].frames)if(f.phase===1)f.confidence=2; }, 'TARGET_FRAME_NOT_QUALIFIED');
changed('duplicate decoded observations are invalid and not multiple fresh proofs', p => { injectFresh(p);const s=p.samples[35];s.peers[1].audio.receivers[0].frames.push({...s.peers[1].audio.receivers[0].frames.at(-1)}); }, 'DUPLICATE_FRAME_OBSERVATION');
changed('a frozen receiver metric remains invalid with fresh polling metadata', p => { for(const s of p.samples)s.peers[0].peers.sub.rtp[0].timestamp=1; }, 'RTP_STATS_CLOCK_DOMAIN_OR_AGE_INVALID');
changed('counter reset against the pre-trigger baseline is invalid', p => { for(const s of p.samples){s.peers[0].peers.sub.rtp[0].bytesReceived=1;s.peers[0].peers.sub.rtp[0].packetsReceived=1;} }, 'BASELINE_RTP_COUNTER_OR_CLOCK_RESET');
changed('sparse samples do not inherit the runner completion claim', p => { p.samples=p.samples.filter((s,i)=>i<4||i>200); }, 'SAMPLING_GAP_EXCEEDS_V2_PROFILE');
changed('late capture start is independently incomplete', p => { p.samples=p.samples.filter((s,i)=>i>20); }, 'OBSERVATION_INTERVAL_INCOMPLETE');
changed('duplicated parent observation brackets are invalid', p => { p.samples.splice(5,0,structuredClone(p.samples[5])); }, 'SAMPLE_ORDER_OR_DUPLICATE_INVALID');
changed('decoder callbacks must advance across observations', p => { for(const s of p.samples){s.peers[0].audio.receivers[0].samples=2048;s.peers[0].audio.receivers[0].chunks=1;} }, 'DECODER_OR_BROWSER_CLOCK_NOT_ADVANCING');
changed('source silence across the full tail is not evidence of cutoff', p => { for(const s of p.samples)s.peers[0].audio.sourcePeak=0; }, 'SOURCE_WAVEFORM_NOT_LIVE_IN_TAIL');
test('valid fresh proof survives a later incomplete negative window', () => { const p=phase();injectFresh(p);p.windowComplete=false;const a=analysePhase(p,context());assert.equal(a.media,'FRESH_MEDIA_AFTER_END');assert.equal(a.fullWindow,false); });
test('valid fresh proof survives a later process failure', () => { const p=phase();injectFresh(p);p.processFailure=true;const a=analysePhase(p,context());assert.equal(a.media,'FRESH_MEDIA_AFTER_END');assert.ok(codes(a).includes('MEASUREMENT_PROCESS_OR_CLEANUP_INCOMPLETE')); });
test('no post-trigger PCM anchor yields explicit missing evidence', () => { const p=phase();injectFresh(p);p.samples=p.samples.slice(35,36);const a=analysePhase(p,context());assert.equal(a.media,'INCONCLUSIVE');assert.ok(a.facts.freshContent.status!=='VALID'); });
test('incomplete input and malformed peers never throw or grant universal success', () => { for(const p of [null,{},[],{samples:'bad'},{samples:[null]}, {bindings:[null,null]}]){const a=analysePhase(p,{});assert.equal(a.media,'INCONCLUSIVE');assert.equal(a.universalSecurityPass,false);assert.ok(a.issues.length);} });
test('missing termination event is distinct from malformed events', () => { const p=phase();for(const s of p.samples)for(const signal of s.signaling){signal.events=signal.events.filter(e=>e.type!=='callEnded');signal.callEndedObserved=false;}const a=analysePhase(p,context());assert.equal(a.facts.sfuEvent.status,'MISSING');assert.equal(a.signaling,'NOT_ESTABLISHED'); });
test('B3 exact replay preserves security verdicts and bounded observations', () => { const a=replayB3(bytes);assert.equal(a.status,'VALID');assert.deepEqual(a.phases.map(p=>p.historical.verdict),['INCONCLUSIVE','INCONCLUSIVE']);assert.equal(a.phases[0].analytical.media,'OBSERVED_RECEIVER_RTP_QUIESCENCE');assert.equal(a.phases[1].analytical.comparison.eligible,false); });
test('historical B3 digest mismatch cannot be disguised as a historical replay', () => { const x=Buffer.from(bytes);x[50]^=1;assert.equal(replayB3(x).status,'INVALID'); });

test('generic receipt extraction does not infer authenticated or noncooperative harness provenance', () => {
  const c=contextForReceipt(JSON.parse(bytes));const a=analysePhase(phase(),c);
  assert.equal(c.authenticatedSessionPath,false);assert.equal(c.nonCooperativeHarness,false);
  assert.equal(a.media,'INCONCLUSIVE');assert.equal(a.signaling,'NOT_ESTABLISHED');
});

test('missing source noncooperation is explicit rather than an implied complete certificate', () => {
  const c=context();c.nonCooperativeHarness=false;const a=analysePhase(phase(),c);
  assert.equal(a.media,'INCONCLUSIVE');assert.ok(codes(a).includes('NONCOOPERATIVE_SOURCE_PROVENANCE_MISSING'));
});
test('Report18 exact replay retains measured growth and historical FAIL only at the pinned hash', () => { const b=fs.readFileSync('tmp/connect-boundary/provider-results.json');const a=replayBoundary(b);assert.equal(a.historicalTimerVerdict,'FAIL');assert.deepEqual(a.analytical.receivingGrowth.map(g=>g.bytes),[25956,26208]);b[20]^=1;assert.equal(replayBoundary(b).status,'INVALID'); });
test('generic flat boundary projection never inherits historical FAIL or RTP growth', () => { const b=JSON.parse(fs.readFileSync('tmp/connect-boundary/provider-results.json'));const c=b.calls[1];const ended=c.timerSamples.filter(s=>s.provider.ended);for(const s of ended)for(let i=0;i<2;i++)s.stats[i].receivedAudio={...ended[0].stats[i].receivedAudio};const a=analyseBoundary(b);assert.equal(a.media,'NO_POST_END_RTP_GROWTH_OBSERVED');assert.equal(a.historicalVerdict,'NOT_ATTESTED_BY_GENERIC_PROJECTION'); });
test('malformed boundary and counter regressions remain invalid, never cutoff', () => { for(const b of [null,{}, {calls:[{name:'active_timer_with_end_failure',timerSamples:[{}]}]}])assert.equal(analyseBoundary(b).media,'INCONCLUSIVE'); });
test('comparison rejects a wrong-call ACK with a structured reason', () => { const p=phase(1),c=context(1);c.explicitAck.callId='other';const a=analysePhase(p,c);assert.equal(a.comparison.eligible,false);assert.ok(codes(a).includes('EXPLICIT_ACK_INVALID')); });
test('comparison rejects absent ACK and future prior samples specifically', () => { const p=phase(1),c=context(1);delete c.explicitAck;c.priorSample=healthy(c.priorSample);c.priorSample.before.mono=p.trigger.completed.mono+100;c.priorSample.completed.mono=p.trigger.completed.mono+120;const a=analysePhase(p,c);assert.ok(codes(a).includes('EXPLICIT_ACK_EVIDENCE_MISSING'));assert.ok(codes(a).includes('PRIOR_SNAPSHOT_IN_FUTURE')); });
test('comparison rejects a stale snapshot even if its layers look healthy', () => { const p=phase(1),c=context(1);c.priorSample=healthy(c.calibration);c.priorPreviousSample=healthy(c.calibration);const a=analysePhase(p,c);assert.equal(a.comparison.eligible,false);assert.ok(codes(a).includes('PRIOR_SNAPSHOT_STALE')); });
test('replayed phase nonce is invalid before either analytical proof branch', () => { const p=phase(1),c=context(1);p.targets[0].nonce=c.previouslyUsedNonces[0];const a=analysePhase(p,c);assert.equal(a.media,'INCONCLUSIVE');assert.ok(codes(a).includes('NONCE_REPLAYED_FROM_EARLIER_PHASE')); });
test('eligible comparison is not a completed comparison while its later window is incomplete', () => {
  const {p,c}=eligibleComparison();p.windowComplete=false;const a=analysePhase(p,c);
  assert.equal(a.comparison.eligible,true,JSON.stringify(a.issues));assert.equal(a.comparison.status,'ELIGIBLE_FOR_COMPARISON');
  assert.equal(a.comparison.windowCompleted,false);assert.equal(a.comparison.causalEvidence,'NOT_ESTABLISHED');assert.equal(a.comparison.causalProof,false);
});
test('completed synthetic comparison reports only an end-associated observation, never causal or universal proof', () => {
  const {p,c}=eligibleComparison();const a=analysePhase(p,c);assert.equal(a.comparison.eligible,true,JSON.stringify(a.issues));
  assert.equal(a.comparison.status,'COMPARISON_COMPLETED');assert.equal(a.media,'OBSERVED_RECEIVER_RTP_QUIESCENCE');
  assert.equal(a.comparison.causalEvidence,'CORROBORATED_TEMPORAL_ASSOCIATION_ONLY');assert.equal(a.comparison.causalProof,false);assert.equal(a.universalSecurityPass,false);
});
test('same-session comparison fails if historical transport loss preceded a recovered-looking arm', () => {
  const {p,c}=eligibleComparison();c.historyBeforeTrigger.unshift(phase().samples[50]);const a=analysePhase(p,c);
  assert.equal(a.comparison.eligible,false);assert.ok(codes(a).includes('EARLIER_TRANSPORT_FAILURE'));
});

test('an unavailable ACK never labels a complete polling window a completed comparison', () => {
  const {p,c}=eligibleComparison();delete c.explicitAck;const a=analysePhase(p,c);
  assert.equal(a.fullWindow,true);assert.equal(a.comparison.status,'UNAVAILABLE');assert.equal(a.comparison.windowCompleted,false);
});

test('contradictory ACK wall-clock stamps cannot qualify with unchanged parent monotonic values', () => {
  const {p,c}=eligibleComparison();c.explicitAck.completed.utc='2030-01-01T00:00:00Z';const a=analysePhase(p,c);
  assert.equal(a.comparison.eligible,false);assert.ok(codes(a).includes('EXPLICIT_ACK_INVALID'));
});

test('a frozen pre-intervention decoder invalidates eligibility despite receiving counters', () => {
  const {p,c}=eligibleComparison();c.priorSample.peers[0].audio.receivers[0].samples=c.priorPreviousSample.peers[0].audio.receivers[0].samples;
  c.priorSample.peers[0].audio.receivers[0].chunks=c.priorPreviousSample.peers[0].audio.receivers[0].chunks;
  const a=analysePhase(p,c);assert.equal(a.comparison.eligible,false);assert.ok(codes(a).includes('PRE_INTERVENTION_SOURCE_OR_DECODER_PROGRESS_UNPROVEN'));
});

test('an invalid later receiver trace cannot complete an otherwise eligible comparison', () => {
  const {p,c}=eligibleComparison();p.samples.at(-1).peers[0].peers.sub.rtp[0].timestamp=1;
  const a=analysePhase(p,c);assert.equal(a.comparison.eligible,true);assert.equal(a.comparison.status,'ELIGIBLE_FOR_COMPARISON');
  assert.equal(a.comparison.windowCompleted,false);assert.equal(a.comparison.causalEvidence,'NOT_ESTABLISHED');
});

test('malformed captured pre-intervention history cannot be skipped', () => {
  const {p,c}=eligibleComparison();c.historyBeforeTrigger.push({});const a=analysePhase(p,c);
  assert.equal(a.comparison.eligible,false);assert.ok(codes(a).includes('PRE_INTERVENTION_HISTORY_INVALID'));
});

test('a fresh frame seen only in an inverted parent bracket is not independent post-trigger proof', () => {
  const p=phase();injectFresh(p);p.samples=p.samples.slice(0,36);
  p.samples[35].before=structuredClone(p.samples[34].before);p.samples[35].completed=structuredClone(p.samples[34].completed);
  const a=analysePhase(p,context());assert.equal(a.media,'INCONCLUSIVE');assert.ok(codes(a).includes('SAMPLE_ORDER_OR_DUPLICATE_INVALID'));
});
