const fs = require('node:fs'); const path = require('node:path');
const { jsonProcess } = require('./process.cjs');
const { LEGACY, profileForManifest } = require('./profiles.cjs');
function cachedDeno() {
  const cache = path.resolve('.npm-cache/_npx');
  for (const name of fs.readdirSync(cache)) {
    const directory = path.join(cache, name, 'node_modules/deno'); const binary = path.join(directory, 'deno.exe');
    if (fs.existsSync(binary) && JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version === '2.5.4') return binary;
  }
  throw new Error('pinned_cached_deno_missing');
}
function providerProcess(ledgerFile, approvalFile, cleanupOnly = false, manifestFile = LEGACY.manifestPath) {
  const profile = profileForManifest(manifestFile);
  return jsonProcess(cachedDeno(), ['run', '--no-remote', '--no-lock', '--config', 'scripts/lib/connect-media-truth/deno.json',
    '--allow-read', `--allow-write=${path.dirname(path.resolve(ledgerFile))}`, '--allow-env', '--allow-net=video.stream-io-api.com,chat.stream-io-api.com',
    'scripts/lib/connect-media-truth/provider.mts', '--ledger', ledgerFile, '--approval', approvalFile, '--manifest', profile.manifestPath, ...(cleanupOnly ? ['--cleanup-only'] : [])],
  { timeoutMs: cleanupOnly ? 65000 : 15000 });
}
module.exports = { cachedDeno, providerProcess };
