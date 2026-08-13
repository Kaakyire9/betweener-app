import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recoveryJoinOptions,
  shouldRecoverLiveMediaTransport,
} from '../features/live/media/live-media-recovery.ts';
import type { LiveMediaAdmission } from '../features/live/media/live-media-provider.ts';

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
