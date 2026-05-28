import { findCountryByCode, findCountryByLabel, getCountryCodeByName } from '@/lib/location/countries';

export const BROAD_REGION_LABELS = new Set([
  'africa',
  'north america',
  'south america',
  'europe',
  'asia',
  'oceania',
  'middle east',
]);

export const GHANA_REGION_LABELS = new Set([
  'ahafo',
  'ashanti',
  'bono',
  'bono east',
  'central',
  'eastern',
  'greater accra',
  'north east',
  'northern',
  'oti',
  'savannah',
  'upper east',
  'upper west',
  'volta',
  'western',
  'western north',
]);

export const normalizeLocationValue = (value?: string | null) => String(value || '').trim();

export const getFirstLocationPart = (value?: string | null) =>
  normalizeLocationValue(value).split(',')[0]?.trim() || '';

export const isBroadRegionLabel = (value?: string | null) =>
  BROAD_REGION_LABELS.has(getFirstLocationPart(value).toLowerCase());

export const ADMINISTRATIVE_LOCATION_PATTERN =
  /\b(region|district|province|state|county|municipality|metropolitan)\b/i;

export const isAdministrativeLocationLabel = (value?: string | null) =>
  ADMINISTRATIVE_LOCATION_PATTERN.test(getFirstLocationPart(value));

export const isKnownGhanaRegionLabel = (value?: string | null) =>
  GHANA_REGION_LABELS.has(getFirstLocationPart(value).toLowerCase());

export const toFlagEmoji = (code?: string | null) => {
  if (!code) return '';
  const normalized = String(code).trim().toUpperCase();
  if (normalized.length !== 2) return '';
  const first = normalized.charCodeAt(0);
  const second = normalized.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return '';
  return String.fromCodePoint(0x1f1e6 + (first - 65), 0x1f1e6 + (second - 65));
};

export const pickBetterLocationValue = (
  incoming?: string | null,
  previous?: string | null,
  opts?: { preferShorter?: boolean; avoidAdministrative?: boolean },
) => {
  const next = normalizeLocationValue(incoming);
  const prev = normalizeLocationValue(previous);
  if (!next) return prev;
  if (!prev) return next;
  const nextLower = next.toLowerCase();
  const prevLower = prev.toLowerCase();
  if (nextLower === prevLower) return next;
  if (opts?.avoidAdministrative) {
    const nextAdministrative = isAdministrativeLocationLabel(next);
    const prevAdministrative = isAdministrativeLocationLabel(prev);
    if (nextAdministrative && !prevAdministrative) return prev;
    if (prevAdministrative && !nextAdministrative) return next;
  }
  if (opts?.preferShorter) {
    if (nextLower.includes(prevLower) && prev.length <= next.length) return prev;
    if (prevLower.includes(nextLower) && next.length <= prev.length) return next;
  }
  return next;
};

const normalizeComparable = (value?: string | null) =>
  getFirstLocationPart(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sameLocationLabel = (a?: string | null, b?: string | null) => {
  const left = normalizeComparable(a);
  const right = normalizeComparable(b);
  return !!left && !!right && left === right;
};

const isDistanceLabel = (label?: string | null) => {
  const lower = String(label || '').toLowerCase();
  return lower.includes('away') || /\b(km|mi|mile|miles)\b/.test(lower) || /<\s*1/.test(lower);
};

const getCountry = (source: Record<string, any>) =>
  normalizeLocationValue(
    source?.current_country || source?.currentCountry || source?.current_country_name || source?.currentCountryName,
  );

const getCountryCode = (source: Record<string, any>) =>
  normalizeLocationValue(source?.current_country_code || source?.currentCountryCode);

const resolveCountryMetadata = (source: Record<string, any>) => {
  const explicitCountry = getCountry(source);
  const explicitCode = getCountryCode(source).toUpperCase();
  const inferredCountryFromName = findCountryByLabel(explicitCountry);

  if (inferredCountryFromName) {
    return {
      country: inferredCountryFromName.label,
      countryCode: inferredCountryFromName.code,
    };
  }

  if (explicitCode) {
    const countryFromCode = findCountryByCode(explicitCode);
    if (countryFromCode) {
      return {
        country: explicitCountry || countryFromCode.label,
        countryCode: countryFromCode.code,
      };
    }
  }

  const fallbackCountrySource = [
    getFirstLocationPart(source?.location),
    getFirstLocationPart(source?.city),
    getFirstLocationPart(source?.region),
  ].find((value) => Boolean(findCountryByLabel(value)));

  const inferredFallbackCountry = findCountryByLabel(fallbackCountrySource);
  if (inferredFallbackCountry) {
    return {
      country: inferredFallbackCountry.label,
      countryCode: inferredFallbackCountry.code,
    };
  }

  return {
    country: explicitCountry,
    countryCode: explicitCountry ? getCountryCodeByName(explicitCountry) || explicitCode : explicitCode,
  };
};

const isCountryOnlyValue = (value?: string | null, source?: Record<string, any>) => {
  if (!source) return false;
  const { country, countryCode: code } = resolveCountryMetadata(source);
  return sameLocationLabel(value, country) || sameLocationLabel(value, code);
};

export type LocationDisplaySurface = 'default' | 'vibes' | 'profile';

export type LocationDisplay = {
  primary: string;
  secondary: string;
  country: string;
  countryCode: string;
  flag: string;
  compact: string;
  withFlag: string;
};

export const buildLocationDisplay = (
  source: Record<string, any> | null | undefined,
  opts?: {
    surface?: LocationDisplaySurface;
    distanceLabel?: string | null;
    includeFlag?: boolean;
  },
): LocationDisplay => {
  const data = source || {};
  const city = getFirstLocationPart(source?.city);
  const location = getFirstLocationPart(source?.location);
  const region = getFirstLocationPart(source?.region);
  const { country: currentCountry, countryCode } = resolveCountryMetadata(data);
  const flag = opts?.includeFlag === false ? '' : toFlagEmoji(countryCode);
  const precision = normalizeLocationValue(source?.location_precision || source?.locationPrecision).toUpperCase();
  const surface = opts?.surface || 'default';
  const distanceLabel = isDistanceLabel(opts?.distanceLabel) ? normalizeLocationValue(opts?.distanceLabel) : '';
  const cityIsUsable =
    !!city &&
    !isBroadRegionLabel(city) &&
    !isCountryOnlyValue(city, data) &&
    !sameLocationLabel(city, region) &&
    (!isKnownGhanaRegionLabel(city) || precision === 'EXACT');
  const locationIsUsable =
    !!location &&
    !isBroadRegionLabel(location) &&
    !isCountryOnlyValue(location, data) &&
    !sameLocationLabel(location, city) &&
    (!isKnownGhanaRegionLabel(location) || precision === 'EXACT');
  const regionIsUsable =
    !!region &&
    !isBroadRegionLabel(region) &&
    !isCountryOnlyValue(region, data);
  const nonAdministrativeCity =
    cityIsUsable && !isAdministrativeLocationLabel(city) ? city : '';
  const nonAdministrativeLocation =
    locationIsUsable && !isAdministrativeLocationLabel(location) ? location : '';

  const specific = nonAdministrativeCity || nonAdministrativeLocation || (cityIsUsable ? city : '') || (locationIsUsable ? location : '');
  const regionLabel = regionIsUsable ? region : '';
  const country = currentCountry || (countryCode ? findCountryByCode(countryCode)?.label || '' : '');
  const profilePlace = [specific || regionLabel, country].filter((value, index, arr) => {
    if (!value) return false;
    return index === 0 || !sameLocationLabel(value, arr[0]);
  }).join(', ');

  const base =
    surface === 'vibes'
      ? country || specific || regionLabel
      : surface === 'profile'
        ? profilePlace || country || specific || regionLabel
        : specific || location || city || regionLabel || country;
  const secondary =
    surface === 'vibes'
      ? (specific && !sameLocationLabel(specific, base) ? specific : regionLabel && !sameLocationLabel(regionLabel, base) ? regionLabel : '')
      : '';
  const compactBase = distanceLabel && base && !sameLocationLabel(distanceLabel, base)
    ? `${distanceLabel} \u00b7 ${base}`
    : distanceLabel || base;
  const withFlag = [compactBase, flag].filter(Boolean).join(' ');

  return {
    primary: base,
    secondary,
    country,
    countryCode,
    flag,
    compact: withFlag,
    withFlag,
  };
};

export const pickPreferredLocationLabel = (source: Record<string, any>) => {
  return buildLocationDisplay(source, { surface: 'default', includeFlag: false }).primary;
};

export const pickVibesLocationLabel = (source: Record<string, any>) => {
  return buildLocationDisplay(source, { surface: 'vibes', includeFlag: false }).primary;
};

export const pickProfileLocationLabel = (source: Record<string, any>) => {
  return buildLocationDisplay(source, { surface: 'profile', includeFlag: false }).primary;
};
