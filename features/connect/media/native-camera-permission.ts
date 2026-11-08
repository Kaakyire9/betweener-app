import { getCameraPermissionsAsync, requestCameraPermissionsAsync } from 'expo-image-picker';
import { resolveCapturePermission } from './capture-permission';

/** Only the explicit in-call camera action requests permission. No capture is started here. */
export const requestConnectCameraPermission = () => resolveCapturePermission({
  get: getCameraPermissionsAsync, request: requestCameraPermissionsAsync,
});
/** In-call checks never open a system prompt (which can background/blur the owner). */
export async function getConnectCameraPermission() {
  try {
    const value = await getCameraPermissionsAsync();
    return value.granted ? 'granted' as const : value.canAskAgain ? 'denied' as const : 'blocked' as const;
  } catch { return 'denied' as const; }
}
