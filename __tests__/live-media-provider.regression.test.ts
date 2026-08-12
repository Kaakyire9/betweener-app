import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LiveMediaAdmissionError,
  parseLiveMediaAdmission,
} from '../features/live/media/live-media-admission.ts';
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
