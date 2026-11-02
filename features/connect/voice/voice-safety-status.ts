import type { VoiceViewState } from './voice-types.ts';
import { isLocalShutdownVerified } from '../media/local-shutdown.ts';

/** Presentation of independent facts. A backend/provider ACK never certifies media. */
export function voiceSafetyStatus(state: VoiceViewState): string[] {
  if (!state.endBlock && !['ENDING', 'ENDED', 'FAILED'].includes(state.phase)) return [];
  const local = state.localShutdown;
  const facts = [local.microphone, local.camera, local.publication, local.playback, local.subscriptions];
  const lines = [isLocalShutdownVerified(local) ? 'Local media shutdown verified.'
    : facts.includes('failed') || local.sdkLeave === 'failed' || local.resourceRelease === 'failed' ? 'Local media shutdown failed or is incomplete.'
      : facts.includes('pending') || local.sdkLeave === 'pending' || local.resourceRelease === 'pending' ? 'Stopping local media…'
        : 'Local media shutdown has not been independently verified.'];
  const block = state.endBlock;
  if (block) {
    lines.push(block.block === 'saved' ? 'Account block saved.' : block.block === 'no_longer_saved' ? 'Account block is no longer saved.' : 'Account block has not been confirmed.');
    lines.push(block.call === 'terminal' ? 'Betweener call ended.' : 'Betweener call termination pending.');
    lines.push(block.provider === 'acknowledged' ? 'Provider end request acknowledged.' : block.provider === 'unconfirmed' ? 'Provider end request unconfirmed.' : 'Provider termination pending.');
    if (block.error) lines.push(block.error);
  } else if (state.endStatus) {
    lines.push(state.endStatus === 'terminal' ? 'Betweener call ended.' : state.endStatus === 'unconfirmed' ? 'Betweener call termination unconfirmed.' : 'Betweener call termination pending.');
    lines.push('Provider shutdown confirmation is unavailable.');
  }
  lines.push('Remote media shutdown has not been verified.');
  return lines;
}
