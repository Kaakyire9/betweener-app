import { getInstalledAppVersion } from '@/lib/app-version/app-version-service';

const isV1_2OrNewer = () => {
  const match = getInstalledAppVersion().version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 2);
};

/**
 * v1.2 only publishes byte types for which the server has a real inspection
 * pipeline. Existing media stays viewable/removable during the transition.
 */
export const getMediaModerationCapabilities = () => {
  const hardenedRuntime = isV1_2OrNewer();
  return {
    profileImages: true,
    profileVideoUploads: !hardenedRuntime,
    chatImages: true,
    chatVideoUploads: !hardenedRuntime,
    chatDocumentUploads: !hardenedRuntime,
    chatVoiceMessages: true,
  } as const;
};
