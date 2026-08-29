import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  foregroundRecoveryDelayMs,
  isTerminalLiveAdmissionError,
  liveAdmissionErrorCode,
  LIVE_MEDIA_FAILED_RECOVERY_GRACE_MS,
  LIVE_MEDIA_FOREGROUND_REFRESH_AFTER_MS,
  LIVE_MEDIA_RECONNECT_GRACE_MS,
  LIVE_MEDIA_TOKEN_REFRESH_SAFETY_MS,
  recoveryJoinOptions,
  shouldRefreshLiveAdmissionOnForeground,
  shouldRecoverLiveMediaTransport,
} from '../features/live/media/live-media-recovery.ts';
import type { LiveMediaAdmission } from '../features/live/media/live-media-provider.ts';

const mediaSessionHook = readFileSync(
  new URL('../features/live/hooks/use-live-media-session.ts', import.meta.url),
  'utf8',
);

const admission = (publisher: boolean): LiveMediaAdmission => ({
  apiKey: 'key',
  token: 'token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  sessionId: 'session',
  user: { id: 'user' },
  call: { provider: 'stream', type: 'betweener_live', id: 'call', cid: 'betweener_live:call' },
  primaryRole: publisher ? 'participant' : 'audience',
  roles: [publisher ? 'participant' : 'audience'],
  capabilities: publisher ? ['live.join', 'live.publish'] : ['live.join'],
  participantState: publisher ? 'on_stage' : 'audience',
  sessionStatus: 'live',
});

test('failed transport only triggers recovery for an intentionally maintained session', () => {
  assert.equal(shouldRecoverLiveMediaTransport('failed', true), true);
  assert.equal(shouldRecoverLiveMediaTransport('failed', false), false);
  assert.equal(shouldRecoverLiveMediaTransport('reconnecting', true), false);
});

test('terminal admission denials stop transport recovery while transient failures remain retryable', () => {
  assert.equal(
    isTerminalLiveAdmissionError(new Error('live_private_spark_admission_forbidden')),
    true,
  );
  assert.equal(
    isTerminalLiveAdmissionError(new Error('live_private_spark_consent_incomplete')),
    true,
  );
  assert.equal(
    isTerminalLiveAdmissionError(new Error('live_token_temporarily_unavailable')),
    false,
  );
  assert.equal(liveAdmissionErrorCode(new Error(' LIVE_ADMISSION_DENIED ')), 'live_admission_denied');
});

test('foreground recovery gives the native transport time to reconnect first', () => {
  assert.equal(foregroundRecoveryDelayMs('connected', true), null);
  assert.equal(foregroundRecoveryDelayMs('failed', false), null);
  assert.equal(
    foregroundRecoveryDelayMs('failed', true),
    LIVE_MEDIA_FAILED_RECOVERY_GRACE_MS,
  );
  assert.equal(
    foregroundRecoveryDelayMs('reconnecting', true),
    LIVE_MEDIA_RECONNECT_GRACE_MS,
  );
});

test('foreground recovery proactively replaces stale or nearly expired credentials', () => {
  const nowMs = Date.parse('2026-08-18T16:00:00.000Z');
  assert.equal(shouldRefreshLiveAdmissionOnForeground({
    backgroundedAtMs: nowMs - 10_000,
    expiresAt: new Date(nowMs + LIVE_MEDIA_TOKEN_REFRESH_SAFETY_MS + 1).toISOString(),
    nowMs,
    shouldMaintainConnection: true,
  }), false);
  assert.equal(shouldRefreshLiveAdmissionOnForeground({
    backgroundedAtMs: nowMs - LIVE_MEDIA_FOREGROUND_REFRESH_AFTER_MS,
    expiresAt: new Date(nowMs + 600_000).toISOString(),
    nowMs,
    shouldMaintainConnection: true,
  }), true);
  assert.equal(shouldRefreshLiveAdmissionOnForeground({
    backgroundedAtMs: nowMs - 1_000,
    expiresAt: new Date(nowMs + LIVE_MEDIA_TOKEN_REFRESH_SAFETY_MS).toISOString(),
    nowMs,
    shouldMaintainConnection: true,
  }), true);
  assert.equal(shouldRefreshLiveAdmissionOnForeground({
    backgroundedAtMs: nowMs - 1_000,
    expiresAt: 'invalid-expiry',
    nowMs,
    shouldMaintainConnection: true,
  }), true);
  assert.equal(shouldRefreshLiveAdmissionOnForeground({
    backgroundedAtMs: nowMs - LIVE_MEDIA_FOREGROUND_REFRESH_AFTER_MS,
    expiresAt: null,
    nowMs,
    shouldMaintainConnection: false,
  }), false);
});

test('recovery preserves publisher intent only with fresh publish authority', () => {
  assert.deepEqual(recoveryJoinOptions(admission(true), {
    audioEnabled: true,
    videoEnabled: true,
  }), {
    mode: 'backstage',
    audioEnabled: true,
    videoEnabled: true,
  });
  assert.deepEqual(recoveryJoinOptions(admission(false), {
    audioEnabled: true,
    videoEnabled: true,
  }), {
    mode: 'audience',
    audioEnabled: false,
    videoEnabled: false,
  });
});

test('an intentional room handoff suppresses a stale public recovery failure', () => {
  assert.match(
    mediaSessionHook,
    /catch \(nextError\) \{[\s\S]+!shouldMaintainConnectionRef\.current[\s\S]+transport-recovery-failed/i,
  );
  assert.match(
    mediaSessionHook,
    /const leave = useCallback[\s\S]+shouldMaintainConnectionRef\.current = false[\s\S]+joinAttemptRef\.current \+= 1/i,
  );
});

test('authority revocation becomes a terminal exit rather than a retry loop', () => {
  assert.match(
    mediaSessionHook,
    /terminalAdmission[\s\S]+shouldMaintainConnectionRef\.current = false[\s\S]+transport-ended-by-authority/i,
  );
  assert.match(mediaSessionHook, /await provider\.leaveSession\(\)\.catch/);
});

test('the media session records background duration and refreshes credentials on resume', () => {
  assert.match(mediaSessionHook, /backgroundedAtRef\.current = Date\.now\(\)/);
  assert.match(mediaSessionHook, /admissionExpiresAtRef\.current = admission\.expiresAt/);
  assert.match(mediaSessionHook, /shouldRefreshLiveAdmissionOnForeground/);
  assert.match(mediaSessionHook, /app_foreground_credential_refresh/);
});
