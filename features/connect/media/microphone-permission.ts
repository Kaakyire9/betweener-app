import type { MicrophonePermission } from '../voice/voice-types.ts';
interface PermissionResponse { granted: boolean; canAskAgain: boolean }
export interface MicrophonePermissionPort {
  get(): Promise<PermissionResponse>; request(): Promise<PermissionResponse>;
}
/** Called only after Start/Accept. Never touches camera or recording sessions. */
export async function resolveMicrophonePermission(port: MicrophonePermissionPort): Promise<MicrophonePermission> {
  try {
    const current = await port.get();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'blocked';
    const result = await port.request();
    return result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked';
  } catch { return 'denied'; }
}
