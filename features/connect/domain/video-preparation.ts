export interface VideoPreparationState {
  consent: 'not_requested' | 'pending' | 'approved' | 'revoked';
  cameraPermission: 'not_requested' | 'granted' | 'denied';
  camera: 'off' | 'preview' | 'failed';
  facing: 'front' | 'back';
  microphoneMuted: boolean;
}
/** UI preparation only. Approval alone cannot enable transport or reuse voice authority. */
export function videoPreparationStatus(state: VideoPreparationState) {
  return { transportEnabled: false as const, publicationEnabled: false as const,
    previewAllowed: state.consent === 'approved' && state.cameraPermission === 'granted' && state.camera === 'preview',
    message: state.consent === 'revoked' ? 'Video permission was withdrawn.' : state.cameraPermission === 'denied' ? 'Camera access is off in Settings.'
      : state.camera === 'failed' ? 'Your camera could not start.' : 'Video calls require a separate invitation and your approval.' };
}
