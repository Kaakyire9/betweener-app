const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { createHash } = require('node:crypto'); const ts = require('typescript');
const { parseB2Manifest, parseB3Manifest, syntheticB2Ledger, syntheticB3Ledger, buildCreateRequest,
  assertB2Request, assertB3Request, validateRequestNumbers } = require('./request.cjs');
function installedSdk() {
  const cache = process.env.DENO_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'deno');
  const root = path.join(cache, 'npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63');
  if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version !== '0.7.63') throw new Error('pinned_sdk_contract_missing');
  return root;
}
function sdkSources() {
  const root = installedSdk();
  return ['package.json', 'dist/index.d.ts', 'dist/index.es.mjs', 'src/ApiClient.ts', 'src/types.ts',
    'src/StreamClient.ts', 'src/gen/models/index.ts', 'src/gen/video/CallApi.ts', 'src/gen/video/VideoApi.ts'].map((name) => path.join(root, name).replaceAll('\\', '/'));
}
function inspectSdkContract(request) {
  const declaration = path.join(installedSdk(), 'dist/index.d.ts').replaceAll('\\', '/');
  const filename = path.resolve('tmp/connect-media-truth-b2-preparation/virtual-request-contract.ts');
  // Concrete contextual literal, no any/as-cast: validates the exact builder output, including nested required fields.
  const source = `import type { GetOrCreateCallRequest } from '${declaration}';\nconst request: GetOrCreateCallRequest = ${JSON.stringify(request)};\nvoid request;\n`;
  const options = { noEmit: true, strict: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowImportingTsExtensions: true };
  const host = ts.createCompilerHost(options); const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, onError, shouldCreate) => path.resolve(file) === filename
    ? ts.createSourceFile(file, source, language, true) : original(file, language, onError, shouldCreate);
  const program = ts.createProgram([filename], options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter((entry) => entry.category === ts.DiagnosticCategory.Error)
    .map((entry) => ({ code: entry.code, message: ts.flattenDiagnosticMessageText(entry.messageText, '\n') }));
  return { sdkVersion: '0.7.63', passed: errors.length === 0, errors };
}
function validateB2Contract(manifest) {
  const parsed = parseB2Manifest(manifest); const ledger = syntheticB2Ledger();
  const request = buildCreateRequest(parsed, ledger); assertB2Request(request, parsed, ledger);
  const contract = inspectSdkContract(request);
  if (!contract.passed) throw Object.assign(new Error('b2_sdk_request_contract_invalid'), { contract });
  return { ...contract, schemaVersion: parsed.schemaVersion,
    requestSha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'), request };
}
function validateB3Contract(manifest) {
  const parsed = parseB3Manifest(manifest); const ledger = syntheticB3Ledger();
  const request = buildCreateRequest(parsed, ledger); assertB3Request(request, parsed, ledger); validateRequestNumbers(request);
  const contract = inspectSdkContract(request);
  if (!contract.passed) throw Object.assign(new Error('b3_sdk_request_contract_invalid'), { contract });
  return { ...contract, schemaVersion: parsed.schemaVersion, numericConstraints: 'PASS',
    requestSha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'), request };
}
module.exports = { installedSdk, sdkSources, inspectSdkContract, validateB2Contract, validateB3Contract };
