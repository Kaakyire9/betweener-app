import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { resolveMicrophonePermission } from './microphone-permission';

export const requestConnectMicrophonePermission = () => resolveMicrophonePermission({
  get: getRecordingPermissionsAsync, request: requestRecordingPermissionsAsync,
});
