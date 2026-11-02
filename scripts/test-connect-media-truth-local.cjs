// Local WebRTC only: separate browser contexts, synthetic tracks, no provider/DB credentials.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { preparePage, collectStats } = require('./lib/connect-media-truth/browser.cjs');
const { challenge, matches, stamp, CLOCK_MODEL } = require('./lib/connect-media-truth/evidence.cjs');
const { createCodec } = require('./lib/connect-media-truth/codec.cjs');
const { sourceHashes } = require('./lib/connect-media-truth/provenance.cjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function localCandidates(description) {
  // Local test only: avoid dependence on Windows multicast DNS between pages.
  // These are this host's own interfaces; addresses are never written to evidence.
  const addresses = [...new Set(Object.values(require('node:os').networkInterfaces()).flat().filter((i) => i.family === 'IPv4').map((i) => i.address))];
  return { ...description, sdp: description.sdp.split('\r\n').flatMap((line) => {
    if (!line.startsWith('a=candidate:') || !/\S+\.local/.test(line)) return [line];
    return addresses.map((address) => line.replace(/\S+\.local/, address));
  }).join('\r\n') };
}
async function gathered(page) {
  return page.evaluate(async () => {
    const pc = window.auditPcs.publisher;
    await new Promise((resolve, reject) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
      const timer = setTimeout(() => { pc.removeEventListener('icegatheringstatechange', done); reject(new Error('local_ice_timeout')); }, 5000);
      pc.addEventListener('icegatheringstatechange', done);
    });
    return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
  });
}
async function localExperiment() {
  const started = stamp(); const result = { kind: 'LOCAL_ONLY_WEBRTC_OPUS', started, sources: sourceHashes(), clockModel: CLOCK_MODEL, checks: [], samples: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--mute-audio'], args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  result.runtime = { node: process.version, chrome: browser.version(), playwright: require('playwright/package.json').version };
  const watchdog = setTimeout(() => browser.close().catch(() => {}), 90000);
  let pages;
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['local-network-access']);
    pages = await Promise.all([1, 2].map(async (sender) => {
      const page = await context.newPage();
      // The only navigations are fulfilled locally by preparePage.
      await preparePage(page, sender);
      await page.evaluate(() => {
        const pc = new RTCPeerConnection({ iceServers: [] }); window.auditPcs = { publisher: pc, sub: pc };
        pc.ontrack = (event) => window.mediaTruth.attach(new MediaStream([event.track]));
        pc.addTrack(window.mediaTruth.track, new MediaStream([window.mediaTruth.track]));
        const tx = pc.getTransceivers()[0];
        tx.setCodecPreferences(RTCRtpSender.getCapabilities('audio').codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus'));
      }); return page;
    }));
    await pages[0].evaluate(async () => window.auditPcs.publisher.setLocalDescription(await window.auditPcs.publisher.createOffer()));
    const offer = await gathered(pages[0]);
    await pages[1].evaluate(async (value) => { const pc = window.auditPcs.publisher; await pc.setRemoteDescription(value); await pc.setLocalDescription(await pc.createAnswer()); }, localCandidates(offer));
    const answer = await gathered(pages[1]);
    result.signaling = [offer, answer].map((d) => ({ type: d.type, candidates: (d.sdp.match(/a=candidate:/g) ?? []).length, direction: d.sdp.match(/a=(sendrecv|recvonly|sendonly|inactive)/g) }));
    await pages[0].evaluate((value) => window.auditPcs.publisher.setRemoteDescription(value), localCandidates(answer));
    const sample = async () => {
      const before = stamp(); const peers = await Promise.all(pages.map((p) => p.evaluate(collectStats))); const completed = stamp();
      const row = { before, completed, peers }; result.samples.push(row); return peers;
    };
    const waitFor = async (predicate, timeout) => {
      const end = performance.now() + timeout;
      do { const values = await sample(); if (predicate(values)) return values; await sleep(250); } while (performance.now() < end);
      throw new Error('local_decode_timeout');
    };
    const frames = (peer) => peer.audio.receivers.flatMap((r) => r.frames);
    const calibration = [1, 2].map((sender) => ({ nonce: createCodec().controlNonce, phase: 0, sender }));
    await waitFor((peers) => peers.every((p, i) => matches(frames(p), calibration[1 - i], i + 1)), 18000);
    result.checks.push('bidirectional_blind_opus_calibration');
    const trigger = { kind: 'timer-ended-get', ended: true, completed: stamp(), localSimulation: true };
    const used = new Set(); const targets = [1, 2].map((sender) => challenge(trigger, 1, sender, used));
    result.trigger = trigger; result.targets = targets;
    result.transmissions = await Promise.all(pages.map(async (p, i) => {
      const before = stamp(); const transmission = await p.evaluate((value) => window.mediaTruth.transmit(value), targets[i]);
      return { before, completed: stamp(), transmission };
    }));
    const detected = await waitFor((peers) => peers.every((p, i) => matches(frames(p), targets[1 - i], i + 1)), 14000);
    result.checks.push('fresh_post_trigger_nonce_decoded_both_directions');
    if (detected.some((p, i) => matches(frames(p), { ...targets[1 - i], nonce: 'ffffffffffffffffffffffffffffffff' }, i + 1))) throw new Error('wrong_nonce_accepted');
    result.checks.push('wrong_nonce_rejected');
    // Fresh challenge 2 is deliberately held out of the audio for a measured delay.
    const delayedTrigger = { kind: 'backend-end-ack', ack: true, completed: stamp(), localSimulation: true };
    const delayed = [1, 2].map((sender) => challenge(delayedTrigger, 2, sender, used));
    const delayStart = stamp(); await sleep(1000); const stale = await sample();
    if (stale.some((p, i) => matches(frames(p), delayed[1 - i], i + 1))) throw new Error('previous_audio_accepted');
    result.delay = { before: delayStart, completed: stamp(), targets: delayed };
    result.checks.push('previous_audio_during_delivery_delay_rejected');
    result.delayedTransmissions = await Promise.all(pages.map((p, i) => p.evaluate((value) => window.mediaTruth.transmit(value), delayed[i])));
    await waitFor((peers) => peers.every((p, i) => matches(frames(p), delayed[1 - i], i + 1)), 9000);
    result.delayedDetection = { completed: stamp(), fromTriggerMs: stamp().mono - delayedTrigger.completed.mono };
    if (result.delayedDetection.fromTriggerMs > 10000) throw new Error('comparison_decode_window_exceeded');
    result.checks.push('delayed_fresh_nonce_decoded_both_directions');
    result.status = 'COMPLETE';
  } catch (error) {
    result.status = 'INCOMPLETE'; result.error = /^[a-z_]+$/.test(error.message) ? error.message : 'local_browser_failure';
  } finally {
    result.cleanupStarted = stamp(); clearTimeout(watchdog);
    if (pages) await Promise.allSettled(pages.map((p) => p.evaluate(async () => { window.auditPcs.publisher.close(); await window.mediaTruth.close(); })));
    await browser.close(); result.completed = stamp(); result.sourcesUnchanged = JSON.stringify(result.sources) === JSON.stringify(sourceHashes());
    if (!result.sourcesUnchanged) { result.status = 'INCOMPLETE'; result.error = 'harness_sources_changed_during_run'; }
  }
  return result;
}
async function runLocal(args = process.argv.slice(2)) {
  const index = args.indexOf('--output-dir');
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('local_output_directory_required');
  const directory = path.resolve(index >= 0 ? args[index + 1] : 'tmp/connect-media-truth-preparation');
  const relative = path.relative(path.resolve('tmp'), directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('local_output_directory_rejected');
  if (fs.existsSync(path.join(directory, 'local-browser-results.json'))) throw new Error('local_receipt_already_exists');
  fs.mkdirSync(directory, { recursive: true });
  const result = await localExperiment();
  fs.writeFileSync(`${directory}/local-browser-results.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
  fs.writeFileSync(`${directory}/local-browser-${result.started.utc.replace(/[:.]/g, '-')}.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, checks: result.checks, error: result.error, elapsedMs: result.completed.mono - result.started.mono }));
  if (result.status !== 'COMPLETE') process.exitCode = 1;
  return result;
}
if (require.main === module) runLocal().catch(() => { console.error('local_browser_runner_failed'); process.exitCode = 1; });
module.exports = { localExperiment, runLocal };
