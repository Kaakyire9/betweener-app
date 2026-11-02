/* global __dirname */
// Test process only. Generated protocol comes from the exact installed SDK.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const base = path.resolve(__dirname, '../../node_modules/@stream-io/video-client/src/gen/video/sfu');
module.exports = { ...require(path.join(base, 'event/events.ts')), ...require(path.join(base, 'models/models.ts')),
  ...require(path.join(base, 'signal_rpc/signal.ts')) };
