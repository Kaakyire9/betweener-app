const fs = require('node:fs'); const path = require('node:path'); const { spawn } = require('node:child_process');
const { readManifest, authorize, reserve } = require('./lib/connect-media-truth/approval.cjs');
const { jsonProcess } = require('./lib/connect-media-truth/process.cjs');
const { classifyPhase } = require('./lib/connect-media-truth/verdict.cjs');
const { experiment } = require('./lib/connect-media-truth/experiment.cjs');
const { sourceHashes } = require('./lib/connect-media-truth/provenance.cjs');
const { LEGACY, B2, B3, isVersionedProfile, profileForManifest } = require('./lib/connect-media-truth/profiles.cjs');
function assertReadiness(readiness, manifest, hash, profile, contract) {
  if (readiness.providerTestPrepared !== 'PASS' || readiness.manifestSha256 !== hash) throw new Error('offline_preparation_blocked');
  if (isVersionedProfile(profile) && (readiness.experimentId !== manifest.experimentId || readiness.stage !== (profile === B2 ? 'B2_OFFLINE_ONLY' : 'B3_OFFLINE_ONLY') || readiness.providerTestExecuted !== false
    || readiness.requestContract?.passed !== true || readiness.requestContract.requestSha256 !== contract.requestSha256
    || JSON.stringify(readiness.sources) !== JSON.stringify(sourceHashes()))) throw new Error(`${profile === B2 ? 'b2' : 'b3'}_preparation_sources_or_contract_changed`);
  if (profile === B3 && (readiness.localOpusControls?.status !== 'PASS' || readiness.offlineValidation?.status !== 'PASS'
    || readiness.safetyGuards?.status !== 'PASS')) throw new Error('b3_offline_controls_incomplete');
  if (profile === B3) {
    if (!Array.isArray(readiness.artifacts) || !readiness.artifacts.length
      || !readiness.artifacts.some((entry) => entry.path === readiness.localOpusControls.path)) throw new Error('b3_validation_artifacts_missing');
    for (const entry of readiness.artifacts) {
      if (require('node:crypto').createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex') !== entry.sha256) throw new Error('b3_validation_artifact_changed');
    }
    const opus = JSON.parse(fs.readFileSync(readiness.localOpusControls.path));
    const checks = ['bidirectional_blind_opus_calibration', 'fresh_post_trigger_nonce_decoded_both_directions',
      'wrong_nonce_rejected', 'previous_audio_during_delivery_delay_rejected', 'delayed_fresh_nonce_decoded_both_directions'];
    if (opus.status !== 'COMPLETE' || opus.sourcesUnchanged !== true || !checks.every((check) => opus.checks?.includes(check))
      || JSON.stringify(opus.sources) !== JSON.stringify(readiness.sources)) throw new Error('b3_opus_controls_stale_or_incomplete');
  }
  for (const entry of readiness.sources) {
    const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex');
    if (actual !== entry.sha256) throw new Error('preparation_sources_changed');
  }
}

async function main(args = process.argv.slice(2), selectedProfile = LEGACY) {
  const profile = profileForManifest(selectedProfile.manifestPath);
  const { manifest, hash } = readManifest(profile.manifestPath);
  const contracts = require('./lib/connect-media-truth/sdk-contract.cjs');
  const contract = profile === B3 ? contracts.validateB3Contract(manifest) : profile === B2 ? contracts.validateB2Contract(manifest) : null;
  if (!args.includes('--execute')) { console.log(JSON.stringify({ mode: 'PROPOSAL_ONLY_NO_PROVIDER_ACCESS', manifestSha256: hash, requestContract: contract, manifest }, null, 2)); return; }
  const approvalIndex = args.indexOf('--approval');
  if (approvalIndex < 0 || !args[approvalIndex + 1] || args[approvalIndex + 1].startsWith('--')) throw new Error('separate_execution_approval_required');
  const approvalFile = path.resolve(args[approvalIndex + 1]);
  const approval = JSON.parse(fs.readFileSync(approvalFile)); authorize({ execute: true, manifest, hash, approval });
  // Approval never overrides failed local calibration. This must be refreshed against current sources.
  const readiness = JSON.parse(fs.readFileSync(profile.readinessPath));
  assertReadiness(readiness, manifest, hash, profile, contract);
  const reserved = reserve(profile.executionDirectory, approval, manifest, hash);
  const watchdog = spawn(process.execPath, ['scripts/lib/connect-media-truth/watchdog.cjs', reserved.file, approvalFile, profile.manifestPath], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let provider; let providerRuntime; let evidence; let aborted = false; const children = new Set();
  const cleanup = new Promise((resolve, reject) => {
    watchdog.on('message', (message) => { if (message.cleanup) resolve(message.cleanup); });
    watchdog.once('error', () => reject(new Error('watchdog_error')));
    watchdog.once('exit', (code) => { if (code) reject(new Error('watchdog_exit')); });
  });
  // Attach a rejection handler immediately, including during startup.
  cleanup.catch(() => { aborted = true; for (const port of children) void port.close(); });
  const register = (port) => {
    children.add(port);
    if (!watchdog.connected) throw new Error('watchdog_disconnected');
    watchdog.send({ registerChild: port.child.pid });
    port.child.once('exit', () => { children.delete(port); if (watchdog.connected) watchdog.send({ releaseChild: port.child.pid }); });
    return port;
  };
  const publish = (value) => fs.writeFileSync(`${reserved.file}.evidence.json`, JSON.stringify(value, null, 2));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('watchdog_start_timeout')), 5000);
      watchdog.on('message', (message) => { if (message.watchdogReady) { clearTimeout(timer); resolve(); } });
    });
    provider = register(require('./lib/connect-media-truth/provider-process.cjs').providerProcess(reserved.file, approvalFile, false, profile.manifestPath));
    const ready = await provider.ready; providerRuntime = { ...ready.runtime, startupRequests: ready.startupRequests };
    evidence = await experiment({ provider, ledger: reserved.ledger, persist: reserved.persist, manifest, publish, isAborted: () => aborted,
      openPeer: async (input) => {
        const port = register(jsonProcess(process.execPath, ['scripts/lib/connect-stream-sfu-probe.cjs', '--hold'], { timeoutMs: 20000 }));
        port.initial(input); return port;
      } });
  } finally {
    await Promise.allSettled([...children].map((port) => port.close()));
    if (watchdog.connected) watchdog.send({ cleanup: true, reason: 'experiment-finally' });
    let timer;
    let receipt;
    try { receipt = await Promise.race([cleanup, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cleanup_watchdog_timeout')), 65000); })]); }
    catch {
      // Emergency cleanup never recreates a fixture. A dead watchdog remains a visible run failure.
      let fallback;
      try {
        fallback = require('./lib/connect-media-truth/provider-process.cjs').providerProcess(reserved.file, approvalFile, true, profile.manifestPath);
        await fallback.ready; receipt = await fallback.request('cleanup'); receipt.errors.push('watchdog_failed_parent_cleanup_used');
      } catch { receipt = { errors: ['watchdog_failed_parent_cleanup_failed'], ledger: reserved.file }; }
      finally { await fallback?.close(); }
      fs.writeFileSync(`${reserved.file}.emergency-cleanup.json`, JSON.stringify(receipt, null, 2));
    }
    finally { clearTimeout(timer); }
    if (evidence) {
      evidence.provenance = { sources: readiness.sources, sourcesUnchanged: JSON.stringify(readiness.sources) === JSON.stringify(sourceHashes()),
        manifestSha256: hash, node: process.version, localValidationRuntime: readiness.runtime, providerRuntime };
      if (!evidence.provenance.sourcesUnchanged) { evidence.status = 'INCOMPLETE'; for (const phase of evidence.phases) phase.processFailure = true; }
      evidence.cleanup = receipt;
      for (const phase of evidence.phases) { phase.cleanup = receipt; phase.verdict = classifyPhase(phase); }
      publish(evidence);
    }
    console.log(JSON.stringify({ result: evidence?.status ?? 'INCOMPLETE', cleanupErrors: receipt.errors,
      phases: evidence?.phases.map((phase) => phase.verdict), evidence: `${reserved.file}.evidence.json`, M2A: 'BLOCKED', M2B: 'BLOCKED' }));
    if (receipt.errors.length || evidence?.status !== 'COMPLETE') process.exitCode = 1;
  }
}
if (require.main === module) main().catch((error) => { console.error(/^[a-z_]+$/.test(error.message) ? error.message : 'media_truth_runner_failed'); process.exitCode = 1; });
module.exports = { main, assertReadiness };
