import type { MicrophonePermission } from '../voice/voice-types.ts';
interface PermissionResponse { granted: boolean; canAskAgain: boolean }
export interface CapturePermissionPort { get(): Promise<PermissionResponse>; request(): Promise<PermissionResponse> }
export async function resolveCapturePermission(port: CapturePermissionPort): Promise<MicrophonePermission> {
  try {
    const current = await port.get();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'blocked';
    const result = await port.request();
    return result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked';
  } catch { return 'denied'; }
}
