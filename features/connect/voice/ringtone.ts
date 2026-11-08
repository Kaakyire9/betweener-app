import type { VoiceViewState } from './voice-types.ts';

export function connectRingtone(state: VoiceViewState): 'incoming' | 'outgoing' | null {
  return state.foreground && !state.busy && state.phase === 'RINGING' ? state.incoming ? 'incoming' : 'outgoing' : null;
}
