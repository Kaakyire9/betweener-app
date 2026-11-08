const test = require('node:test'); const assert = require('node:assert/strict');
const { experiment } = require('../scripts/lib/connect-media-truth/experiment.cjs');
const { readManifest } = require('../scripts/lib/connect-media-truth/approval.cjs');
const { jsonProcess } = require('../scripts/lib/connect-media-truth/process.cjs');
const { createCodec } = require('../scripts/lib/connect-media-truth/codec.cjs');
const { classifyPhase } = require('../scripts/lib/connect-media-truth/verdict.cjs');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { spawn } = require('node:child_process');
const pair = (target) => [0, 199680].map((startSample) => ({ ...target, confidence: 0.999, minimumSymbolConfidence: 0.999, crcValid: true, sampleRate: 48000, startSample, endSample: startSample + 192000 }));
function fakeRun(fault) {
  let mono = 0; const calls = []; const transmissions = []; const targets = []; const closed = [];
  const ledger = { users: ['fixture-a', 'fixture-b'] }; const { manifest } = readManifest();
  const clock = () => ({ mono: mono += 0.01, utc: new Date(1790000000000 + mono).toISOString() });
  const provider = { request: async (op) => {
    calls.push(op);
    if (fault === op) throw new Error('simulated_lost_ack');
    if (op === 'preflight') return { absent: true, baselineHash: 'fake-hash' };
    if (op === 'get') return { ended: true, callId: 'fixture-call', session: null };
    if (op === 'end') return { ack: true };
    return {};
  } };
  const openPeer = async (input) => {
    const sender = input.mediaTruth.sender;
    return { ready: Promise.resolve({ joinAcknowledged: true, sessionId: `session-${sender}`, results: [{ track: 'audio', status: 200, answerReceived: true }] }),
      request: async (op, args) => {
        if (fault === 'stats') throw new Error('simulated_child_exit');
        if (op === 'subscribe') return { status: 200, code: null };
        if (op === 'transmit') { targets[sender - 1] = { ...args.target, at: mono }; transmissions.push({ sender, mono }); return { transmission: { nonce: args.target.nonce, scheduledAudioSeconds: mono / 1000 } }; }
        const foreign = targets[2 - sender];
        const fresh = foreign && mono - foreign.at > 8200 ? pair(foreign) : [];
        const frames = [...pair({ nonce: createCodec().controlNonce, phase: 0, sender: 3 - sender }), ...fresh];
        const detail = { audio: { contextState: 'running', receivers: [{ trackId: `remote-${sender}`, chunks: mono, samples: mono * 48, frames }] }, peers: {
          sub: { connectionState: 'connected', rtp: [{ type: 'inbound-rtp', id: `in-${sender}`, ssrc: sender, timestamp: mono, bytesReceived: mono, packetsReceived: mono }] },
          publisher: { connectionState: 'connected', rtp: [{ type: 'outbound-rtp', id: `out-${sender}`, ssrc: sender + 10, timestamp: mono, bytesSent: mono, packetsSent: mono }] },
        } };
        return { detail, events: [], operations: [] };
      }, close: async () => { closed.push({ sender, mono }); } };
  };
  const run = experiment({ provider, openPeer, ledger, persist: () => {}, manifest, clock, sleep: async (ms) => { mono += ms; } });
  return { run, calls, ledger, closed, transmissions };
}
test('simulated same-call timer and backend phases retain peers until sampling ends', async () => {
  const fake = fakeRun(); const result = await fake.run;
  assert.equal(result.status, 'COMPLETE'); assert.equal(result.phases.length, 2);
  assert.deepEqual(result.phases.map((p) => p.verdict.verdict), ['FAIL', 'FAIL']);
  assert.equal(fake.calls.filter((c) => c === 'createCall').length, 1);
  assert.equal(fake.calls.filter((c) => c === 'createUsers').length, 1);
  assert.equal(fake.calls.filter((c) => c === 'end').length, 1);
  assert.equal(fake.closed.length, 2); assert.ok(fake.closed.every((c) => c.mono >= result.localCleanupStarted.mono));
  assert.ok(result.phases.every((p) => p.targets.every((t) => t.generated.mono >= p.trigger.completed.mono)));
  assert.equal(new Set(result.phases.flatMap((p) => p.targets.map((t) => t.nonce))).size, 4);
  assert.ok(result.completed.mono < 180000);
  assert.equal(JSON.stringify(result).includes('credentials'), false);
});
test('lost create acknowledgement preserves attempted ownership and never retries', async () => {
  const fake = fakeRun('createCall'); const result = await fake.run;
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(fake.ledger.callAttempted, true);
  assert.equal(fake.calls.filter((op) => op === 'createCall').length, 1); assert.equal(fake.closed.length, 0);
});
test('failed child stats leave partial evidence inconclusive and close both peers', async () => {
  const fake = fakeRun('stats'); const result = await fake.run;
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(fake.closed.length, 2);
  assert.ok(result.errors.length); assert.equal(fake.calls.filter((c) => c === 'createCall').length, 1);
});
test('malformed receipts never throw or become cutoff', () => {
  for (const receipt of [null, {}, { phase: 1, samples: [null] }, { samples: 'broken' }]) assert.equal(classifyPhase(receipt).verdict, 'INCONCLUSIVE');
});
test('failed startup cannot be reused as a live child', async () => {
  const port = jsonProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({failure:"simulated"})+"\\n")'], { timeoutMs: 1000 });
  try { await assert.rejects(port.ready, /startup_failed/); await assert.rejects(port.request('stats'), /startup_failed/); } finally { await port.close(); }
});
test('closed child permanently rejects subsequent requests', async () => {
  const port = jsonProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({ready:true})+"\\n");setTimeout(()=>process.exit(),50)'], { timeoutMs: 1000 });
  try { await port.ready; await new Promise((resolve) => setTimeout(resolve, 100)); await assert.rejects(port.request('stats'), /closed/); } finally { await port.close(); }
});
test('a silent child is bounded and retired on request timeout', async () => {
  const port = jsonProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({ready:true})+"\\n");process.stdin.resume()'], { timeoutMs: 150, startupTimeoutMs: 2000 });
  try { await port.ready; await assert.rejects(port.request('stats'), /timeout/); await assert.rejects(port.request('stats'), /closed/); } finally { await port.close(); }
});
test('typed nested provider denial survives the child bridge without raw error text', async () => {
  const code = 'console.log(JSON.stringify({ready:true}));process.stdin.on("data",b=>{const r=JSON.parse(b.toString());console.log(JSON.stringify({id:r.id,error:{status:403,code:17,reason:"fixture_scope_invalid"}}))})';
  const port = jsonProcess(process.execPath, ['-e', code], { timeoutMs: 1500 });
  try { await port.ready; await assert.rejects(port.request('stats'), (error) => error.safeError.code === 17 && error.safeError.status === 403 && error.safeError.reason === 'fixture_scope_invalid'); }
  finally { await port.close(); }
});
for (const reason of ['hard-deadline', 'parent-exit']) test(`independent watchdog records ${reason} and refuses unproved ownership`, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-truth-watchdog-'));
  const ledger = path.join(directory, 'unowned.json'); const approval = path.join(directory, 'no-approval.json');
  fs.writeFileSync(ledger, JSON.stringify({ hardDeadlineUtc: new Date(Date.now() + (reason === 'hard-deadline' ? 20 : 5000)).toISOString() }));
  const child = spawn(process.execPath, ['scripts/lib/connect-media-truth/watchdog.cjs', ledger, approval], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('watchdog_test_timeout')), 3000);
      child.on('message', (message) => {
        if (message.watchdogReady && reason === 'parent-exit') child.disconnect();
      });
      child.on('exit', () => { clearTimeout(timer); resolve(); }); child.on('error', reject);
    });
    const receipt = JSON.parse(fs.readFileSync(`${ledger}.cleanup.json`));
    assert.equal(receipt.reason, reason); assert.ok(receipt.errors.includes('watchdog_cleanup_failed'));
    assert.deepEqual(receipt.attempts, []); // No provider module/credential load for an unproved ledger.
  } finally {
    child.kill(); for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file)); fs.rmdirSync(directory);
  }
});
