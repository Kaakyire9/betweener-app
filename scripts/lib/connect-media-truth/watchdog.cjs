// Separate Node process: deadline/parent death does not depend on the experiment event loop.
const fs = require('node:fs'); const { execFile } = require('node:child_process');
const { readManifest, authorize } = require('./approval.cjs');
const { assertLedger } = require('./scope.cjs');
const { stamp } = require('./evidence.cjs');
const ownedChildren = new Set(); let cleaning = false;
const [ledgerFile, approvalFile, manifestFile] = process.argv.slice(2);
function persistCleanup(result) { fs.writeFileSync(`${ledgerFile}.cleanup.json`, JSON.stringify(result, null, 2)); }
function killOwned(pid) {
  return new Promise((resolve) => {
    if (!ownedChildren.has(pid)) return resolve();
    if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 3000 }, () => resolve());
    else { try { process.kill(pid, 'SIGKILL'); } catch {} resolve(); }
  });
}
async function cleanup(reason) {
  if (cleaning) return; cleaning = true; clearTimeout(timer);
  const receipt = { reason, started: stamp(), errors: [], attempts: [] };
  let port;
  let budgetExceeded = false;
  const budget = setTimeout(() => { budgetExceeded = true; port?.child.kill(); }, 55000);
  try {
    // Stop writers before cleanup. This includes only child PIDs explicitly registered by this experiment.
    await Promise.all([...ownedChildren].map(killOwned));
    const ledger = JSON.parse(fs.readFileSync(ledgerFile)); const { manifest, hash } = readManifest(manifestFile);
    assertLedger(ledger, manifest, hash);
    const approval = JSON.parse(fs.readFileSync(approvalFile));
    authorize({ execute: true, approval, manifest, hash, now: Date.parse(ledger.reservedAt) });
    if (ledger.usersAttempted || ledger.callAttempted) {
      port = require('./provider-process.cjs').providerProcess(ledgerFile, approvalFile, true, manifestFile); await port.ready;
      const limit = performance.now() + 55000;
      for (let attempt = 0; attempt <= manifest.cleanup.cleanupOnlyRetryMaximum && performance.now() < limit; attempt++) {
        const result = await port.request('cleanup'); receipt.attempts.push(result);
        if (!result.errors.length) break;
      }
      receipt.errors = receipt.attempts.at(-1)?.errors ?? ['cleanup_not_verified'];
    }
  } catch { receipt.errors.push('watchdog_cleanup_failed'); }
  finally {
    clearTimeout(budget); await port?.close();
    if (budgetExceeded) receipt.errors.push('cleanup_deadline_exceeded');
    receipt.completed = stamp(); persistCleanup(receipt);
    if (process.connected) process.send({ cleanup: receipt }, () => process.disconnect());
  }
}
const ledger = JSON.parse(fs.readFileSync(ledgerFile));
const timer = setTimeout(() => cleanup('hard-deadline'), Math.max(0, Date.parse(ledger.hardDeadlineUtc) - Date.now()));
process.on('disconnect', () => cleanup('parent-exit'));
process.on('message', (message) => {
  if (Number.isInteger(message.registerChild) && message.registerChild > 0) ownedChildren.add(message.registerChild);
  if (Number.isInteger(message.releaseChild)) ownedChildren.delete(message.releaseChild);
  if (message.cleanup) cleanup(message.reason ?? 'requested');
});
process.send({ watchdogReady: true });
