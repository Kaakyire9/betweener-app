import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StreamLiveMediaProvider,
  StreamLiveMediaProviderError,
  transportStateFromStreamCallingState,
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
  const callingStateListeners = new Set<(state: string) => void>();
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
      state: {
        localParticipant: { connectionQuality: 3 },
        callingState: 'idle',
        callingState$: {
          subscribe: (listener) => {
            callingStateListeners.add(listener);
            return { unsubscribe: () => callingStateListeners.delete(listener) };
          },
        },
      },
      join: async ({ create }) => {
        assert.equal(create, false);
        events.push('join');
        result.call.state.callingState = 'joined';
        for (const listener of callingStateListeners) listener('joined');
      },
      leave: async () => {
        events.push('leave');
        result.call.state.callingState = 'left';
        for (const listener of callingStateListeners) listener('left');
      },
    },
  };
  return {
    events,
    result,
    emitCallingState: (state: string) => {
      result.call.state.callingState = state;
      for (const listener of callingStateListeners) listener(state);
    },
  };
};

test('Stream calling states map to provider-neutral transport states', () => {
  assert.equal(transportStateFromStreamCallingState('joined'), 'connected');
  assert.equal(transportStateFromStreamCallingState('reconnecting'), 'reconnecting');
  assert.equal(transportStateFromStreamCallingState('offline'), 'reconnecting');
  assert.equal(transportStateFromStreamCallingState('reconnecting-failed'), 'failed');
  assert.equal(transportStateFromStreamCallingState('left'), 'failed');
});

test('Stream adapter exposes transport failure and resets stale bindings before rejoin', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(false);
  const observed: string[] = [];
  const unsubscribe = provider.subscribeTransportState((state) => observed.push(state));

  await provider.initialize(scope, async () => scope);
  await provider.joinSession({ mode: 'audience', audioEnabled: false, videoEnabled: false });
  fake.emitCallingState('reconnecting-failed');
  await provider.resetConnection();
  unsubscribe();

  assert.deepEqual(observed.slice(-3), ['connected', 'failed', 'idle']);
  assert.equal(fake.events.includes('leave'), true);
  assert.equal(fake.events.includes('disconnect'), true);
  assert.equal(provider.state, 'idle');
});

test('Stream adapter joins an audience member muted and never creates a call', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(false);

  await provider.initialize(scope, async () => scope);
  const result = await provider.joinSession({ mode: 'audience', audioEnabled: false, videoEnabled: false });

  assert.equal(provider.state, 'joined');
  assert.equal(provider.getConnectionQuality(), 'excellent');
  assert.equal(fake.events.includes('camera:enable'), false);
  assert.equal(fake.events.includes('microphone:enable'), false);
  assert.equal(fake.events.includes('join'), true);
  assert.deepEqual(result, { audioEnabled: false, videoEnabled: false, deviceIssues: [] });
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

test('Stream adapter reconciles an authorized host handoff while participant state catches up', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope: LiveMediaAdmission = {
    ...admission(true),
    primaryRole: 'host',
    roles: ['host'],
    participantState: 'confirmed',
    sessionStatus: 'live',
  };
  await provider.initialize(scope, async () => scope);

  await provider.joinSession({ mode: 'backstage', audioEnabled: true, videoEnabled: true });

  assert.equal(provider.state, 'joined');
  assert.equal(fake.events.includes('join'), true);
});

test('Stream adapter keeps a seat requester in audience transport until promotion', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope: LiveMediaAdmission = {
    ...admission(false),
    participantState: 'stage_requested',
  };
  await provider.initialize(scope, async () => scope);

  await provider.joinSession({ mode: 'audience', audioEnabled: false, videoEnabled: false });

  assert.equal(provider.state, 'joined');
  assert.equal(fake.events.includes('join'), true);
});

test('Stream adapter does not treat a guest publish capability as a backstage state', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope: LiveMediaAdmission = {
    ...admission(true),
    participantState: 'confirmed',
  };
  await provider.initialize(scope, async () => scope);

  await assert.rejects(
    provider.joinSession({ mode: 'backstage', audioEnabled: true, videoEnabled: true }),
    (error: unknown) => error instanceof StreamLiveMediaProviderError
      && error.code === 'live_backstage_state_invalid',
  );
  assert.deepEqual(fake.events, []);
});

test('Stream adapter keeps an admitted participant joined when camera publication needs attention', async () => {
  const fake = bindings();
  fake.result.call.camera.enable = async () => {
    fake.events.push('camera:enable');
    throw new Error('native_camera_busy');
  };
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(true);
  await provider.initialize(scope, async () => scope);

  const result = await provider.joinSession({
    mode: 'backstage',
    audioEnabled: true,
    videoEnabled: true,
  });

  assert.equal(provider.state, 'joined');
  assert.equal(fake.events.includes('leave'), false);
  assert.equal(result.audioEnabled, true);
  assert.equal(result.videoEnabled, false);
  assert.equal(result.deviceIssues[0]?.device, 'camera');
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

test('Stream adapter reconciles a server-authorized promotion without leaving the call', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const audience = admission(false);
  const promoted: LiveMediaAdmission = {
    ...admission(true),
    participantState: 'on_stage',
  };

  await provider.initialize(audience, async () => audience);
  await provider.joinSession({ mode: 'audience', audioEnabled: false, videoEnabled: false });
  await provider.reconcileAdmission(promoted);
  await provider.setVideoEnabled(true);

  assert.equal(fake.events.filter((event) => event === 'join').length, 1);
  assert.equal(fake.events.includes('leave'), false);
  assert.equal(fake.events.includes('camera:enable'), true);
});

test('Stream adapter applies server-authorized demotion and blocks publication regression', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const publisher: LiveMediaAdmission = {
    ...admission(true),
    participantState: 'on_stage',
  };
  const demoted = admission(false);

  await provider.initialize(publisher, async () => publisher);
  await provider.joinSession({ mode: 'backstage', audioEnabled: true, videoEnabled: true });
  await provider.reconcileAdmission(demoted);
  await provider.revokePublishPermission();

  await assert.rejects(
    provider.setVideoEnabled(true),
    /live_publish_not_authorized/,
  );
  assert.equal(fake.events.includes('leave'), false);
  assert.ok(fake.events.filter((event) => event === 'camera:disable').length >= 2);
});

test('Stream adapter reserves promotion and termination for backend authority', async () => {
  const fake = bindings();
  const provider = new StreamLiveMediaProvider(async () => fake.result);
  const scope = admission(true);
  await provider.initialize(scope, async () => scope);

  await assert.rejects(provider.requestPublishPermission(), /requires_server_authority/);
  await assert.rejects(provider.terminateCall(), /requires_server_authority/);
});
