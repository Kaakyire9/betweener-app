export type ChatVoiceRecordingMetadata = {
  extension: string;
  contentType: string;
};
const VOICE_RECORDING_TYPES: Record<string, string> = {
  aac: 'audio/aac',
  caf: 'audio/x-caf',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  '3gp': 'audio/3gpp',
};

const getUriExtension = (uri: string) => {
  const path = uri.split(/[?#]/, 1)[0];
  const candidate = path.split('.').pop()?.trim().toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(candidate) ? candidate : '';
};

/**
 * Expo Audio's high-quality native recorder emits MPEG-4 AAC. Keep the
 * fallback explicit so an extensionless cache URI is never queued as
 * application/octet-stream and rejected by the audio finalizer.
 */
export const resolveChatVoiceRecordingMetadata = (
  uri: string,
): ChatVoiceRecordingMetadata => {
  const detectedExtension = getUriExtension(uri);
  const extension = VOICE_RECORDING_TYPES[detectedExtension]
    ? detectedExtension
    : 'm4a';

  return {
    extension,
    contentType: VOICE_RECORDING_TYPES[extension],
  };
};
