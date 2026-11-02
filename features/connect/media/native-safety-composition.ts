import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags.ts';
import { VoiceController } from '../voice/voice-controller.ts';
import type { VoiceApi, VoicePeer } from '../voice/voice-types.ts';
import { StreamVoiceTransport } from './stream-voice-transport.ts';
import { createConnectNativeOwnerFactory, type NativeOwnerDependencies } from './connect-native-owner.ts';

const cameraPermissions = () => {
  // Keep explicit camera actions independent of Metro split-bundle/HMR reloads.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./native-camera-permission') as typeof import('./native-camera-permission');
};

interface CompositionInput extends NativeOwnerDependencies {
  prepareCameraPermission?(): ReturnType<NativeOwnerDependencies['permission']>;
  failClosedAuthority?: boolean;
  api: VoiceApi; selfProfileId: string; deviceId: string;
  uuid(): string; peer(profileId: string): Promise<VoicePeer>;
}

/** Internal composition. The authenticated product host supplies its gated services. */
export function createConnectNativeSafetyComposition(input: CompositionInput) {
  const flags = input.flags ?? connectFeatureFlags;
  if (flags.nativeSafetyOwner !== true) throw new Error('connect_native_owner_disabled');
  const sourceAuth = input.auth.snapshot();
  const auth = sourceAuth ? { ...sourceAuth } : null;
  if (!auth?.authenticated || !auth.generation) throw new Error('connect_native_identity_invalid');
  let disposed = false;
  const current = () => !disposed && input.auth.snapshot()?.userId === auth.userId && input.auth.snapshot()?.generation === auth.generation;
  // Account changes may not retarget a queued command or refresh to a new account.
  const guardedApi = new Proxy(input.api, { get(api, key: keyof VoiceApi) {
    const method = api[key];
    if (typeof method !== 'function') return method;
    return async (...args: unknown[]) => {
      if (!current()) throw new Error('connect_native_owner_retired');
      const result = await Reflect.apply(method, api, args);
      if (!current()) throw new Error('connect_native_owner_retired');
      return result;
    };
  } });
  let controller: VoiceController;
  const retiredNavigation = new Set<string>();
  const factory = createConnectNativeOwnerFactory({ ...input, flags, onRetire(reason) {
    // Local End/Block already dispatched authority work; do not duplicate it.
    if (reason === 'account_changed') void controller.dispose();
    else if (reason !== 'local_end') void controller.interrupted(reason);
    input.onRetire?.(reason);
  } });
  const transport = new StreamVoiceTransport((admission, refresh, active = () => true) => factory.create(admission, refresh,
    () => current() && active() && !retiredNavigation.has(admission.call.cid)), { videoCalling: flags.videoCalling });
  controller = new VoiceController({ api: guardedApi, transport, flags, userId: auth.userId, failClosedAuthority: input.failClosedAuthority,
    selfProfileId: input.selfProfileId, deviceId: input.deviceId, permission: input.permission,
    uuid: input.uuid, now: input.now ?? Date.now, peer: input.peer, cameraPermission: input.prepareCameraPermission });
  const unsubscribe = input.auth.subscribe(() => {
    if (!current()) { disposed = true; factory.current()?.retire('account_changed'); void controller.dispose(); }
  });
  return { controller, transport, owner: factory.current,
    navigationCleanup(cid: string) {
      if (!/^betweener_connect:[0-9a-f-]{36}$/i.test(cid)) throw new Error('connect_native_identity_invalid');
      // CID binding also works before credentials/SDK load finish. A delayed
      // callback for an old screen cannot retire a different call's owner.
      return () => {
        retiredNavigation.add(cid);
        const owner = factory.current();
        if (owner?.getSnapshot().cid === cid) owner.retire('navigation');
        else if (controller.getSnapshot().session?.id === cid.slice('betweener_connect:'.length)) void controller.hangup();
      };
    },
    async dispose() {
      disposed = true; unsubscribe(); factory.current()?.retire('navigation'); await controller.dispose();
    },
  };
}

/** Lazy RN boundary; the product host must pass the reviewed staging runtime gate. */
export async function loadConnectNativeEnvironment(flags: ConnectFeatureFlags = connectFeatureFlags) {
  if (flags.nativeSafetyOwner !== true) throw new Error('connect_native_owner_disabled');
  // Import a local ES module: importing the RN CommonJS barrel dynamically makes
  // Metro evaluate every lazy export, including unavailable PushNotificationIOS.
  const { createConnectNativeLifecycle } = await import('./native-lifecycle');
  const lifecycle = createConnectNativeLifecycle();
  const { requestConnectMicrophonePermission } = await import('./native-microphone-permission');
  return { lifecycle, permission: requestConnectMicrophonePermission,
    cameraPermission: flags.videoCalling === true ? () => cameraPermissions().getConnectCameraPermission() : undefined,
    prepareCameraPermission: flags.videoCalling === true ? () => cameraPermissions().requestConnectCameraPermission() : undefined };
}
