import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, expect, test } from '@jest/globals';

import {
  beginSignInMethodAttempt,
  cancelSignInMethodAttempt,
  completeSignInMethodAttempt,
  forgetSignInMethodOnDevice,
  invalidatePendingSignInMethodAttempt,
  readLastSignInMethod,
  type LastSignInMethod,
} from '@/lib/auth/last-sign-in-method';

const USER_ID = '00000000-0000-4000-8000-000000000001';

beforeEach(async () => {
  process.env.EXPO_PUBLIC_ENVIRONMENT = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://staging-project.supabase.co';
  await AsyncStorage.clear();
});

test.each<LastSignInMethod>(['google', 'apple', 'email_link', 'password'])(
  'records %s only after its correlated successful completion',
  async (method) => {
    const attempt = await beginSignInMethodAttempt(method);
    expect(await readLastSignInMethod()).toBeNull();

    await expect(completeSignInMethodAttempt({
      attemptId: attempt.attemptId,
      method,
      sessionUserId: USER_ID,
    })).resolves.toBe(true);

    expect((await readLastSignInMethod())?.method).toBe(method);
  },
);

test('cancelled and mismatched attempts cannot overwrite a completed hint', async () => {
  const successful = await beginSignInMethodAttempt('google');
  await completeSignInMethodAttempt({
    attemptId: successful.attemptId,
    method: 'google',
    sessionUserId: USER_ID,
  });

  const cancelled = await beginSignInMethodAttempt('apple');
  await cancelSignInMethodAttempt(cancelled.attemptId);
  expect(await completeSignInMethodAttempt({
    attemptId: cancelled.attemptId,
    method: 'apple',
    sessionUserId: USER_ID,
  })).toBe(false);

  const latest = await beginSignInMethodAttempt('email_link');
  expect(await completeSignInMethodAttempt({
    attemptId: successful.attemptId,
    method: 'google',
    sessionUserId: USER_ID,
  })).toBe(false);
  await cancelSignInMethodAttempt(latest.attemptId);

  expect((await readLastSignInMethod())?.method).toBe('google');
});

test('ordinary pending-attempt invalidation retains the completed device hint', async () => {
  const attempt = await beginSignInMethodAttempt('password');
  await completeSignInMethodAttempt({
    attemptId: attempt.attemptId,
    method: 'password',
    sessionUserId: USER_ID,
  });

  await invalidatePendingSignInMethodAttempt();

  expect((await readLastSignInMethod())?.method).toBe('password');
});

test('environment and backend project scopes do not share hints', async () => {
  const attempt = await beginSignInMethodAttempt('google');
  await completeSignInMethodAttempt({
    attemptId: attempt.attemptId,
    method: 'google',
    sessionUserId: USER_ID,
  });

  process.env.EXPO_PUBLIC_ENVIRONMENT = 'production';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://production-project.supabase.co';
  expect(await readLastSignInMethod()).toBeNull();

  process.env.EXPO_PUBLIC_ENVIRONMENT = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://staging-project.supabase.co';
  expect((await readLastSignInMethod())?.method).toBe('google');
});

test('forget-device wins against an already-running completion write', async () => {
  const attempt = await beginSignInMethodAttempt('email_link');
  const completion = completeSignInMethodAttempt({
    attemptId: attempt.attemptId,
    method: 'email_link',
    sessionUserId: USER_ID,
  });
  const forgetting = forgetSignInMethodOnDevice();

  await Promise.all([completion, forgetting]);

  expect(await readLastSignInMethod()).toBeNull();
});
