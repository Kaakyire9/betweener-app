import type {
  LiveMediaAdmission,
  LiveMediaSessionOptions,
  LiveMediaTransportState,
} from './live-media-provider.ts';

export const shouldRecoverLiveMediaTransport = (
  transportState: LiveMediaTransportState,
  shouldMaintainConnection: boolean,
): boolean => shouldMaintainConnection && transportState === 'failed';

export const recoveryJoinOptions = (
  admission: LiveMediaAdmission,
  desired: Pick<LiveMediaSessionOptions, 'audioEnabled' | 'videoEnabled'>,
): LiveMediaSessionOptions => {
  const canPublish = admission.capabilities.includes('live.publish');
  const canUseBackstage = canPublish && (
    ['backstage', 'on_stage'].includes(admission.participantState)
    || admission.primaryRole === 'host'
  );
  return {
    mode: canUseBackstage ? 'backstage' : 'audience',
    audioEnabled: canPublish && desired.audioEnabled,
    videoEnabled: canPublish && desired.videoEnabled,
  };
};
