'use strict';
const fs = require('node:fs');
const { contextForReceipt } = require('./receipts.ts');
const rawPath = 'tmp/connect-media-truth-b3-execution/approval-media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c.json.evidence.json';
const bytes = fs.readFileSync(rawPath); const raw = JSON.parse(bytes);
const phase = (i = 0) => structuredClone(raw.phases[i]);
const context = (i = 0) => structuredClone(contextForReceipt(raw, i, { authenticatedSessionPath: true, nonCooperativeHarness: true }));
function injectFresh(p, { at = 35, receiver = 1 } = {}) {
  const sample = p.samples[at]; const rx = sample.peers[receiver].audio.receivers[0];
  const control = p.controls[receiver].audio.receivers[0].frames[0]; const target = p.targets[1 - receiver];
  const frame = { ...control, nonce: target.nonce, sender: target.sender, phase: p.phase,
    startSample: rx.samples - 192000, endSample: rx.samples,
    observed: { ...rx.lastChunk }, audioWorkletFrame: Math.floor(rx.lastChunk.audioSeconds * control.sampleRate) - 128 };
  for (const later of p.samples.slice(at)) later.peers[receiver].audio.receivers[0].frames.push(structuredClone(frame));
  return frame;
}
function healthy(sample) {
  const s = structuredClone(sample);
  for (const p of s.peers) for (const k of ['sub', 'publisher']) {
    p.peers[k].connectionState = 'connected'; p.peers[k].iceConnectionState = 'connected';
    for (const t of p.peers[k].transports) { t.dtlsState = 'connected'; t.iceState = 'connected'; }
  }
  return s;
}
function eligibleComparison() {
  const p = phase(1); const c = context(1);
  const prior = healthy(c.priorSample); const previous = healthy(c.priorPreviousSample);
  for (const [n,s] of [previous,prior].entries()) {
    for(let i=0;i<2;i++) {
      const rx=s.peers[i].peers.sub.rtp[0];const post=p.samples[0].peers[i].peers.sub.rtp[0];
      rx.bytesReceived=post.bytesReceived-(2-n)*50;rx.packetsReceived=post.packetsReceived-(2-n);
      rx.lastPacketReceivedTimestamp=rx.timestamp-5;
      s.signaling[i].events=s.signaling[i].events.filter(e=>!['callEnded','websocket-close'].includes(e.type));
      s.signaling[i].callEndedObserved=false;
    }
  }
  const ackUtc=Date.parse(p.trigger.completed.utc);
  for(const sample of p.samples)for(const signal of sample.signaling)for(const e of signal.events) {
    if(!['callEnded','websocket-close'].includes(e.type))continue;
    const newUtc=ackUtc+(e.type==='callEnded'?20:100);const delta=newUtc-Date.parse(e.at.utc);
    e.at={mono:e.at.mono+delta,utc:new Date(newUtc).toISOString()};
  }
  c.priorSample=prior;c.priorPreviousSample=previous;c.baseline=prior;c.historyBeforeTrigger=[previous,prior];
  return {p,c};
}
module.exports = { bytes, raw, phase, context, injectFresh, healthy, eligibleComparison };
