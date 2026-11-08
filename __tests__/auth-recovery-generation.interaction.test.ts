import { expect, test } from '@jest/globals';

import { createAuthRecoveryGeneration } from '@/lib/auth/recovery-generation';

test('explicit sign-out invalidates pending recovery success and failure', () => {
  const guard = createAuthRecoveryGeneration();
  guard.invalidate('user-a');
  const pending = guard.begin('user-a');

  guard.invalidate(null);

  expect(guard.isCurrent(pending)).toBe(false);
});

test('a newer account invalidates recovery captured for the previous identity', () => {
  const guard = createAuthRecoveryGeneration();
  guard.invalidate('user-a');
  const pending = guard.begin('user-a');

  guard.invalidate('user-b');

  expect(guard.isCurrent(pending)).toBe(false);
  expect(guard.isCurrent(guard.begin('user-b'))).toBe(true);
});

test('unchanged identity and generation may apply its settled result', () => {
  const guard = createAuthRecoveryGeneration();
  guard.invalidate('user-a');
  const pending = guard.begin('user-a');

  expect(guard.isCurrent(pending)).toBe(true);
});
