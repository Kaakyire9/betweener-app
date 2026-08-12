import type {
  LiveConnectionQuality,
  LiveMediaAdmission,
  LiveMediaProvider,
  LiveMediaProviderState,
  LiveMediaSessionOptions,
  LiveMediaTokenProvider,
} from './live-media-provider.ts';

type StreamDevicePort = {
  enable(): Promise<void>;
  disable(forceStop?: boolean): Promise<void>;
};

type StreamCallPort = {
  camera: StreamDevicePort;
  microphone: StreamDevicePort;
  state: {
    localParticipant?: { connectionQuality?: number };
  };
  join(options: { create: false }): Promise<void>;
  leave(): Promise<void>;
};

type StreamClientPort = {
  call(type: string, id: string): StreamCallPort;
  disconnectUser(): Promise<void>;
};

export type StreamLiveMediaBindings = {
  client: StreamClientPort;
  call: StreamCallPort;
};

export type StreamLiveMediaBindingsFactory = (input: {
  admission: LiveMediaAdmission;
  tokenProvider: () => Promise<string>;
}) => Promise<StreamLiveMediaBindings>;

export class StreamLiveMediaProviderError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'StreamLiveMediaProviderError';
  }
}

const assertRefreshedAdmission = (
  initial: LiveMediaAdmission,
  refreshed: LiveMediaAdmission,
): void => {
  if (
    initial.sessionId !== refreshed.sessionId
    || initial.user.id !== refreshed.user.id
    || initial.call.cid !== refreshed.call.cid
    || initial.apiKey !== refreshed.apiKey
  ) {
    throw new StreamLiveMediaProviderError('live_media_refresh_identity_mismatch');
  }
};

const createStreamBindings: StreamLiveMediaBindingsFactory = async ({
  admission,
  tokenProvider,
}) => {
  const { StreamVideoClient } = await import('@stream-io/video-react-native-sdk');
  const client = new StreamVideoClient({
    apiKey: admission.apiKey,
    user: { id: admission.user.id },
    token: admission.token,
    tokenProvider,
  });
  const call = client.call(admission.call.type, admission.call.id);
  return { client, call };
};

const qualityFromStream = (
  quality: number | undefined,
  _state: LiveMediaProviderState,
): LiveConnectionQuality => {
  if (quality === 3) return 'excellent';
  if (quality === 2) return 'good';
  if (quality === 1) return 'poor';
  return 'unknown';
};

const sameAdmission = (
  current: LiveMediaAdmission,
  incoming: LiveMediaAdmission,
): boolean => current.sessionId === incoming.sessionId
  && current.user.id === incoming.user.id
  && current.call.cid === incoming.call.cid
  && current.token === incoming.token
  && current.expiresAt === incoming.expiresAt
  && current.participantState === incoming.participantState
  && current.sessionStatus === incoming.sessionStatus
  && current.capabilities.length === incoming.capabilities.length
  && current.capabilities.every((capability) => incoming.capabilities.includes(capability));

/**
 * Stream transport adapter. It intentionally cannot promote publishers or end
 * calls: those actions require a fresh, backend-authorized Betweener command.
 */
export class StreamLiveMediaProvider implements LiveMediaProvider {
  private currentState: LiveMediaProviderState = 'idle';
  private admission: LiveMediaAdmission | null = null;
  private bindings: StreamLiveMediaBindings | null = null;
  private operation: Promise<void> = Promise.resolve();
  private readonly createBindings: StreamLiveMediaBindingsFactory;

  constructor(createBindings: StreamLiveMediaBindingsFactory = createStreamBindings) {
    this.createBindings = createBindings;
  }

  get state(): LiveMediaProviderState {
    return this.currentState;
  }

  initialize(
    admission: LiveMediaAdmission,
    tokenProvider: LiveMediaTokenProvider,
  ): Promise<void> {
    return this.runExclusive(async () => {
      this.assertNotDisposed();
      if (
        this.bindings
        && this.admission
        && sameAdmission(this.admission, admission)
        && ['ready', 'joined'].includes(this.currentState)
      ) {
        return;
      }
      if (this.bindings) await this.releaseBindings();

      this.currentState = 'initializing';
      this.admission = admission;
      try {
        this.bindings = await this.createBindings({
          admission,
          tokenProvider: async () => {
            const refreshed = await tokenProvider();
            assertRefreshedAdmission(admission, refreshed);
            return refreshed.token;
          },
        });
        this.currentState = 'ready';
      } catch (error) {
        this.bindings = null;
        this.currentState = 'failed';
        throw error;
      }
    });
  }

  joinSession(options: LiveMediaSessionOptions): Promise<void> {
    return this.runExclusive(async () => {
      this.assertNotDisposed();
      if (this.currentState === 'joined') return;
      if (this.currentState !== 'ready' || !this.bindings || !this.admission) {
        throw new StreamLiveMediaProviderError('live_media_not_ready');
      }
      this.validateJoinOptions(options, this.admission);
      this.currentState = 'joining';
      try {
        await Promise.all([
          this.bindings.call.microphone.disable(true),
          this.bindings.call.camera.disable(true),
        ]);
        await this.bindings.call.join({ create: false });
        await Promise.all([
          this.setDeviceEnabled(this.bindings.call.microphone, options.audioEnabled),
          this.setDeviceEnabled(this.bindings.call.camera, options.videoEnabled),
        ]);
        this.currentState = 'joined';
      } catch (error) {
        await this.bindings.call.leave().catch(() => undefined);
        this.currentState = 'failed';
        throw error;
      }
    });
  }

  leaveSession(): Promise<void> {
    return this.runExclusive(async () => {
      if (['disposed', 'idle', 'ready'].includes(this.currentState)) return;
      if (!this.bindings) {
        this.currentState = 'idle';
        return;
      }
      this.currentState = 'leaving';
      try {
        await Promise.all([
          this.bindings.call.microphone.disable(true),
          this.bindings.call.camera.disable(true),
        ]);
        await this.bindings.call.leave();
        this.currentState = 'ready';
      } catch (error) {
        this.currentState = 'failed';
        throw error;
      }
    });
  }

  setAudioEnabled(enabled: boolean): Promise<void> {
    return this.runExclusive(async () => {
      const { call } = this.requireJoined();
      this.assertCanPublish(enabled);
      await this.setDeviceEnabled(call.microphone, enabled);
    });
  }

  setVideoEnabled(enabled: boolean): Promise<void> {
    return this.runExclusive(async () => {
      const { call } = this.requireJoined();
      this.assertCanPublish(enabled);
      await this.setDeviceEnabled(call.camera, enabled);
    });
  }

  requestPublishPermission(): Promise<void> {
    return Promise.reject(
      new StreamLiveMediaProviderError('live_publish_permission_requires_server_authority'),
    );
  }

  revokePublishPermission(): Promise<void> {
    return this.runExclusive(async () => {
      const { call } = this.requireJoined();
      await Promise.all([
        call.microphone.disable(true),
        call.camera.disable(true),
      ]);
    });
  }

  terminateCall(): Promise<void> {
    return Promise.reject(
      new StreamLiveMediaProviderError('live_termination_requires_server_authority'),
    );
  }

  getConnectionQuality(): LiveConnectionQuality {
    return qualityFromStream(
      this.bindings?.call.state.localParticipant?.connectionQuality,
      this.currentState,
    );
  }

  dispose(): Promise<void> {
    return this.runExclusive(async () => {
      if (this.currentState === 'disposed') return;
      await this.releaseBindings();
      this.admission = null;
      this.currentState = 'disposed';
    });
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.catch(() => undefined).then(operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertNotDisposed(): void {
    if (this.currentState === 'disposed') {
      throw new StreamLiveMediaProviderError('live_media_provider_disposed');
    }
  }

  private assertCanPublish(enabling: boolean): void {
    if (enabling && !this.admission?.capabilities.includes('live.publish')) {
      throw new StreamLiveMediaProviderError('live_publish_not_authorized');
    }
  }

  private requireJoined(): StreamLiveMediaBindings {
    this.assertNotDisposed();
    if (this.currentState !== 'joined' || !this.bindings) {
      throw new StreamLiveMediaProviderError('live_media_not_joined');
    }
    return this.bindings;
  }

  private validateJoinOptions(
    options: LiveMediaSessionOptions,
    admission: LiveMediaAdmission,
  ): void {
    const wantsToPublish = options.audioEnabled || options.videoEnabled;
    if (wantsToPublish && !admission.capabilities.includes('live.publish')) {
      throw new StreamLiveMediaProviderError('live_publish_not_authorized');
    }
    if (options.mode === 'audience' && admission.participantState !== 'audience') {
      throw new StreamLiveMediaProviderError('live_audience_state_invalid');
    }
    if (
      options.mode === 'backstage'
      && !['backstage', 'on_stage'].includes(admission.participantState)
    ) {
      throw new StreamLiveMediaProviderError('live_backstage_state_invalid');
    }
  }

  private async setDeviceEnabled(device: StreamDevicePort, enabled: boolean): Promise<void> {
    if (enabled) await device.enable();
    else await device.disable(true);
  }

  private async releaseBindings(): Promise<void> {
    const bindings = this.bindings;
    this.bindings = null;
    if (!bindings) return;
    await Promise.allSettled([
      bindings.call.microphone.disable(true),
      bindings.call.camera.disable(true),
      bindings.call.leave(),
    ]);
    await bindings.client.disconnectUser().catch(() => undefined);
  }
}
