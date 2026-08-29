import type {
  LiveMediaAdmission,
  LiveMediaSessionOptions,
  LiveMediaTransportState,
} from './live-media-provider.ts';

export const LIVE_MEDIA_FAILED_RECOVERY_GRACE_MS = 1_800;
export const LIVE_MEDIA_RECONNECT_GRACE_MS = 4_500;
export const LIVE_MEDIA_FOREGROUND_REFRESH_AFTER_MS = 45_000;
export const LIVE_MEDIA_TOKEN_REFRESH_SAFETY_MS = 90_000;

const TERMINAL_ADMISSION_ERRORS = new Set([
  'live_admission_denied',
  'live_private_spark_admission_denied',
  'live_private_spark_admission_forbidden',
  'live_private_spark_consent_incomplete',
  'live_private_spark_account_ineligible',
  'live_private_spark_blocked',
  'live_private_spark_admission_contract_invalid',
]);

export const liveAdmissionErrorCode = (error: unknown): string => (
  error instanceof Error ? error.message : String(error ?? '')
).trim().toLowerCase();

export const isTerminalLiveAdmissionError = (error: unknown): boolean => (
  TERMINAL_ADMISSION_ERRORS.has(liveAdmissionErrorCode(error))
);

export const shouldRecoverLiveMediaTransport = (
  transportState: LiveMediaTransportState,
  shouldMaintainConnection: boolean,
): boolean => shouldMaintainConnection && transportState === 'failed';

export const foregroundRecoveryDelayMs = (
  transportState: LiveMediaTransportState,
  shouldMaintainConnection: boolean,
): number | null => {
  if (!shouldMaintainConnection || transportState === 'connected') return null;
  if (transportState === 'connecting' || transportState === 'reconnecting') {
    return LIVE_MEDIA_RECONNECT_GRACE_MS;
  }
  return LIVE_MEDIA_FAILED_RECOVERY_GRACE_MS;
};

export const shouldRefreshLiveAdmissionOnForeground = ({
  backgroundedAtMs,
  expiresAt,
  nowMs,
  shouldMaintainConnection,
}: {
  backgroundedAtMs: number | null;
  expiresAt: string | null;
  nowMs: number;
  shouldMaintainConnection: boolean;
}): boolean => {
  if (!shouldMaintainConnection || backgroundedAtMs === null) return false;
  if (nowMs - backgroundedAtMs >= LIVE_MEDIA_FOREGROUND_REFRESH_AFTER_MS) return true;
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= nowMs + LIVE_MEDIA_TOKEN_REFRESH_SAFETY_MS;
};

export const recoveryJoinOptions = (
  admission: LiveMediaAdmission,
  desired: Pick<LiveMediaSessionOptions, 'audioEnabled' | 'videoEnabled'>,
): LiveMediaSessionOptions => {
  const canPublish = admission.capabilities.includes('live.publish');
  if (admission.participantState === 'private_spark') {
    return {
      mode: 'private_spark',
      audioEnabled: canPublish && desired.audioEnabled,
      videoEnabled: canPublish && desired.videoEnabled,
    };
  }
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
