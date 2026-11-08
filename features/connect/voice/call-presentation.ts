import type { VoiceViewState } from './voice-types.ts';

export function voiceCompletionMessage(state: VoiceViewState): string | null {
  if (!['ENDED', 'FAILED'].includes(state.phase)) return null;
  const call = state.session;
  if (call?.reason === 'blocked') return 'This connection is no longer available.';
  if (call?.reason?.includes('revok') || call?.reason?.includes('consent')) return 'Calling permission changed. This call has ended.';
  if (call?.state === 'MISSED' || call?.reason === 'ring_timeout') return state.incoming ? `You missed this ${call?.media === 'video' ? 'video' : 'voice'} call.` : 'There was no answer.';
  if (call?.state === 'DECLINED') return 'The invitation was declined.';
  if (call?.state === 'CANCELLED') return 'The call invitation was cancelled.';
  if (call?.state === 'BUSY') return 'They were unavailable for this call.';
  return null;
}
