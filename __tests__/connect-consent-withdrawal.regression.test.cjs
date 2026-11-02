const test = require('node:test'); const assert = require('node:assert/strict');
const { withdrawCallingConsent } = require('../features/connect/application/withdraw-calling-consent.ts');
test('withdrawal stops locally and uses the existing account preference command', async () => {
  const events = [];
  await withdrawCallingConsent({ async hangup() { events.push('end'); }, async setPreferences(v, c) { events.push([v, c]); } });
  assert.deepEqual(events, ['end', [false, false]]);
});
for (const hangup of [() => new Promise(() => {}), () => { throw Error('leave failed'); }, () => Promise.reject(Error('leave failed'))]) {
  test('failed or hung local teardown cannot suppress consent withdrawal', async () => {
    let saved = false; await withdrawCallingConsent({ hangup, async setPreferences(v, c) { assert.equal(v, false); assert.equal(c, false); saved = true; } });
    assert.equal(saved, true);
  });
}
test('unavailable authority never returns a successful persistence result', async () => {
  let ended = false;
  await assert.rejects(withdrawCallingConsent({ async hangup() { ended = true; }, async setPreferences() { throw Error('offline'); } }), /offline/);
  assert.equal(ended, true);
});
