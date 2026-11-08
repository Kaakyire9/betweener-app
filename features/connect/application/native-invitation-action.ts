import type { NativeAuthOwner, NativeLifecycle } from '../media/native-owner-types.ts';
import type { VoiceController } from '../voice/voice-controller.ts';
import type { VoiceApi } from '../voice/voice-types.ts';
import { readConnectPushData } from '../../../supabase/functions/_shared/connect-push-contract.ts';
import { terminalStates } from '../domain/connect.ts';

/** Future CallKit/Telecom callback boundary. No native push registration is
 * installed here. A push never calls this: only an explicit native UI action may. */
export async function nativeInvitationAction(input: {
  enabled: boolean; action: 'answer' | 'decline'; envelope: unknown;
  auth: NativeAuthOwner; lifecycle: NativeLifecycle; selfProfileId: string; deviceId: string;
  api: VoiceApi; controller: VoiceController; now(): number;
}): Promise<'disabled' | 'unavailable' | 'requires_foreground' | 'answer_requested' | 'declined'> {
  if (!input.enabled) return 'disabled';
  if (!['answer', 'decline'].includes(input.action)) return 'unavailable';
  const expected = input.auth.snapshot(), push = readConnectPushData(input.envelope);
  const current = () => !!expected && input.auth.snapshot()?.userId === expected.userId && input.auth.snapshot()?.generation === expected.generation;
  if (!expected || !push || push.type !== 'connect_voice_incoming' || push.recipient_user_id !== expected.userId) return 'unavailable';
  // Existing binaries cannot safely admit from a locked/background UI. A future
  // native bridge must foreground/unlock, then redeliver the explicit action.
  if (input.lifecycle.appState() !== 'active') return 'requires_foreground';
  try {
    const call = await input.api.getCall(push.call_id);
    if (!current() || input.lifecycle.appState() !== 'active') return 'unavailable';
    if (call.id !== push.call_id || call.media !== 'voice' || call.recipient_profile_id !== input.selfProfileId
      || Date.parse(call.created_at) !== Date.parse(push.call_generation) || call.version < push.call_version
      || call.state !== 'RINGING' || call.ended_at || (call.deadline && (!Number.isFinite(Date.parse(call.deadline)) || Date.parse(call.deadline) <= input.now()))) return 'unavailable';
    const active = input.controller.getSnapshot().session;
    if (active && !terminalStates.includes(active.state) && active.id !== call.id) return 'unavailable';
    if (input.action === 'decline') {
      await input.api.act(call.id, 'decline', call.version, input.deviceId);
      return current() ? 'declined' : 'unavailable';
    }
    await input.controller.openCall(call.id);
    const view = input.controller.getSnapshot();
    if (!current() || input.lifecycle.appState() !== 'active' || !view.incoming || view.phase !== 'RINGING'
      || view.session?.id !== call.id || view.session.created_at !== call.created_at) return 'unavailable';
    await input.controller.accept();
    return current() ? 'answer_requested' : 'unavailable';
  } catch { return 'unavailable'; }
}
