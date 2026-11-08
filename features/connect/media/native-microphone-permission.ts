import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { resolveMicrophonePermission } from './microphone-permission';
export const checkConnectMicrophonePermission = async () => {
  const status = await getRecordingPermissionsAsync();
  return status.granted ? 'granted' as const : status.canAskAgain ? 'denied' as const : 'blocked' as const;
};

export const requestConnectMicrophonePermission = () => resolveMicrophonePermission({
  get: getRecordingPermissionsAsync, request: requestRecordingPermissionsAsync,
});
