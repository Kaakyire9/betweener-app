import { getCircleLocationAffinity } from '@/lib/location/location-intelligence';

export type CircleDiscoveryScope = 'near_me' | 'my_country' | 'diaspora' | 'global';

export type CircleLocaleProfile = {
  current_country_code?: string | null;
  currentCountryCode?: string | null;
  current_country?: string | null;
  currentCountry?: string | null;
  country_code?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  faith_tags?: string[] | null;
  interest_tags?: string[] | null;
  culture_tags?: string[] | null;
  religion?: string | null;
  interests?: string[] | null;
};

export type LocalizedCircle = {
  id: string;
  status?: string | null;
  visibility_scope?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  city?: string | null;
  region?: string | null;
  diaspora_tags?: string[] | null;
  culture_tags?: string[] | null;
  faith_tags?: string[] | null;
  interest_tags?: string[] | null;
  audience_tags?: string[] | null;
  is_official?: boolean | null;
  is_featured?: boolean | null;
  member_count?: number | null;
  active_this_week_count?: number | null;
  archived_at?: string | null;
};

const normalize = (value?: string | null) => String(value ?? '').trim().toLowerCase();
const normalizeCode = (value?: string | null) => String(value ?? '').trim().toUpperCase();

const arrayify = (values?: string[] | null) =>
  Array.isArray(values) ? values.map(normalize).filter(Boolean) : [];

const intersects = (left?: string[] | null, right?: string[] | null) => {
  const leftSet = new Set(arrayify(left));
  return arrayify(right).some((item) => leftSet.has(item));
};

export const getUserCircleLocale = (profile?: CircleLocaleProfile | null) => {
  const countryCode = normalizeCode(
    profile?.current_country_code ?? profile?.currentCountryCode ?? profile?.country_code,
  );
  const countryName = profile?.current_country ?? profile?.currentCountry ?? profile?.country ?? null;
  const city = profile?.city ?? null;
  const region = profile?.region ?? null;

  return {
    countryCode,
    countryName,
    city,
    region,
  };
};

export const buildCircleScopeFilter = (
  scope: CircleDiscoveryScope,
  profile?: CircleLocaleProfile | null,
) => {
  const locale = getUserCircleLocale(profile);

  if (scope === 'global') {
    return { scope, countryCode: null, city: null, diaspora: false };
  }

  if (scope === 'diaspora') {
    return { scope, countryCode: locale.countryCode || null, city: null, diaspora: true };
  }

  if (scope === 'near_me') {
    return { scope, countryCode: locale.countryCode || null, city: locale.city || null, diaspora: false };
  }

  return { scope, countryCode: locale.countryCode || null, city: null, diaspora: false };
};

export const scoreCircleRelevance = (
  circle: LocalizedCircle,
  profile?: CircleLocaleProfile | null,
  scope: CircleDiscoveryScope = 'my_country',
) => {
  const locale = getUserCircleLocale(profile);
  const circleCountry = normalizeCode(circle.country_code);
  const visibilityScope = normalize(circle.visibility_scope);

  if (circle.archived_at || circle.status === 'archived' || (circle.status && circle.status !== 'approved')) {
    return -1000;
  }

  let score = 0;

  if (circle.is_official) score += 25;
  if (circle.is_featured) score += 20;
  score += Math.min(18, Math.max(0, circle.active_this_week_count ?? 0));
  score += Math.min(12, Math.floor(Math.max(0, circle.member_count ?? 0) / 10));

  score += getCircleLocationAffinity(circle, profile, scope)?.strength ?? 0;

  if (scope === 'near_me') {
    if (visibilityScope === 'local') score += 15;
    if (circleCountry && locale.countryCode && circleCountry !== locale.countryCode) score -= 80;
  }

  if (scope === 'my_country') {
    if (visibilityScope === 'country') score += 12;
    if (circleCountry && locale.countryCode && circleCountry !== locale.countryCode) score -= 60;
  }

  if (scope === 'global') {
    if (visibilityScope === 'global') score += 20;
  } else if (visibilityScope === 'global') {
    score -= 8;
  }

  const userFaithTags = [...arrayify(profile?.faith_tags), normalize(profile?.religion)].filter(Boolean);
  const userInterestTags = [...arrayify(profile?.interest_tags), ...arrayify(profile?.interests)];
  const userCultureTags = arrayify(profile?.culture_tags);

  if (intersects(circle.faith_tags, userFaithTags)) score += 8;
  if (intersects(circle.interest_tags, userInterestTags)) score += 8;
  if (intersects(circle.culture_tags, userCultureTags)) score += 8;

  return score;
};

export const sortCirclesByRelevance = <T extends LocalizedCircle>(
  circles: T[],
  profile?: CircleLocaleProfile | null,
  scope: CircleDiscoveryScope = 'my_country',
) =>
  [...circles].sort((a, b) => {
    const scoreDelta = scoreCircleRelevance(b, profile, scope) - scoreCircleRelevance(a, profile, scope);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a.id).localeCompare(String(b.id));
  });
