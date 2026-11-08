const { challenge, stamp, CLOCK_MODEL } = require('./evidence.cjs');
const { matches } = require('./evidence.cjs');
const { createCodec } = require('./codec.cjs');
const { classifyPhase } = require('./verdict.cjs');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Provider and peer ports are injected. Offline tests never load the real provider implementation.
async function experiment({ provider, openPeer, ledger, persist, manifest, clock = stamp, sleep = pause, publish = () => {}, isAborted = () => false }) {
  const evidence = { schemaVersion: 1, kind: 'MEDIA_TRUTH', clockModel: CLOCK_MODEL, operations: [], phases: [], errors: [], started: clock(), peers: [] };
  const sessions = []; const used = new Set(); let controls;
  const deadline = evidence.started.mono + manifest.windowsMs.totalBeforeCleanup;
  const checkTime = () => { if (isAborted()) throw new Error('experiment_aborted'); if (clock().mono >= deadline) throw new Error('experiment_deadline'); };
  const operation = async (op, args) => {
    checkTime(); const started = clock();
    try {
      const response = await provider.request(op, args);
      evidence.operations.push({ op, started, completed: clock(), success: true, providerTiming: response.diagnosticTiming ?? null });
      if (response.diagnosticTiming?.truncated) throw new Error('provider_telemetry_truncated');
      return response;
    }
    catch (error) { evidence.operations.push({ op, started, completed: clock(), success: false }); throw error; }
  };
  const sample = async () => {
    checkTime(); const before = clock(); const raw = await Promise.all(sessions.map((session) => session.request('stats'))); const completed = clock();
    if (raw.some((row) => row.telemetryTruncated || row.eventDecodeFailed || row.socketError || row.subscriberAnswerUnavailable)) throw new Error('peer_telemetry_failed');
    return { before, completed, peers: raw.map((r) => r.detail), signaling: raw.map((r) => ({ events: r.events, operations: r.operations, callEndedObserved: r.callEndedObserved, callEndedAt: r.callEndedAt })) };
  };
  const waitControls = async () => {
    const end = clock().mono + 18000;
    do {
      const s = await sample(); evidence.calibration = s;
      if (s.peers.every((peer, i) => peer.audio.contextState === 'running' && peer.audio.receivers.some((r) => !r.error
        && matches(r.frames, { nonce: createCodec().controlNonce, phase: 0, sender: 2 - i }, i + 1)))) return s.peers;
      await sleep(250);
    } while (clock().mono < end);
    throw new Error('positive_decoder_control_failed');
  };
  const phase = async (number, trigger) => {
    const phaseEvidence = { phase: number, trigger, controls, clockModel: CLOCK_MODEL, bindings: evidence.peers,
      targets: [], transmissions: [], samples: [], errors: [], windowComplete: false };
    evidence.phases.push(phaseEvidence);
    try {
      phaseEvidence.targets = [1, 2].map((sender) => challenge(trigger, number, sender, used, undefined, clock));
      phaseEvidence.transmissions = await Promise.all(sessions.map(async (session, i) => {
        const before = clock(); const response = await session.request('transmit', { target: phaseEvidence.targets[i] });
        return { before, completed: clock(), transmission: response.transmission };
      }));
      const windowMs = number === 1 ? manifest.windowsMs.timerAfterFirstEndedRead : manifest.windowsMs.backendAfterEndAcknowledgement;
      const end = trigger.completed.mono + windowMs;
      // Leave margin for a final IPC bracket. Never exceed the approved window intentionally.
      while (clock().mono < end - 500) {
        const s = await sample(); phaseEvidence.samples.push(s);
        if (s.completed.mono >= end - 1000) { phaseEvidence.windowComplete = true; break; }
        await sleep(250);
      }
    } catch (error) { phaseEvidence.errors.push({ reason: error.message === 'experiment_deadline' ? 'experiment_deadline' : 'phase_operation_failed', detail: error.safeError ?? null }); throw error; }
    finally { phaseEvidence.verdict = classifyPhase(phaseEvidence); publish(evidence); }
  };
  try {
    const preflight = await operation('preflight');
    if (preflight.absent !== true || !preflight.baselineHash) throw new Error('provider_preflight_failed');
    ledger.preflightAbsent = true; ledger.baselineHash = preflight.baselineHash; persist();
    ledger.usersAttempted = true; persist(); await operation('createUsers');
    ledger.callAttempted = true; persist(); await operation('createCall');
    const admissions = await Promise.all([1, 2].map((sender) => operation('join', { sender })));
    // Admission credentials are never added to the evidence object or ledger.
    const peers = await Promise.all(admissions.map((admission, i) => openPeer({ ...admission, audioOnly: true, mediaTruth: { sender: i + 1 } })));
    for (const peer of peers) sessions.push(peer);
    const ready = await Promise.all(sessions.map((session) => session.ready));
    if (ready.some((r) => r.failure || !r.joinAcknowledged || !r.sessionId || !r.results?.some((t) => t.track === 'audio' && t.status === 200 && t.answerReceived))) throw new Error('raw_peer_startup_failed');
    evidence.peers = ready.map((r, i) => ({ sender: i + 1, userId: ledger.users[i], rawSessionId: r.sessionId, runtime: r.runtime ?? null }));
    await Promise.all(sessions.map(async (session, i) => {
      const r = await session.request('subscribe', { peer: { userId: ledger.users[1 - i], sessionId: ready[1 - i].sessionId } });
      if (r.status !== 200 || r.code) throw new Error('subscription_failed');
    }));
    controls = await waitControls();
    let trigger;
    while (!trigger) {
      const before = clock(); const response = await operation('get'); const completed = clock();
      evidence.metadata ??= []; evidence.metadata.push({ before, completed, ...response });
      if (response.ended === true) trigger = { kind: 'timer-ended-get', ended: true, before, completed, provider: response };
      else await sleep(250);
    }
    await phase(1, trigger);
    const before = clock(); const response = await operation('end'); const completed = clock();
    if (response.ack !== true) throw new Error('backend_ack_missing');
    await phase(2, { kind: 'backend-end-ack', ack: true, before, completed });
    evidence.status = 'COMPLETE';
  } catch (error) {
    evidence.status = 'INCOMPLETE'; evidence.errors.push({ reason: /^[a-z][a-z0-9_]{0,80}$/.test(error.message) ? error.message : 'experiment_operation_failed', detail: error.safeError ?? null });
    const unfinished = evidence.phases.at(-1);
    if (unfinished && !unfinished.windowComplete) { unfinished.processFailure = true; unfinished.verdict = classifyPhase(unfinished); }
  } finally {
    evidence.localCleanupStarted = clock();
    // Closing happens only after measurement. It is resource hygiene, never cutoff evidence.
    await Promise.allSettled(sessions.map((session) => session.close()));
    evidence.completed = clock(); publish(evidence);
  }
  return evidence;
}
module.exports = { experiment };
