// Test subprocess. Credentials enter stdin, never files or logs.
const readline = require('node:readline');
const { openAuditSession } = require('./connect-stream-sfu-session.cjs');
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
(async () => {
  const lines = readline.createInterface({ input: process.stdin });
  let session;
  try {
    for await (const line of lines) {
      const input = JSON.parse(line);
      if (!session) {
        session = await openAuditSession(input);
        emit(session.result);
        if (!process.argv.includes('--hold')) break;
      } else {
        if (input.op === 'close') break;
        if (input.op === 'subscribe') emit({ id: input.id, ...(await session.subscribe(input.peer)) });
        else if (input.op === 'transmit') emit({ id: input.id, transmission: await session.transmit(input.target) });
        else if (input.op === 'stats') emit({ id: input.id, ...(await session.stats()) });
        else throw new Error('sfu_unknown_command');
      }
    }
  } catch (error) {
    emit(error.auditResult ?? { failure: /^sfu_[a-z0-9_]+$/.test(error.message) ? error.message : 'sfu_probe_unavailable' });
  } finally { await session?.close(); lines.close(); }
})().catch(() => { emit({ failure: 'sfu_probe_unavailable' }); process.exitCode = 1; });
