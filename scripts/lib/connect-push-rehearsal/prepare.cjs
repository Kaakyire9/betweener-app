/* global __dirname */
// Local rehearsal artifacts only. Does not load project credentials or deploy.
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { historicalWebhookSource } = require('./historical-source.cjs');
const root = path.resolve(__dirname, '../../..');
const dir = path.join(root, 'tmp/connect-push-rollback-48');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(path.join(root, p));
const json = p => JSON.parse(read(p));
const save = (p, value) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); };
const saveJson = (p, value) => save(p, JSON.stringify(value, null, 2) + '\n');
function verifyArtifact(manifest, target) {
  if (!['forward','v26'].includes(manifest.variant)) throw Error('unreviewed_function_version');
  const base=path.resolve(target)+path.sep;
  for(const f of manifest.files) {
    const absolute=path.resolve(target,f.path);
    if(!absolute.startsWith(base))throw Error('artifact_path_escape');
    if(sha(fs.readFileSync(absolute))!==f.sha256)throw Error(`artifact_hash_drift:${f.path}`);
  }
  if(manifest.verifyJwt!==false||manifest.originalHostedBundleReproduction!==false)throw Error('artifact_configuration_drift');
}
function verifyFrozen({ historicalReplay = false } = {}) {
  const p = json('docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json');
  const r = json('tmp/connect-staging-preparation-46/final-verification.json');
  const rows = [...p.migrations, ...p.edge.flatMap(e => e.localSources), p.configuration, p.rehearsal, ...r.sourceFreeze]
    .map(x => {
      const current = sha(read(x.path));
      const evidencePath = current !== x.sha256 && historicalReplay
        ? historicalWebhookSource(x.path, x.sha256, current) : x.path;
      return { path: x.path, expected: x.sha256, actual: sha(read(evidencePath)), evidencePath, current };
    });
  if (rows.length !== 66 || rows.some(x => x.actual !== x.expected)) throw Error('frozen_package_drift');
  const recovery = json('tmp/connect-deployment-final-gate-47/push-v26-source-recovery.json');
  if (sha(read(recovery.archive)) !== recovery.archiveSha256) throw Error('recovery_archive_drift');
  const originals = recovery.members.map(m => {
    const bytes = execFileSync('git', ['show', `${recovery.gitCommit}:${m.path}`], { cwd: root, maxBuffer: 1024 * 1024 });
    if (sha(bytes) !== m.sha256) throw Error('v26_source_drift');
    return { ...m, bytes };
  });
  for (const variant of ['forward', 'v26']) {
    const entries = variant === 'v26' ? originals : p.edge.find(e => e.name === 'push-notifications').localSources.map(m => ({ ...m, bytes: read(m.path) }));
    for (const m of entries) {
      const destination=path.join(dir,variant,m.path);
      if(fs.existsSync(destination)&&sha(fs.readFileSync(destination))!==m.sha256)throw Error('recovery_source_drift');
      if(!fs.existsSync(destination))save(destination,m.bytes);
    }
  }
  saveJson(path.join(dir, historicalReplay ? 'historical-replay-verification.json' : 'frozen-verification.json'), { comparisons: rows.length, distinct: new Set(rows.map(x => x.path)).size,
    rows, v26: originals.map(({ bytes, ...m }) => ({ ...m, actual: sha(bytes) })) });
  return p;
}
// Exact public std version; no Supabase/Stream project endpoint is contacted.
async function resolveStd() {
  const imports = {}, records = [], seen = new Set();
  async function visit(url) {
    if (seen.has(url)) return;
    seen.add(url);
    if (!url.startsWith('https://deno.land/std@0.168.0/')) throw Error('unexpected_public_dependency');
    const relative = url.slice('https://deno.land/std@0.168.0/'.length);
    const destination = path.join(dir, 'vendor/std-0.168.0', relative);
    let bytes;
    if (fs.existsSync(destination)) bytes = fs.readFileSync(destination);
    else { const response = await fetch(url); if (!response.ok) throw Error(`dependency_http_${response.status}`); bytes = Buffer.from(await response.arrayBuffer()); save(destination, bytes); }
    imports[url] = './vendor/std-0.168.0/' + relative;
    records.push({ specifier: url, path: path.relative(dir, destination).replaceAll('\\', '/'), sha256: sha(bytes) });
    const source = ts.createSourceFile(relative, bytes.toString(), ts.ScriptTarget.Latest, true);
    const dependencies = source.statements.filter(s => (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier)
      .map(s => s.moduleSpecifier.text);
    for (const d of dependencies) await visit(new URL(d, url).href);
  }
  await visit('https://deno.land/std@0.168.0/http/server.ts');
  return { imports, records };
}
async function prepare({ resolvePublic = false } = {}) {
  // Replay Report 48 against its original source, never substitute evolved webhook bytes.
  verifyFrozen({ historicalReplay: true });
  if (!resolvePublic && !fs.existsSync(path.join(dir, 'dependencies.json'))) throw Error('resolve_public_dependencies_once_then_freeze');
  if (!resolvePublic) {
    const deps = JSON.parse(fs.readFileSync(path.join(dir, 'dependencies.json')));
    for (const d of deps.files) if (sha(fs.readFileSync(path.join(dir, d.path))) !== d.sha256) throw Error(`dependency_drift:${d.path}`);
    return deps;
  }
  if(fs.existsSync(path.join(dir,'dependencies.json')))throw Error('dependency_closure_already_frozen');
  const std = await resolveStd();
  // A new, explicit recovery resolution. This is NOT the unknowable original esm.sh @2 bundle.
  const cache = path.join(process.env.LOCALAPPDATA, 'deno/npm/registry.npmjs.org/@supabase/supabase-js/2.110.7');
  const bundle = fs.readFileSync(path.join(cache, 'dist/umd/supabase.js'));
  save(path.join(dir, 'vendor/supabase-2.110.7.js'), bundle);
  save(path.join(dir, 'vendor/supabase-2.110.7.mjs'), bundle.toString() + '\nexport const createClient = supabase.createClient;\n');
  const imports = { ...std.imports, 'https://esm.sh/@supabase/supabase-js@2': './vendor/supabase-2.110.7.mjs' };
  saveJson(path.join(dir, 'import_map.json'), { imports });
  const files = [...std.records, ...['vendor/supabase-2.110.7.js','vendor/supabase-2.110.7.mjs','import_map.json'].map(p => ({ path: p, sha256: sha(fs.readFileSync(path.join(dir, p))) }))];
  const result = { schemaVersion: 1, resolution: 'NEW_PINNED_LOCAL_RECOVERY_NOT_ORIGINAL_HOSTED_BUNDLE', supabaseJs: '2.110.7',
    bundleOrigin: 'existing local Deno npm cache; self-contained upstream dist/umd with ESM export appended in derivative only',
    originalHostedResolution: 'UNVERIFIED', std: '0.168.0', files };
  saveJson(path.join(dir, 'dependencies.json'), result);
  return result;
}
module.exports = { root, dir, sha, json, read, save, saveJson, verifyFrozen, verifyArtifact, prepare };
if (require.main === module) prepare({ resolvePublic: process.argv.includes('--resolve-public-dependencies') })
  .then(d => console.log(JSON.stringify({ frozen: true, dependencyFiles: d.files.length, resolution: d.resolution })))
  .catch(e => { console.error(e.message); process.exitCode = 1; });
