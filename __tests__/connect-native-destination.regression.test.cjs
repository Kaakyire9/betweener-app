const test = require('node:test'), assert = require('node:assert/strict');
const { reconcileNativeDestination } = require('../supabase/functions/_shared/connect-native-destination.ts');
const job = () => ({ token_hash: 'synthetic-hash', token: 'synthetic-push-token', platform: 'ios', user_id: 'current-user', possible_users: ['prior-user', 'current-user'], generation: 3, lease: 'lease-1' });
function fixture() {
  const events = []; let failure = '', ack = true, current = true;
  return { events, fail(value) { failure = value; }, ack(value) { ack = value; }, retire() { current=false; }, port: {
    async current() { return current; },
    async remove(_token, user) { events.push(['remove', user]); if (failure === 'remove') throw Error('offline'); },
    async register(_token, user) { events.push(['register', user]); if (failure === 'register') throw Error('ambiguous'); },
    async complete(_job, success) { events.push(['complete', success]); return ack; },
  } };
}
test('native destination transfer removes every prior owner before registration', async () => {
  const f = fixture(); assert.equal((await reconcileNativeDestination(job(), f.port)).success, true);
  assert.deepEqual(f.events, [['remove','prior-user'],['remove','current-user'],['register','current-user'],['complete',true]]);
});
test('disabled admission cleanup deletes destinations without registering a new one', async () => {
  const f = fixture(); await reconcileNativeDestination({ ...job(), user_id: null }, f.port);
  assert.equal(f.events.some(event => event[0] === 'register'), false); assert.deepEqual(f.events.at(-1), ['complete',true]);
});
for (const operation of ['remove','register']) test(`ambiguous ${operation} preserves retry work`, async () => {
  const f = fixture(); f.fail(operation); assert.equal((await reconcileNativeDestination(job(), f.port)).success, false);
  assert.deepEqual(f.events.at(-1), ['complete',false]);
});
test('stale/ambiguous database completion is never automatically retried', async () => {
  const f = fixture(); f.ack(false); await assert.rejects(reconcileNativeDestination(job(), f.port), /conflict/);
  assert.equal(f.events.filter(event => event[0] === 'complete').length, 1);
});

test('a retired registration removes old bindings but cannot register a successor', async () => {
  const f=fixture(); f.retire();
  assert.equal((await reconcileNativeDestination(job(),f.port)).success,false);
  assert.equal(f.events.some(event=>event[0]==='register'),false);
  assert.deepEqual(f.events.at(-1),['complete',false]);
});
