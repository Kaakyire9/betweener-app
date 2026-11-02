export type StreamVideoSdkModule = typeof import('@stream-io/video-react-native-sdk');

let streamVideoSdkPromise: Promise<StreamVideoSdkModule> | null = null;

/**
 * The app entry already requires this SDK for native push setup. Reuse Metro's
 * module cache: import() still fetches/registers a split bundle on native and
 * Expo reloads the app if that registration finds a disconnected HMR client.
 * Defer evaluation and preserve the shared, retryable promise for both callers.
 */
export const loadStreamVideoSdk = (): Promise<StreamVideoSdkModule> => {
  if (streamVideoSdkPromise) return streamVideoSdkPromise;

  streamVideoSdkPromise = Promise.resolve().then(() => {
    // A literal require keeps this dependency in the owning bundle, while the
    // callback prevents SDK evaluation before the caller's admission checks.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@stream-io/video-react-native-sdk') as StreamVideoSdkModule;
  })
    .catch((error: unknown) => {
      // A failed native-module lookup must be retryable without requiring
      // a process reload.
      streamVideoSdkPromise = null;
      throw error;
    });

  return streamVideoSdkPromise;
};
