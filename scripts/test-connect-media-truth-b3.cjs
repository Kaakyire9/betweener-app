const { B3 } = require('./lib/connect-media-truth/profiles.cjs');
const { main } = require('./test-connect-media-truth.cjs');
if (require.main === module) main(process.argv.slice(2), B3).catch(() => { console.error('media_truth_b3_runner_failed'); process.exitCode = 1; });
module.exports = { main: (args = []) => main(args, B3) };
