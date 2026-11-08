import type { ReactNode } from 'react';

export interface VideoControlState {
  cameraWanted?: boolean;
  preview?: 'off' | 'starting' | 'ready' | 'failed';
  quality?: 'standard' | 'data_saver';
  qualityChanging?: boolean;
  camera: 'off' | 'starting' | 'on' | 'stopping' | 'failed';
  facing: 'front' | 'back' | 'unknown';
  error: string | null;
  renderFailed?: boolean;
  permission?: 'granted' | 'denied' | 'blocked';
}
export interface VideoParticipant { sessionId: string; local: boolean; cameraOn: boolean }
export type VideoFit = 'cover' | 'contain';
/** Call-owned render capability. No clients, tokens or raw SDK state enter UI snapshots. */
export interface VideoPresentation {
  participants(): readonly VideoParticipant[];
  subscribe(listener: () => void): () => void;
  render(sessionId: string, local: boolean, options?: { fit: VideoFit }): ReactNode;
}
export const cameraOff = (): VideoControlState => ({ camera: 'off', facing: 'front', error: null });
