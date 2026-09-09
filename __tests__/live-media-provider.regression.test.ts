import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LiveMediaAdmissionError,
  parseLiveMediaAdmission,
} from '../features/live/media/live-media-admission.ts';
import {
  LIVE_MEDIA_ADMISSION_RETRY_DELAYS_MS,
  requestWithLiveMediaAdmissionRetry,
} from '../features/live/media/live-media-admission-retry.ts';
import { readFunctionErrorCode } from '../features/live/media/live-function-error.ts';
import type {
  LiveMediaAdmission,
  LiveMediaProvider,
} from '../features/live/media/live-media-provider.ts';

const validAdmission = (): LiveMediaAdmission => ({
  apiKey: 'stream-key',
  token: 'signed-token-with-safe-length',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  sessionId: '11111111-1111-4111-8111-111111111111',
  user: { id: '22222222-2222-4222-8222-222222222222' },
  call: {
    provider: 'stream',
    type: 'betweener_live',
    id: 'live-11111111-1111-4111-8111-111111111111',
    cid: 'betweener_live:live-11111111-1111-4111-8111-111111111111',
  },
  primaryRole: 'audience',
  roles: ['audience'],
  capabilities: ['live.join', 'live.comment'],
  participantState: 'audience',
  sessionStatus: 'live',
});

test('Live media admission accepts a scoped, unexpired public session contract', () => {
  const admission = validAdmission();
  assert.deepEqual(parseLiveMediaAdmission(admission), admission);
});

test('Live media admission rejects expired credentials and mismatched call identity', () => {
  const expired = validAdmission();
  expired.expiresAt = new Date(Date.now() - 1_000).toISOString();
  assert.throws(
    () => parseLiveMediaAdmission(expired),
    (error: unknown) => error instanceof LiveMediaAdmissionError
      && error.code === 'live_media_admission_expired',
  );

  const mismatched = validAdmission();
  mismatched.call.cid = 'betweener_live:different';
  assert.throws(
    () => parseLiveMediaAdmission(mismatched),
    /live_media_admission_provider_invalid/,
  );
});

test('Live media admission rejects private-spark state at the public endpoint', () => {
  const admission = validAdmission();
  admission.participantState = 'private_spark';
  assert.throws(
    () => parseLiveMediaAdmission(admission),
    /live_media_admission_authority_invalid/,
  );
});

test('Live media admission rejects missing authoritative join capability', () => {
  const admission = validAdmission();
  admission.capabilities = ['live.comment'];
  assert.throws(
    () => parseLiveMediaAdmission(admission),
    /live_media_admission_authority_invalid/,
  );
});

test('Live media admission preserves structured Edge Function failure codes', async () => {
  const responseError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assert.equal(await readFunctionErrorCode(responseError), 'rate_limited');

  const structuredError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { code: 'live_admission_denied' },
  });
  assert.equal(await readFunctionErrorCode(structuredError), 'live_admission_denied');

  const reactNativeError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: {
      clone: () => { throw new Error('response_clone_unavailable'); },
      _bodyInit: JSON.stringify({ error: 'live_admission_session_unavailable' }),
    },
  });
  assert.equal(
    await readFunctionErrorCode(reactNativeError),
    'live_admission_session_unavailable',
  );
});

test('Live media admission retries only bounded temporary token failures', async () => {
  let attempts = 0;
  const waits: number[] = [];
  const result = await requestWithLiveMediaAdmissionRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('live_token_temporarily_unavailable');
      return 'admitted';
    },
    async (delayMs) => { waits.push(delayMs); },
  );

  assert.equal(result, 'admitted');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [...LIVE_MEDIA_ADMISSION_RETRY_DELAYS_MS]);

  let terminalAttempts = 0;
  await assert.rejects(
    requestWithLiveMediaAdmissionRetry(async () => {
      terminalAttempts += 1;
      throw new Error('live_admission_denied');
    }, async () => undefined),
    /live_admission_denied/,
  );
  assert.equal(terminalAttempts, 1);
});

test('provider abstraction exposes transport controls without Stream-specific types', () => {
  const providerMethods: readonly (keyof LiveMediaProvider)[] = [
    'initialize',
    'joinSession',
    'leaveSession',
    'setAudioEnabled',
    'setVideoEnabled',
    'requestPublishPermission',
    'revokePublishPermission',
    'terminateCall',
    'getConnectionQuality',
    'dispose',
  ];
  assert.equal(new Set(providerMethods).size, providerMethods.length);
});
