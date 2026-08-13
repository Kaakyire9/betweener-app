import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StreamLiveMediaProvider,
  StreamLiveMediaProviderError,
  type StreamLiveMediaBindings,
} from '../features/live/media/stream-live-media-provider.ts';
import type { LiveMediaAdmission } from '../features/live/media/live-media-provider.ts';

const admission = (publisher = false): LiveMediaAdmission => ({
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
  primaryRole: publisher ? 'participant' : 'audience',
  roles: [publisher ? 'participant' : 'audience'],
  capabilities: publisher
    ? ['live.join', 'live.publish']
    : ['live.join', 'live.comment'],
  participantState: publisher ? 'backstage' : 'audience',
  sessionStatus: 'live',
});

const bindings = () => {
  const events: string[] = [];
  const result: StreamLiveMediaBindings = {
    client: {
      call: () => result.call,
      disconnectUser: async () => { events.push('disconnect'); },
    },
    call: {
      camera: {
        enable: async () => { events.push('camera:enable'); },
        disable: async () => { events.push('camera:disable'); },
      },
      microphone: {
        enable: async () => { events.push('microphone:enable'); },
        disable: async () => { events.push('microphone:disable'); },
      },
      state: { localParticipant: { connectionQuality: 3 } },
      join: async ({ create }) => {
        assert.equal(create, false);
        events.push('join');
      },
      leave: async () => { events.push('leave'); },
    },
  };
  return { events, result };
};

test('Stream adapter joins an audience member muted and never creates a call', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(false);

  await provider.initialize(scope, async () => scope);
  await provider.joinSession({ mode: 'audience', audioEnabled: false, videoEnabled: false });

  assert.equal(provider.state, 'joined');
  assert.equal(provider.getConnectionQuality(), 'excellent');
  assert.equal(fake.events.includes('camera:enable'), false);
  assert.equal(fake.events.includes('microphone:enable'), false);
  assert.equal(fake.events.includes('join'), true);
});

test('Stream adapter rejects audience publication before touching devices', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(false);
  await provider.initialize(scope, async () => scope);

  await assert.rejects(
    provider.joinSession({ mode: 'audience', audioEnabled: true, videoEnabled: true }),
    (error: unknown) => error instanceof StreamLiveMediaProviderError
      && error.code === 'live_publish_not_authorized',
  );
  assert.deepEqual(fake.events, []);
});

test('Stream adapter allows authorized backstage publication and serializes duplicate joins', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(true);
  await provider.initialize(scope, async () => scope);

  await Promise.all([
    provider.joinSession({ mode: 'backstage', audioEnabled: true, videoEnabled: true }),
    provider.joinSession({ mode: 'backstage', audioEnabled: true, videoEnabled: true }),
  ]);

  assert.equal(fake.events.filter((event) => event === 'join').length, 1);
  assert.equal(fake.events.filter((event) => event === 'camera:enable').length, 1);
  assert.equal(fake.events.filter((event) => event === 'microphone:enable').length, 1);
});

test('Stream adapter rejects token refresh identity drift and disposes account state', async () => {
  const fake = bindings();
  let getToken: (() => Promise<string>) | undefined;
  const provider = new StreamLiveMediaProvider(async ({ tokenProvider }) => {
    getToken = tokenProvider;
    return fake.result;
  });
  const scope = admission(false);
  await provider.initialize(scope, async () => ({
    ...scope,
    user: { id: '33333333-3333-4333-8333-333333333333' },
  }));

  await assert.rejects(
    getToken?.(),
    /live_media_refresh_identity_mismatch/,
  );
  await provider.dispose();
  await provider.dispose();

  assert.equal(provider.state, 'disposed');
  assert.equal(fake.events.filter((event) => event === 'disconnect').length, 1);
});

test('Stream adapter rebuilds bindings when authority changes for the same identity', async () => {
  const first = bindings();
  const second = bindings();
  let factoryCalls = 0;
  const provider = new StreamLiveMediaProvider(async () => {
    factoryCalls += 1;
    return factoryCalls === 1 ? first.result : second.result;
  });
  const initial = admission(false);
  const promoted = admission(true);

  await provider.initialize(initial, async () => initial);
  await provider.initialize(promoted, async () => promoted);

  assert.equal(factoryCalls, 2);
  assert.equal(first.events.includes('disconnect'), true);
  assert.equal(provider.state, 'ready');
});

test('Stream adapter reserves promotion and termination for backend authority', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(true);
  await provider.initialize(scope, async () => scope);

  await assert.rejects(provider.requestPublishPermission(), /requires_server_authority/);
  await assert.rejects(provider.terminateCall(), /requires_server_authority/);
});
