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

export const setAndroidLivePictureInPictureActions = ({
  cameraEnabled,
  microphoneEnabled,
}: LivePictureInPictureActionState): void => {
  nativeModule?.setActions(microphoneEnabled, cameraEnabled);
};

export const clearAndroidLivePictureInPictureActions = (): void => {
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
