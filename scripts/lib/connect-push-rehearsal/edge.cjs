/* global __dirname */
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const http = require('node:http');
const { createHmac, randomBytes } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { root, dir, sha, json, saveJson } = require('./prepare.cjs');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true });
const key = 'offline-only-signing-material-48-at-least-43-characters';
const jwt = secret => {
  const prefix = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ role: 'service_role', exp: Math.floor(Date.now()/1000)+1800 })).toString('base64url');
  return prefix + '.' + createHmac('sha256', secret).update(prefix).digest('base64url');
};
async function gateway() {
  const owned = `betweener-connect-security-rest-${process.pid}`;
  const c = JSON.parse(docker(['inspect', owned]))[0];
  if (c.Name !== '/' + owned) throw Error('unowned_rest');
  const port = c.NetworkSettings.Ports['3000/tcp'][0].HostPort;
  const secret = c.Config.Env.find(s=>s.startsWith('PGRST_JWT_SECRET=')).slice('PGRST_JWT_SECRET='.length);
  const bearer = jwt(secret);
  // Only our ephemeral PostgREST is reachable through this local gateway. Never reads .env.
  const server = http.createServer(async (request, response) => {
    try {
      if (!request.url.startsWith('/rest/v1/')) { response.writeHead(404).end(); return; }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const result = await fetch(`http://127.0.0.1:${port}/${request.url.slice('/rest/v1/'.length)}`, {
        signal: AbortSignal.timeout(10000),
        method: request.method, headers: { ...request.headers, host: `127.0.0.1:${port}`, authorization: `Bearer ${bearer}` },
        ...(['GET','HEAD'].includes(request.method) ? {} : { body: Buffer.concat(chunks) }),
      });
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(502).end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve=>server.close(resolve)) };
}
async function launch(variant, origin) {
  if (!['forward','v26'].includes(variant)) throw Error('unreviewed_function_version');
  const expected = variant === 'v26'
    ? json('tmp/connect-deployment-final-gate-47/push-v26-source-recovery.json').members
    : json('docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json').edge.find(e=>e.name==='push-notifications').localSources;
  for(const entry of expected) if(sha(fs.readFileSync(path.join(dir,variant,entry.path)))!==entry.sha256) throw Error('function_source_drift');
  const cache = path.join(root, '.npm-cache/_npx/2cf4608ff26a9317/node_modules/deno/deno.exe');
  const socket = http.createServer(); await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port = socket.address().port; await new Promise(resolve=>socket.close(resolve));
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'import_map.json')));
  // Only the server binding and mocked delivery seam differ; the upstream std module is still used.
  map.imports['https://deno.land/std@0.168.0/http/server.ts'] = pathToFileURL(path.join(__dirname, 'runtime.mts')).href;
  const mapFile = path.join(dir, 'runtime_import_map.json'); saveJson(mapFile, map);
  const env = { SYSTEMROOT: process.env.SYSTEMROOT, PATH: process.env.PATH, TEMP: process.env.TEMP, LOCALAPPDATA: process.env.LOCALAPPDATA,
    PUSH_DELIVERY_MODE: 'enabled', PUSH_APP_ENVIRONMENT: 'staging', PUSH_APPLICATION_ID: 'com.aduboffour.betweener.staging',
    PUSH_EXPO_PROJECT_ID: '7f38a835-2da7-419b-a20b-e1a12e021547', PUSH_HMAC_CURRENT_KEY_ID: 'offline-48', PUSH_HMAC_CURRENT_SECRET: key,
    BETWEENER_SUPABASE_SECRET_KEY: 'sb_secret_' + randomBytes(24).toString('hex'), SUPABASE_URL: origin,
    REHEARSAL_PORT: String(port), CONNECT_NOTIFICATIONS_ENABLED: 'false' };
  const names = ['PUSH_DELIVERY_MODE','PUSH_APP_ENVIRONMENT','PUSH_APPLICATION_ID','PUSH_EXPO_PROJECT_ID','PUSH_HMAC_CURRENT_KEY_ID','PUSH_HMAC_CURRENT_SECRET',
    'PUSH_HMAC_PREVIOUS_KEY_ID','PUSH_HMAC_PREVIOUS_SECRET','PUSH_HMAC_PREVIOUS_VALID_UNTIL','LIVE_NOTIFICATIONS_MIN_APP_VERSION',
    'BETWEENER_SUPABASE_SECRET_KEY','BETWEENER_SUPABASE_SECRET_KEY_NAME','SUPABASE_SECRET_KEYS','SUPABASE_URL','REHEARSAL_PORT','CONNECT_NOTIFICATIONS_ENABLED'];
  const args = ['run','--no-remote','--deny-import','--no-npm','--no-lock','--no-config','--no-prompt', '--import-map',mapFile,
    `--allow-read=${dir},${path.join(root,'scripts/lib/connect-push-rehearsal')}`,`--allow-env=${names.join(',')}`,
    '--deny-net=exp.host:443',`--allow-net=127.0.0.1:${port},${new URL(origin).host}`,path.join(dir,variant,'supabase/functions/push-notifications/index.ts')];
  const child = spawn(cache, args, { cwd: root, windowsHide: true, env, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', b=>output+=b); child.stderr.on('data', b=>output+=b);
  const closed = new Promise(resolve=>child.once('exit', code=>resolve(code)));
  const address = `http://127.0.0.1:${port}`;
  const control = async data => (await fetch(address+'/__rehearsal', { signal:AbortSignal.timeout(10000), ...(data ? { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data) } : {}) })).json();
  for(let i=0; ;i++) {
    try { await control(); break; } catch { /* startup */ }
    if (child.exitCode !== null || i>=60) { child.kill();throw Error(`edge_start_failed:${output.slice(-2400)}`); }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return { variant, control, closed, address, args,
    request: async (id, options={}) => {
      const body = options.body ?? JSON.stringify({ event_id:id });
      const time = String(options.time ?? Math.floor(Date.now()/1000));
      return fetch(address, { signal:AbortSignal.timeout(15000),method:options.method??'POST', headers:{'Content-Type':'application/json','x-betweener-key-id':options.keyId??'offline-48',
        'x-betweener-timestamp':time,'x-betweener-signature':options.signature??createHmac('sha256',key).update(time+'.'+body).digest('hex')},
        ...(options.method==='GET'?{}:{body}) });
    },
    stop: async () => { if(child.exitCode===null) child.kill(); await closed; fs.appendFileSync(path.join(dir, `${variant}-runtime.log`), output); },
  };
}
module.exports = { gateway, launch };
