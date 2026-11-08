const { B2 } = require('./lib/connect-media-truth/profiles.cjs');
const { main } = require('./test-connect-media-truth.cjs');
if (require.main === module) main(process.argv.slice(2), B2).catch(() => { console.error('media_truth_b2_runner_failed'); process.exitCode = 1; });
module.exports = { main: (args = []) => main(args, B2) };
