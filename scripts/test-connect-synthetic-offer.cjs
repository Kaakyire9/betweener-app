// Browser-only diagnostic. No provider credentials, requests, calls or hardware capture.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createSyntheticOffer, rollbackSyntheticOffer, answerSyntheticSubscriber } = require('./lib/connect-stream-sfu-session.cjs');
const answerLocally = async ({ sdp, track }) => {
  const receiver = window.auditPcs.receiver ??= new RTCPeerConnection();
  await receiver.setRemoteDescription({ type: 'offer', sdp });
  await receiver.setLocalDescription(await receiver.createAnswer());
  await Promise.race([new Promise((resolve) => { receiver.onicegatheringstatechange = () => { if (receiver.iceGatheringState === 'complete') resolve(); }; }), new Promise((resolve) => setTimeout(resolve, 1000))]);
  const publisher = window.auditPcs.publisher;
  await publisher.setRemoteDescription(receiver.localDescription);
  let result;
  for (let attempt = 0; attempt < 30; attempt++) {
    const kind = track === 'audio' ? 'audio' : 'video';
    const rows = [...(await publisher.getStats()).values()];
    const sent = rows.find((row) => row.type === 'outbound-rtp' && row.kind === kind);
    const received = [...(await receiver.getStats()).values()].find((row) => row.type === 'inbound-rtp' && row.kind === kind);
    result = { connected: publisher.connectionState === 'connected', bytesSent: sent?.bytesSent ?? 0, bytesReceived: received?.bytesReceived ?? 0 };
    if (result.connected && result.bytesSent > 0 && result.bytesReceived > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return result;
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.evaluate(() => { window.auditPcs = {}; });
    for (const [track, codecName, svc, rid] of [['video', 'vp9', true, 'q'], ['screenshare', 'vp8', false, 'f'], ['audio', 'opus', false, 'f']]) {
      const offer = await page.evaluate(createSyntheticOffer, { track, codecName, svc, rid, option: { bitrate: 600000 } });
      assert.ok(offer.sdp.includes(` ${codecName.toUpperCase()}/`) || offer.sdp.includes(` ${codecName}/`));
      assert.ok(offer.mid && offer.trackId);
      const stats = await page.evaluate(answerLocally, { sdp: offer.sdp, track });
      assert.ok(stats.connected && stats.bytesSent > 0 && stats.bytesReceived > 0);
      console.log(JSON.stringify({ scope: 'LOCAL_PEERS_ONLY_NOT_PROVIDER', track, codecName, localOffer: true, ...stats }));
      await page.evaluate(() => { Object.values(window.auditPaintTimers ?? {}).forEach(clearInterval); const pc = window.auditPcs.publisher; pc.getSenders().forEach((sender) => sender.track?.stop()); pc.close(); window.auditPcs.receiver.close(); window.auditPcs = {}; });
    }
    const video = await page.evaluate(createSyntheticOffer, { track: 'video', codecName: 'vp9', svc: true, rid: 'q' });
    assert.ok((await page.evaluate(answerLocally, { sdp: video.sdp, track: 'video' })).bytesReceived > 0);
    await page.evaluate(createSyntheticOffer, { track: 'screenshare', codecName: 'vp8', svc: false, rid: 'f' });
    // Local rejection control only: the receiver never accepts this synthetic screen track.
    await page.evaluate(rollbackSyntheticOffer, 'screenshare');
    const audio = await page.evaluate(createSyntheticOffer, { track: 'audio', codecName: 'opus', svc: false, rid: 'f' });
    const stats = await page.evaluate(answerLocally, { sdp: audio.sdp, track: 'audio' });
    assert.ok(stats.connected && stats.bytesSent > 0 && stats.bytesReceived > 0);
    const simultaneousKinds = await page.evaluate(async () => [...(await window.auditPcs.receiver.getStats()).values()]
      .filter((row) => row.type === 'inbound-rtp' && row.bytesReceived > 0).map((row) => row.kind).sort());
    assert.deepEqual(simultaneousKinds, ['audio', 'video']);
    console.log(JSON.stringify({ scope: 'LOCAL_PEERS_ONLY_NOT_PROVIDER', incrementalPublisher: true, rejectedOfferRolledBack: true, simultaneousKinds }));
    await page.evaluate(() => { Object.values(window.auditPaintTimers ?? {}).forEach(clearInterval); window.auditPcs.publisher.close(); window.auditPcs.receiver.close(); window.auditPcs = {}; });
    for (const [track, codecName, svc, rid] of [['video', 'vp9', true, 'q'], ['screenshare', 'vp8', false, 'f']]) {
      await page.evaluate(createSyntheticOffer, { track, codecName, svc, rid });
      await page.evaluate(rollbackSyntheticOffer, track);
    }
    const voice = await page.evaluate(createSyntheticOffer, { track: 'audio', codecName: 'opus', svc: false, rid: 'f' });
    assert.ok((await page.evaluate(answerLocally, { sdp: voice.sdp, track: 'audio' })).bytesReceived > 0);
    console.log(JSON.stringify({ scope: 'LOCAL_PEERS_ONLY_NOT_PROVIDER', rejectedVideoAndScreenThenAudio: true }));
    await page.evaluate(() => { window.auditPcs.publisher.close(); window.auditPcs.receiver.close(); window.auditPcs = {}; });
    const subscriberOffer = await page.evaluate(createSyntheticOffer, { track: 'audio', codecName: 'opus', svc: false, rid: 'f' });
    await page.evaluate(() => { window.auditPcs.sub = new RTCPeerConnection(); });
    const answer = await page.evaluate(answerSyntheticSubscriber, subscriberOffer);
    await page.evaluate(async (sdp) => window.auditPcs.publisher.setRemoteDescription({ type: 'answer', sdp }), answer);
    let inbound = 0;
    for (let n = 0; n < 30 && inbound === 0; n++) {
      inbound = await page.evaluate(async () => [...(await window.auditPcs.sub.getStats()).values()]
        .find((row) => row.type === 'inbound-rtp' && row.kind === 'audio')?.bytesReceived ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(inbound > 0, 'raw_subscriber_answer_must_receive_audio');
    console.log(JSON.stringify({ scope: 'LOCAL_PEERS_ONLY_NOT_PROVIDER', rawSubscriberReceivedAudio: inbound }));
    await page.evaluate(() => { window.auditPcs.publisher.close(); window.auditPcs.sub.close(); window.auditPcs = {}; });
    const first = await page.evaluate(createSyntheticOffer, { track: 'video', codecName: 'vp9', svc: true, rid: 'q' });
    await page.evaluate(answerLocally, { sdp: first.sdp, track: 'video' });
    await page.evaluate(() => { window.auditPcs.publisher.close(); delete window.auditPcs.publisher; });
    const replaced = await page.evaluate(createSyntheticOffer, { track: 'audio', codecName: 'opus', svc: false, rid: 'f' });
    await assert.rejects(page.evaluate(answerLocally, { sdp: replaced.sdp, track: 'audio' }), /m-line|media description/i);
    console.log(JSON.stringify({ scope: 'LOCAL_PEERS_ONLY_NOT_PROVIDER', formerPublisherReplacementFailureReproduced: true }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
