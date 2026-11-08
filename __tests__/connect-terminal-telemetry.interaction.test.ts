import { afterEach, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/react-native';
import { initSentry } from '@/lib/telemetry/sentry';

jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));
const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
afterEach(() => {
  if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  jest.clearAllMocks();
});
function options() {
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://synthetic@example.invalid/1';
  initSentry();
  return jest.mocked(Sentry.init).mock.calls[0][0]!;
}
it('excludes Connect console traces and their argument data from remote breadcrumbs', () => {
  const before = options().beforeBreadcrumb!;
  expect(before({ category: 'console', message: '[Connect] {"event":"audio_setup"}', data: { arguments: ['local trace'] } }, {})).toBeNull();
});
it('preserves ordinary Live and application breadcrumbs', () => {
  const before = options().beforeBreadcrumb!;
  for (const message of ['[Live] ready', 'Push registration complete']) {
    const breadcrumb = { category: 'console', message, data: { ready: true } };
    expect(before(breadcrumb, {})).toEqual(breadcrumb);
  }
});
