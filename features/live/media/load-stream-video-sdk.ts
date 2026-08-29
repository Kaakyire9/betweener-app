export type StreamVideoSdkModule = typeof import('@stream-io/video-react-native-sdk');

let streamVideoSdkPromise: Promise<StreamVideoSdkModule> | null = null;

/**
 * The React Native Stream entrypoint installs WebRTC globals as a module side
 * effect. Keep that bootstrap behind one memoized boundary so Android never
 * evaluates competing async copies while the Live route is mounting.
 */
export const loadStreamVideoSdk = (): Promise<StreamVideoSdkModule> => {
  if (streamVideoSdkPromise) return streamVideoSdkPromise;

  streamVideoSdkPromise = import('@stream-io/video-react-native-sdk')
    .catch((error: unknown) => {
      // A failed chunk/native-module lookup must be retryable without requiring
      // a process reload.
      streamVideoSdkPromise = null;
      throw error;
    });

  return streamVideoSdkPromise;
};
