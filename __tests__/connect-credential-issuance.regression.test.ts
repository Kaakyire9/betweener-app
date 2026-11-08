import assert from 'node:assert/strict';
import test from 'node:test';
import { issueConnectCredentials } from '../supabase/functions/_shared/connect-credential-issuance.ts';
import type { ProviderSnapshot } from '../supabase/functions/_shared/connect-stream-adapter.ts';

const id = 'aa310000-0000-4000-8000-000000000001';
const user = 'aa310000-0000-4000-8000-000000000002';
const admission = { admitted: true, id, user_id: user, media: 'voice', call_type: 'betweener_connect', state: 'CONNECTING' };
const snapshot: ProviderSnapshot = { id, caller_user_id: user, recipient_user_id: 'aa310000-0000-4000-8000-000000000003',
  media: 'voice', state: 'CONNECTING', ended_at: null, can_provision: true, provider_session_id: null };
function fixture(results: unknown[]) {
  const steps: string[] = [];
  return { steps, port: {
    async admit() { steps.push('admit'); return results.shift(); },
    async snapshot() { steps.push('snapshot'); return snapshot; },
    async issue() { steps.push('issue'); return { token: 'mock-only', expiresAt: '2026-10-29T12:00:00Z',
      call: { type: 'betweener_connect', id, cid: `betweener_connect:${id}` } }; },
  } };
}
test('credentials require affirmative admission at both fences', async () => {
  const f = fixture([admission, admission]);
  const result = await issueConnectCredentials(f.port, user, id);
  assert.equal(result.media, 'voice'); assert.equal(result.token, 'mock-only');
  assert.deepEqual(f.steps, ['admit', 'snapshot', 'issue', 'admit']);
});
for (const denied of [null, {}, { ...admission, admitted: false }, { ...admission, admitted: undefined },
  { ...admission, admitted: 'true' }, { ...admission, user_id: 'other' }, { ...admission, id: 'other' },
  { ...admission, media: 'screen' }, { ...admission, state: 'ENDED' }, { ...admission, call_type: 'betweener_live' }]) {
  test(`invalid initial admission never reaches provider: ${JSON.stringify(denied)}`, async () => {
    const f = fixture([denied]);
    await assert.rejects(issueConnectCredentials(f.port, user, id), /connect_unavailable/);
    assert.deepEqual(f.steps, ['admit']);
  });
}
test('structured revoke after membership update suppresses credentials response', async () => {
  const f = fixture([admission, { admitted: false, error: 'connect_unavailable' }]);
  await assert.rejects(issueConnectCredentials(f.port, user, id), /connect_unavailable/);
  assert.deepEqual(f.steps, ['admit', 'snapshot', 'issue', 'admit']);
});
test('changed media or actor in final admission suppresses the response', async () => {
  for (const result of [{ ...admission, media: 'video' }, { ...admission, user_id: 'other' }]) {
    const f = fixture([admission, result]);
    await assert.rejects(issueConnectCredentials(f.port, user, id), /connect_unavailable/);
  }
});
test('real RPC failure stays a failure instead of becoming affirmative admission', async () => {
  const f = fixture([]); f.port.admit = async () => { throw new Error('rpc_failed'); };
  await assert.rejects(issueConnectCredentials(f.port, user, id), /rpc_failed/);
  assert.deepEqual(f.steps, []);
});
