export const LIVE_STAGE_ATMOSPHERE_PRESETS = [
  'brand_teal',
  'deep_ocean',
  'aurora',
  'oat_noir',
  'live_poster',
] as const;

export type LiveStageAtmospherePreset = (typeof LIVE_STAGE_ATMOSPHERE_PRESETS)[number];

export type LiveStageAtmosphere = {
  schemaVersion: 1;
  sessionId: string;
  preset: LiveStageAtmospherePreset;
  posterPath: string | null;
  hasPoster: boolean;
  version: number;
  updatedAt: string | null;
};

export type LiveStageChromeAccent = {
  color: string;
  borderColor: string;
  softColor: string;
};

const CHROME_ACCENTS: Readonly<Record<LiveStageAtmospherePreset, LiveStageChromeAccent>> = {
  brand_teal: { color: '#55D1C6', borderColor: '#55D1C66B', softColor: '#22AFA224' },
  deep_ocean: { color: '#6FC9D5', borderColor: '#6FC9D568', softColor: '#267A8B24' },
  aurora: { color: '#C7B6E5', borderColor: '#C7B6E56B', softColor: '#9276C326' },
  oat_noir: { color: '#E0D09D', borderColor: '#E0D09D63', softColor: '#B7A36D24' },
  live_poster: { color: '#CEBDE8', borderColor: '#CEBDE86B', softColor: '#9C7FC329' },
};

export const resolveLiveStageChromeAccent = (
  preset: LiveStageAtmospherePreset | null | undefined,
): LiveStageChromeAccent => CHROME_ACCENTS[preset ?? 'brand_teal'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATMOSPHERE_KEYS = [
  'schemaVersion', 'sessionId', 'preset', 'posterPath', 'hasPoster', 'version', 'updatedAt',
] as const;

export const parseLiveStageAtmosphere = (value: unknown): LiveStageAtmosphere | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== ATMOSPHERE_KEYS.length
    || ATMOSPHERE_KEYS.some((key) => !Object.hasOwn(candidate, key))
    || candidate.schemaVersion !== 1
    || typeof candidate.sessionId !== 'string' || !UUID.test(candidate.sessionId)
    || typeof candidate.preset !== 'string'
    || !LIVE_STAGE_ATMOSPHERE_PRESETS.includes(candidate.preset as LiveStageAtmospherePreset)
    || !(candidate.posterPath === null || typeof candidate.posterPath === 'string')
    || typeof candidate.hasPoster !== 'boolean'
    || typeof candidate.version !== 'number' || !Number.isSafeInteger(candidate.version)
    || candidate.version < 0
    || !(candidate.updatedAt === null || typeof candidate.updatedAt === 'string')) return null;
  return candidate as LiveStageAtmosphere;
};
