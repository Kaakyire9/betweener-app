export const LIVE_AUDIENCE_TRANSPORTS = [
  'rtc_interactive',
  'hls_passive',
  'rtc_fallback',
] as const;

export type LiveAudienceTransport = (typeof LIVE_AUDIENCE_TRANSPORTS)[number];

export type LiveAudienceDelivery = {
  schemaVersion: 1;
  sessionId: string;
  transport: LiveAudienceTransport;
  interactive: boolean;
  hls: {
    playlistUrl: string;
    latencyClass: 'standard';
  } | null;
  engagementTransport: 'supabase_realtime';
  reasonCode: string;
};
export type LiveAudienceDeliveryInput = {
  sessionId: string;
  interactive: boolean;
  sessionLive: boolean;
  deliveryMode: 'rtc_only' | 'hybrid_hls';
  compositorLive: boolean;
  hlsLive: boolean;
  hlsPlaylistUrl: string | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODE = /^[a-z][a-z0-9_]{0,119}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};
const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  return /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value);
};
export const resolveLiveAudienceDelivery = (
  input: LiveAudienceDeliveryInput,
): LiveAudienceDelivery => {
  const hlsReady = input.sessionLive
    && input.deliveryMode === 'hybrid_hls'
    && input.compositorLive
    && input.hlsLive
    && isHttpsUrl(input.hlsPlaylistUrl);
  const transport: LiveAudienceTransport = input.interactive
    ? 'rtc_interactive'
    : hlsReady ? 'hls_passive' : 'rtc_fallback';

  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    transport,
    interactive: input.interactive,
    hls: transport === 'hls_passive' ? {
      playlistUrl: input.hlsPlaylistUrl as string,
      latencyClass: 'standard',
    } : null,
    engagementTransport: 'supabase_realtime',
    reasonCode: transport === 'rtc_interactive'
      ? 'live_interactive_rtc_required'
      : transport === 'hls_passive'
        ? 'live_passive_hls_ready'
        : 'live_hls_fallback_to_rtc',
  };
};

export const parseLiveAudienceDelivery = (value: unknown): LiveAudienceDelivery | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'sessionId', 'transport', 'interactive', 'hls',
    'engagementTransport', 'reasonCode',
  ])
    || value.schemaVersion !== 1
    || typeof value.sessionId !== 'string' || !UUID.test(value.sessionId)
    || !LIVE_AUDIENCE_TRANSPORTS.includes(value.transport as LiveAudienceTransport)
    || typeof value.interactive !== 'boolean'
    || value.engagementTransport !== 'supabase_realtime'
    || typeof value.reasonCode !== 'string' || !REASON_CODE.test(value.reasonCode)) return null;

  const hls = value.hls;
  if (value.transport === 'hls_passive') {
    if (!isRecord(hls) || !hasExactKeys(hls, ['playlistUrl', 'latencyClass'])
      || !isHttpsUrl(hls.playlistUrl) || hls.latencyClass !== 'standard'
      || value.interactive) return null;
  } else if (hls !== null) return null;

  if (value.transport === 'rtc_interactive' && !value.interactive) return null;
  if (value.transport !== 'rtc_interactive' && value.interactive) return null;
  return value as LiveAudienceDelivery;
};

export const LIVE_BROADCAST_ARTIFACT_METADATA_KEYS = [
  'programVersion',
  'scene',
  'canvas',
  'language',
  'translationLanguages',
  'aspectRatio',
  'width',
  'height',
  'codec',
  'container',
  'providerAssetId',
  'consentVersion',
  'startedAt',
  'endedAt',
] as const;

export type LiveBroadcastArtifactMetadata = Partial<{
  programVersion: number;
  scene: string;
  canvas: string;
  language: string;
  translationLanguages: readonly string[];
  aspectRatio: string;
  width: number;
  height: number;
  codec: string;
  container: string;
  providerAssetId: string;
  consentVersion: string;
  startedAt: string;
  endedAt: string;
}>;

const isSafeString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

export const parseLiveBroadcastArtifactMetadata = (
  value: unknown,
): LiveBroadcastArtifactMetadata | null => {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !LIVE_BROADCAST_ARTIFACT_METADATA_KEYS.includes(
    key as (typeof LIVE_BROADCAST_ARTIFACT_METADATA_KEYS)[number],
  ))) return null;

  for (const [key, field] of Object.entries(value)) {
    if (['programVersion', 'width', 'height'].includes(key)) {
      if (typeof field !== 'number' || !Number.isSafeInteger(field) || field < 1) return null;
    } else if (key === 'translationLanguages') {
      if (!Array.isArray(field) || field.length > 5
        || field.some((language) => !isSafeString(language))) return null;
    } else if (!isSafeString(field)) return null;
  }
  return value as LiveBroadcastArtifactMetadata;
};
