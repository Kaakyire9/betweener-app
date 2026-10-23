import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

export type LivePictureInPictureAction = 'toggle_camera' | 'toggle_microphone';

type LivePictureInPictureActionState = {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
};

type AndroidLivePictureInPictureModule = {
  addListener(eventName: string): void;
  clearActions(): void;
  removeListeners(count: number): void;
  setActions(microphoneEnabled: boolean, cameraEnabled: boolean): void;
};

const EVENT_NAME = 'BetweenerLivePictureInPictureAction';

const nativeModule = Platform.OS === 'android'
  ? NativeModules.BetweenerLivePictureInPicture as AndroidLivePictureInPictureModule | undefined
  : undefined;

const eventEmitter = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : null;

let activeActionOwner: string | null = null;
let activeActionState: string | null = null;

export const setAndroidLivePictureInPictureActions = (ownerId: string, {
  cameraEnabled,
  microphoneEnabled,
}: LivePictureInPictureActionState): void => {
  const owner = ownerId.trim();
  if (!owner) return;
  const nextState = `${microphoneEnabled ? 'mic-on' : 'mic-off'}:${cameraEnabled ? 'camera-on' : 'camera-off'}`;
  if (activeActionOwner === owner && activeActionState === nextState) return;
  activeActionOwner = owner;
  activeActionState = nextState;
  nativeModule?.setActions(microphoneEnabled, cameraEnabled);
};

export const clearAndroidLivePictureInPictureActions = (ownerId: string): void => {
  const owner = ownerId.trim();
  if (!owner || activeActionOwner !== owner) return;
  activeActionOwner = null;
  activeActionState = null;
  nativeModule?.clearActions();
};

export const subscribeToAndroidLivePictureInPictureActions = (
  listener: (action: LivePictureInPictureAction) => void,
): (() => void) => {
  if (!eventEmitter) return () => undefined;
  const subscription: EmitterSubscription = eventEmitter.addListener(
    EVENT_NAME,
    (action: unknown) => {
      if (action === 'toggle_camera' || action === 'toggle_microphone') listener(action);
    },
  );
  return () => subscription.remove();
};
