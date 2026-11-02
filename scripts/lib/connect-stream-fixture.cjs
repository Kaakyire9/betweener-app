// Test-only JSON control bridge. Provider credentials stay in the pinned Deno process.
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const { readdirSync, existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const cachedDeno = () => {
  const cache = path.resolve('.npm-cache/_npx');
  if (!existsSync(cache)) return null;
  for (const directory of readdirSync(cache)) {
    const packagePath = path.join(cache, directory, 'node_modules/deno');
    const executable = path.join(packagePath, 'deno.exe');
    if (!existsSync(executable)) continue;
    try { if (JSON.parse(readFileSync(path.join(packagePath, 'package.json'), 'utf8')).version === '2.5.4') return executable; }
    catch { /* Ignore incomplete package installations. */ }
  }
  return null;
};

function openStreamFixture(handleRpc) {
  const command = 'npm.cmd exec --yes --package=deno@2.5.4 -- deno run --no-config --no-lock --node-modules-dir=none --allow-read=.env.stream-audit.local --allow-write=tmp/connect-m2a,tmp/connect-boundary --allow-net=chat.stream-io-api.com,video.stream-io-api.com --allow-env --allow-run=node scripts/lib/connect-stream-closure-worker.ts';
  const deno = cachedDeno();
  const args = ['run', '--no-config', '--no-lock', '--node-modules-dir=none', '--allow-read=.env.stream-audit.local',
    '--allow-write=tmp/connect-m2a,tmp/connect-boundary', '--allow-net=chat.stream-io-api.com,video.stream-io-api.com',
    '--allow-env', '--allow-run=node', 'scripts/lib/connect-stream-closure-worker.ts'];
  const child = spawn(deno ?? 'cmd.exe', deno ? args : ['/d', '/c', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let sequence = 0; let resolveReady; let rejectReady;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const startup = setTimeout(() => rejectReady(new Error('provider_fixture_start_timeout')), 30000);
  child.stderr.resume();
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const fail = () => {
    clearTimeout(startup); rejectReady(new Error('provider_fixture_closed'));
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('provider_fixture_closed')); }
    pending.clear();
  };
  child.on('error', fail); child.on('exit', fail);
  readline.createInterface({ input: child.stdout }).on('line', async (line) => {
    if (!line.startsWith('{')) return;
    const item = JSON.parse(line);
    if (item.event === 'ready') { clearTimeout(startup); resolveReady(); }
    else if (item.rpc) {
      try { send({ rpcResult: item.rpc, data: await handleRpc(item.name, item.args) }); }
      catch { send({ rpcResult: item.rpc, error: true }); }
    } else if (item.id) {
      const entry = pending.get(item.id); if (!entry) return;
      pending.delete(item.id); clearTimeout(entry.timer);
      if (item.error) entry.reject(new Error(JSON.stringify(item.error))); else entry.resolve(item.data);
    }
  });
  return { ready, request: (op, args = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`provider_fixture_timeout_${op}`)); }, 60000);
    pending.set(id, { resolve, reject, timer }); send({ id, op, args });
  }), close: async () => { child.stdin.end(); await exited; } };
}
module.exports = { openStreamFixture };
