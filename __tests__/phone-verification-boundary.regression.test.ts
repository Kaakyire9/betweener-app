import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isApprovedPhoneCheck,
  normalizeVerificationInput,
  resolveVerificationCaller,
} from '../supabase/functions/_shared/phone-verification-boundary.ts';

const attempt = '00000000-0000-4000-8000-000000000001';
const sid = 'VE00000000000000000000000000000161';
const phone = '+12025550161';

test('send and check use the same canonical phone and require a valid signup attempt', () => {
  assert.deepEqual(normalizeVerificationInput({ signupSessionId: attempt, phoneNumber: '+233 (0) 24 555 0161' }),
    { signupSessionId: attempt, phone: '+233245550161' });
  assert.equal(normalizeVerificationInput({ signupSessionId: 'other', phoneNumber: phone }), null);
  assert.equal(normalizeVerificationInput({ signupSessionId: attempt, phoneNumber: 'not a phone' }), null);
});

test('phone verification requires a validated bearer and rejects a different supplied user', async () => {
  const bearer = new Request('https://example.invalid', { headers: { Authorization: 'Bearer signed-token' } });
  const readUser = async (token: string) => {
    assert.equal(token, 'signed-token');
    return { data: { user: { id: 'authenticated-user' } }, error: null };
  };
  assert.deepEqual(await resolveVerificationCaller(new Request('https://example.invalid'), readUser), { status: 401 });
  assert.deepEqual(await resolveVerificationCaller(bearer, async () => ({ data: { user: null }, error: 'invalid' })), { status: 401 });
  assert.deepEqual(await resolveVerificationCaller(bearer, readUser, 'other-user'), { status: 403 });
  assert.deepEqual(await resolveVerificationCaller(bearer, readUser), { status: 200, userId: 'authenticated-user' });
});

test('only an approved valid response for the reserved provider SID and phone can establish ownership', () => {
  const approval = { sid, to: phone, status: 'approved', valid: true };
  assert.equal(isApprovedPhoneCheck(approval, sid, phone), true);
  assert.equal(isApprovedPhoneCheck({ ...approval, status: 'pending' }, sid, phone), false);
  assert.equal(isApprovedPhoneCheck({ ...approval, valid: false }, sid, phone), false);
  assert.equal(isApprovedPhoneCheck({ ...approval, sid: sid.slice(0, -1) + '2' }, sid, phone), false);
  assert.equal(isApprovedPhoneCheck({ ...approval, to: '+12025550162' }, sid, phone), false);
});
