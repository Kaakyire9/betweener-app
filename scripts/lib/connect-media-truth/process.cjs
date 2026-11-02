const { spawn, execFile } = require('node:child_process');
const readline = require('node:readline');
const { projectDiagnostic, projectStage } = require('./provider-diagnostics.cjs');
// Bounded JSON RPC. Failed startup/exit permanently retires this instance.
function jsonProcess(command, args, { spawnProcess = spawn, timeoutMs = 15000, startupTimeoutMs = timeoutMs } = {}) {
  const child = spawnProcess(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stopped = false; let sequence = 0; let startup;
  const waiting = new Map(); let readyResolve; let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const fail = (reason) => {
    if (stopped) return; stopped = true; clearTimeout(startup);
    readyReject(new Error(reason));
    for (const entry of waiting.values()) { clearTimeout(entry.timer); entry.reject(new Error(reason)); }
    waiting.clear();
  };
  const safeDetails = (message) => ({
    status: Number.isInteger(message.error?.status) ? message.error.status : null,
    code: Number.isInteger(message.error?.code) ? message.error.code : Number.isInteger(message.joinErrorCode) ? message.joinErrorCode : null,
    reason: /^[a-z][a-z0-9_]{0,80}$/.test(message.failure ?? message.error?.reason ?? '') ? (message.failure ?? message.error.reason) : 'child_operation_failed',
    stage: projectStage(message.error?.stage) ?? (/^[a-z_]{1,50}$/.test(message.failedStage ?? '') ? message.failedStage : null),
    providerTiming: message.timing ?? null,
    ...(message.error?.diagnostic ? { diagnostic: projectDiagnostic(message.error.diagnostic) } : {}),
  });
  child.on('error', () => fail('child_process_error')); child.on('exit', () => fail('child_process_closed'));
  child.stdin.on('error', () => fail('child_stdin_closed'));
  child.stdout.on('error', () => fail('child_stdout_closed'));
  // Never forward raw stderr: SDK/browser errors can include credentials/URLs.
  child.stderr.resume();
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (line.length > 8388608) { fail('child_response_too_large'); child.kill(); return; }
    let message; try { message = JSON.parse(line); } catch { fail('child_invalid_json'); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) { fail('child_invalid_json'); return; }
    if (!message.id) {
      clearTimeout(startup);
      if (message.failure || message.error) {
        readyReject(Object.assign(new Error('child_startup_failed'), { safeError: safeDetails(message) })); fail('child_startup_failed');
      }
      else if (message.ready === true || message.kind === 'SFU_PUBLISH_BOUNDARY') readyResolve(message);
      else fail('child_invalid_startup');
      return;
    }
    const entry = waiting.get(message.id); if (!entry) { fail('child_unexpected_response'); return; }
    clearTimeout(entry.timer); waiting.delete(message.id);
    if (message.error || message.failure) entry.reject(Object.assign(new Error('child_operation_failed'), { safeError: safeDetails(message) }));
    else entry.resolve(message.data ? { ...message.data, diagnosticTiming: message.timing ?? null } : message);
  });
  startup = setTimeout(() => { fail('child_startup_timeout'); child.kill(); }, startupTimeoutMs);
  const send = (message) => {
    if (stopped || !child.stdin.writable) throw new Error('child_process_closed');
    child.stdin.write(JSON.stringify(message) + '\n');
  };
  return {
    child, ready,
    initial: send,
    async request(op, args = {}) {
      await ready; if (stopped) throw new Error('child_process_closed');
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('child_request_timeout')); fail('child_request_timeout'); child.kill(); }, timeoutMs);
        waiting.set(id, { resolve, reject, timer });
        try { send({ id, op, ...args }); } catch { clearTimeout(timer); waiting.delete(id); reject(new Error('child_process_closed')); }
      });
    },
    async close() {
      if (!stopped) { child.stdin.end(); await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]); }
      if (!stopped && process.platform === 'win32' && child.pid) await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 3000 }, () => resolve()));
      child.kill(); lines.close(); fail('child_process_closed');
    },
  };
}
module.exports = { jsonProcess };
