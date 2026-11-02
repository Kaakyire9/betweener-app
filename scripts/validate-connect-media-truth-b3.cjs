const { readManifest } = require('./lib/connect-media-truth/approval.cjs');
const { B3 } = require('./lib/connect-media-truth/profiles.cjs');
const { validateB3Contract } = require('./lib/connect-media-truth/sdk-contract.cjs');
function validate() {
  const { manifest, hash } = readManifest(B3.manifestPath);
  return { mode: 'OFFLINE_CONTRACT_ONLY_NO_PROVIDER_ACCESS', manifestSha256: hash, ...validateB3Contract(manifest) };
}
if (require.main === module) { try { console.log(JSON.stringify(validate(), null, 2)); } catch { console.error('b3_offline_contract_failed'); process.exitCode = 1; } }
module.exports = { validate };
