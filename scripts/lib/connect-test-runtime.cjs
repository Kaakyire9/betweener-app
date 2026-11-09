// Local test tooling only. Never returns Docker command arguments or credentials in errors.
const { execFileSync, spawn } = require('node:child_process');

const CONTROL_TIMEOUT_MS = 30_000;
const SQL_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

function commandError(error, args, stderr = '') {
  const timedOut = error.code === 'ETIMEDOUT';
  const code = timedOut ? 'LOCAL_DOCKER_TIMEOUT' : 'LOCAL_DOCKER_FAILED';
  let detail = args.includes('psql') ? String(stderr).slice(0, 8192) : '';
  for (const arg of args) {
    if (/^(PGPASSWORD|PGRST_DB_URI|PGRST_JWT_SECRET)=/.test(arg)) {
      detail = detail.replaceAll(arg.slice(arg.indexOf('=') + 1), '[redacted]');
    }
  }
  detail = detail.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted database URI]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]');
  const safe = new Error(`${code}${detail ? `: ${detail}` : ''}`);
  safe.code = code;
  if (detail) safe.stderr = detail;
  return safe;
}

function createDockerRunner({ execSync = execFileSync, spawnProcess = spawn } = {}) {
  const sync = (args, options = {}) => {
    try {
      return execSync('docker', args, {
        encoding: 'utf8', windowsHide: true, maxBuffer: MAX_OUTPUT_BYTES,
        stdio: ['pipe', 'pipe', 'pipe'], ...options,
        timeout: options.timeout ?? CONTROL_TIMEOUT_MS, killSignal: 'SIGKILL',
      });
    } catch (error) {
      throw commandError(error, args, error.stderr);
    }
  };
  const concurrent = (args, input, timeout = SQL_TIMEOUT_MS) => new Promise((resolve, reject) => {
    let child; let timer; let settled = false; let output = ''; let stderr = ''; let bytes = 0;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try { child?.kill('SIGKILL'); } catch { /* Already exited or unavailable. */ }
        reject(commandError(error, args, stderr));
      } else resolve(output);
    };
    try {
      child = spawnProcess('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      timer = setTimeout(() => finish({ code: 'ETIMEDOUT' }), timeout);
      const append = (chunk, isError) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT_BYTES) return finish({ code: 'MAX_OUTPUT' });
        if (isError) stderr += chunk; else output += chunk;
      };
      child.stdout.on('data', chunk => append(chunk, false));
      child.stderr.on('data', chunk => append(chunk, true));
      child.on('error', finish);
      child.on('close', code => finish(code === 0 ? null : { code: 'EXIT_FAILURE' }));
      child.stdin.on('error', finish);
      child.stdin.end(input);
    } catch (error) { finish(error); }
  });
  return { sync, concurrent };
}

// A failure removing the REST container must not prevent database cleanup.
function cleanupResources(actions) {
  const removed = {}; const errors = [];
  for (const [name, action] of actions) {
    try { action(); removed[name] = true; }
    catch (error) { removed[name] = false; errors.push(error); }
  }
  return { removed, errors };
}

module.exports = { createDockerRunner, cleanupResources, SQL_TIMEOUT_MS };
