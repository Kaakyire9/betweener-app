import type { CircleDiscoveryScope } from '@/lib/circles/circle-localization';

type DiscoveryCircleAudience = {
  reach_scope?: string | null;
  reach_scopes?: string[] | null;
  visibility_scope?: string | null;
  access_policy?: string | null;
  visibility?: string | null;
  country_code?: string | null;
  city?: string | null;
  diaspora_origin_country_codes?: string[] | null;
  diaspora_destination_country_codes?: string[] | null;
};

type DiscoveryViewerLocation = {
  current_country_code?: string | null;
  origin_country_code?: string | null;
  city?: string | null;
};

const normalizeCode = (value?: string | null) => String(value ?? '').trim().toUpperCase();
const normalizePlace = (value?: string | null) => String(value ?? '').trim().toLowerCase();
const normalizeCodes = (values?: string[] | null) =>
  new Set((values ?? []).map(normalizeCode).filter(Boolean));

export const isCircleDiscoverableForViewer = (
  circle: DiscoveryCircleAudience,
  viewer: DiscoveryViewerLocation | null | undefined,
  scope: CircleDiscoveryScope,
) => {
  const legacyReach = String(circle.reach_scope ?? circle.visibility_scope ?? 'country').trim().toLowerCase();
  const reaches = new Set(
    (circle.reach_scopes?.length ? circle.reach_scopes : [legacyReach])
      .map((value) => String(value).trim().toLowerCase()),
  );
  const access = String(circle.access_policy ?? '').trim().toLowerCase();
  if (access === 'invite_only' || circle.visibility === 'private' || circle.visibility_scope === 'invite_only') {
    return false;
  }

  if (reaches.has('global')) return true;
  if (scope === 'global') return false;

  const currentCountry = normalizeCode(viewer?.current_country_code);
  const circleCountry = normalizeCode(circle.country_code);

  if (reaches.has('country') && scope !== 'diaspora'
    && currentCountry && circleCountry && currentCountry === circleCountry) {
    return true;
  }

  if (reaches.has('local')) {
    const currentCity = normalizePlace(viewer?.city);
    const circleCity = normalizePlace(circle.city);
    if (scope !== 'diaspora'
      && currentCountry && circleCountry && currentCountry === circleCountry
      && currentCity && circleCity && currentCity === circleCity) {
      return true;
    }
  }

  if (reaches.has('diaspora')) {
    if (scope !== 'diaspora') return false;
    const originCountry = normalizeCode(viewer?.origin_country_code);
    const origins = normalizeCodes(circle.diaspora_origin_country_codes);
    const destinations = normalizeCodes(circle.diaspora_destination_country_codes);
    if (!originCountry || !currentCountry || currentCountry === originCountry || !origins.has(originCountry)) return false;
    return destinations.size > 0
      ? destinations.has(currentCountry)
      : currentCountry !== originCountry;
  }

  if (legacyReach === 'country') {
    return scope !== 'diaspora' && Boolean(currentCountry && circleCountry && currentCountry === circleCountry);
  }

  return false;
};
