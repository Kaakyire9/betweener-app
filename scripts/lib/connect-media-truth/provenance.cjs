const fs = require('node:fs'); const path = require('node:path'); const { createHash } = require('node:crypto');
const { sdkSources } = require('./sdk-contract.cjs');
const { LEGACY, B2, B3 } = require('./profiles.cjs');
function tree(directory, extensions) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? tree(file, extensions) : extensions.includes(path.extname(file)) ? [file.replaceAll('\\', '/')] : [];
  });
}
function sourceHashes() {
  const files = [...tree('scripts/lib/connect-media-truth', ['.cjs', '.mts', '.json']),
    ...fs.readdirSync('__tests__').filter((name) => /^connect-.*\.regression\.test\.(cjs|ts)$/.test(name)).map((name) => `__tests__/${name}`),
    ...tree('__tests__/fixtures', ['.mts', '.cjs', '.ts']).filter((file) => path.basename(file).startsWith('connect-')),
    '__tests__/relationship-commands.regression.test.ts',
    ...tree('node_modules/@stream-io/video-client/src/gen/video/sfu', ['.ts']),
    'scripts/test-connect-media-truth.cjs', 'scripts/test-connect-media-truth-b2.cjs', 'scripts/validate-connect-media-truth-b2.cjs',
    'scripts/test-connect-media-truth-b3.cjs', 'scripts/validate-connect-media-truth-b3.cjs', 'scripts/test-connect-media-truth-local.cjs',
    'scripts/lib/connect-stream-sfu-session.cjs', 'scripts/lib/connect-stream-sfu-probe.cjs', 'scripts/lib/connect-stream-sfu-protocol.cjs',
    'scripts/lib/connect-stream-audit.ts', 'scripts/lib/connect-stream-closure-worker.ts', 'supabase/functions/_shared/connect-stream-adapter.ts',
    'node_modules/playwright/package.json', 'node_modules/playwright-core/package.json',
    'node_modules/@stream-io/video-client/package.json', 'node_modules/typescript/package.json', 'package.json', 'package-lock.json',
    LEGACY.manifestPath, B2.manifestPath, B3.manifestPath, ...sdkSources()];
  return [...new Set(files)].sort().map((file) => ({ path: file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
}
module.exports = { sourceHashes };
