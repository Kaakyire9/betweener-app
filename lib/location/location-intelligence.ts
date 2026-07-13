import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCuratedRegionSearchExamples } from "./ghana-locality-metadata.ts";
import { type GhanaCityTownSuggestion } from "./ghana-locality-shared.ts";

export type LocationContext = {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  district: string | null;
  localityId: string | null;
  city: string | null;
  coordinatesAvailable: boolean;
  rootsCountryCode?: string | null;
  rootsRegion?: string | null;
  rootsLocalityId?: string | null;
  rootsLocality?: string | null;
};

export type LocationRelationship = {
  sameLocality: boolean;
  sameDistrict: boolean;
  sameRegion: boolean;
  sameCountry: boolean;
  sharedRootsLocality: boolean;
  sharedRootsRegion: boolean;
  diasporaBridge: boolean;
};

export type LocationAffinityReasonCode =
  | "diaspora_bridge"
  | "shared_roots_locality"
  | "same_locality"
  | "shared_roots_region"
  | "same_district"
  | "same_region"
  | "same_country";

export type LocationInsightSurface = "discovery" | "profile" | "moment";

export type LocationAffinity = {
  reasonCode: LocationAffinityReasonCode;
  strength: number;
  shortText: string;
  longText: string;
};

export type CircleLocationAffinityReasonCode =
  | "same_city"
  | "same_region"
  | "same_country"
  | "diaspora_circle";

export type CircleLocationAffinity = {
  reasonCode: CircleLocationAffinityReasonCode;
  strength: number;
  shortText: string;
};

const GHANA_LOCALITY_RECENTS_KEY = "ghana_locality_recent_selections_v1";
const MAX_RECENT_LOCALITIES = 5;

const normalizeText = (value?: string | null) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value?: string | null) =>
  normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeCode = (value?: string | null) => normalizeText(value).toUpperCase();

const toOptionalText = (value?: string | null) => {
  const normalized = normalizeText(value);
  return normalized || null;
};

const toOptionalNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toOptionalId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};

const getCountryComparisonKey = (context: LocationContext) =>
  normalizeKey(context.countryCode || context.country);

const canRevealRootsForSurface = (source: any) =>
  normalizeKey(source?.roots_visibility ?? source?.rootsVisibility) === "visible";

const arrayify = (values?: string[] | null) =>
  Array.isArray(values) ? values.map(normalizeKey).filter(Boolean) : [];

const intersects = (left?: string[] | null, right?: string[] | null) => {
  const leftSet = new Set(arrayify(left));
  return arrayify(right).some((item) => leftSet.has(item));
};

const getDirectLocationAffinity = (source: any): LocationAffinity | null => {
  const reasonCode = toOptionalText(
    source?.locationAffinityReasonCode ?? source?.location_affinity_reason_code,
  ) as LocationAffinityReasonCode | null;
  const strength = toOptionalNumber(
    source?.locationAffinityStrength ?? source?.location_affinity_strength,
  );
  const shortText = toOptionalText(
    source?.locationAffinityShortText ??
      source?.location_affinity_short_text ??
      source?.locationInsight,
  );
  const longText = toOptionalText(
    source?.locationAffinityLongText ?? source?.location_affinity_long_text,
  );

  if (!reasonCode && shortText == null && longText == null && strength == null) {
    return null;
  }

  return {
    reasonCode: reasonCode ?? "same_country",
    strength: strength ?? 0,
    shortText: shortText ?? longText ?? "",
    longText: longText ?? shortText ?? "",
  };
};

const dedupeLocalities = (items: GhanaCityTownSuggestion[]) => {
  const seen = new Set<string>();
  const unique: GhanaCityTownSuggestion[] = [];

  for (const item of items) {
    const key =
      item.geonameId != null
        ? `id:${item.geonameId}`
        : [
            normalizeKey(item.region),
            normalizeKey(item.name),
            normalizeKey(item.district),
          ].join(":");

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
};

export function getRegionSearchExamples(region?: string | null) {
  return getCuratedRegionSearchExamples(region).slice(0, 3);
}

export function getSuggestedLocalities({
  recent = [],
  defaults = [],
  region,
  limit = 8,
}: {
  recent?: GhanaCityTownSuggestion[];
  defaults?: GhanaCityTownSuggestion[];
  region?: string | null;
  limit?: number;
}) {
  const normalizedRegion = normalizeText(region);
  if (!normalizedRegion) return [];

  const recentInRegion = recent.filter(
    (item) => normalizeKey(item.region) === normalizeKey(normalizedRegion),
  );

  return dedupeLocalities([...recentInRegion, ...defaults]).slice(
    0,
    Math.max(1, Math.min(limit, 12)),
  );
}

export async function readRecentGhanaLocalities(region?: string | null) {
  try {
    const raw = await AsyncStorage.getItem(GHANA_LOCALITY_RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GhanaCityTownSuggestion[] | null;
    if (!Array.isArray(parsed)) return [];
    const normalizedRegion = normalizeKey(region);
    return parsed
      .filter((item) => {
        if (!item || typeof item !== "object") return false;
        if (!normalizedRegion) return true;
        return normalizeKey(item.region) === normalizedRegion;
      })
      .slice(0, MAX_RECENT_LOCALITIES);
  } catch {
    return [];
  }
}

export async function saveRecentGhanaLocality(selection: GhanaCityTownSuggestion) {
  try {
    const existing = await readRecentGhanaLocalities();
    const next = dedupeLocalities([selection, ...existing]).slice(
      0,
      MAX_RECENT_LOCALITIES,
    );
    await AsyncStorage.setItem(GHANA_LOCALITY_RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Best effort only.
  }
}

export function buildLocationContext(source: any): LocationContext {
  return {
    countryCode: toOptionalText(source?.current_country_code ?? source?.currentCountryCode),
    country: toOptionalText(source?.current_country ?? source?.currentCountry),
    region: toOptionalText(source?.region),
    district: toOptionalText(source?.locality_district ?? source?.cityDistrict ?? source?.district),
    localityId: toOptionalId(
      source?.locality_geoname_id ?? source?.localityGeonameId ?? source?.geonameId,
    ),
    city: toOptionalText(source?.city),
    coordinatesAvailable:
      typeof source?.latitude === "number" && typeof source?.longitude === "number",
    rootsCountryCode: toOptionalText(source?.origin_country_code ?? source?.originCountryCode),
    rootsRegion: toOptionalText(source?.roots_region ?? source?.rootsRegion),
    rootsLocalityId: toOptionalId(
      source?.roots_locality_geoname_id ?? source?.rootsLocalityGeonameId,
    ),
    rootsLocality: toOptionalText(source?.roots_locality ?? source?.rootsLocality),
  };
}

export function buildLocationRelationship(viewer: any, candidate: any): LocationRelationship {
  const viewerContext = buildLocationContext(viewer);
  const candidateContext = buildLocationContext(candidate);

  const sameLocality =
    !!viewerContext.localityId &&
    !!candidateContext.localityId &&
    viewerContext.localityId === candidateContext.localityId;
  const sameDistrict =
    !!viewerContext.district &&
    !!candidateContext.district &&
    normalizeKey(viewerContext.district) === normalizeKey(candidateContext.district);
  const sameRegion =
    !!viewerContext.region &&
    !!candidateContext.region &&
    normalizeKey(viewerContext.region) === normalizeKey(candidateContext.region);
  const sameCountry =
    !!getCountryComparisonKey(viewerContext) &&
    !!getCountryComparisonKey(candidateContext) &&
    getCountryComparisonKey(viewerContext) === getCountryComparisonKey(candidateContext);
  const sharedRootsLocality =
    !!viewerContext.rootsLocalityId &&
    !!candidateContext.rootsLocalityId &&
    viewerContext.rootsLocalityId === candidateContext.rootsLocalityId;
  const sharedRootsRegion =
    !!viewerContext.rootsRegion &&
    !!candidateContext.rootsRegion &&
    normalizeKey(viewerContext.rootsRegion) === normalizeKey(candidateContext.rootsRegion);
  const diasporaBridge =
    ((!!viewerContext.localityId &&
      !!candidateContext.rootsLocalityId &&
      viewerContext.localityId === candidateContext.rootsLocalityId) ||
      (!!candidateContext.localityId &&
        !!viewerContext.rootsLocalityId &&
        candidateContext.localityId === viewerContext.rootsLocalityId)) &&
    getCountryComparisonKey(viewerContext) !== getCountryComparisonKey(candidateContext);

  return {
    sameLocality,
    sameDistrict,
    sameRegion,
    sameCountry,
    sharedRootsLocality,
    sharedRootsRegion,
    diasporaBridge,
  };
}

export function getLocationAffinity(viewer: any, candidate: any): LocationAffinity | null {
  const directAffinity = getDirectLocationAffinity(candidate);
  if (directAffinity) return directAffinity;

  const relationship = buildLocationRelationship(viewer, candidate);
  const candidateContext = buildLocationContext(candidate);
  const canRevealRoots = canRevealRootsForSurface(candidate);

  if (relationship.diasporaBridge && canRevealRoots && candidateContext.rootsLocality) {
    return {
      reasonCode: "diaspora_bridge",
      strength: 2.6,
      shortText: `Diaspora bridge to ${candidateContext.rootsLocality}`,
      longText: `You share a diaspora bridge through ${candidateContext.rootsLocality}.`,
    };
  }

  if (relationship.sharedRootsLocality && canRevealRoots && candidateContext.rootsLocality) {
    return {
      reasonCode: "shared_roots_locality",
      strength: 2.8,
      shortText: `Shared roots around ${candidateContext.rootsLocality}`,
      longText: `You share roots around ${candidateContext.rootsLocality}.`,
    };
  }

  if (relationship.sameLocality && candidateContext.city) {
    return {
      reasonCode: "same_locality",
      strength: 3.2,
      shortText: `Shared connection to ${candidateContext.city}`,
      longText: `You both have a connection to ${candidateContext.city}.`,
    };
  }

  if (relationship.sharedRootsRegion && canRevealRoots && candidateContext.rootsRegion) {
    return {
      reasonCode: "shared_roots_region",
      strength: 1.3,
      shortText: `Shared roots in ${candidateContext.rootsRegion}`,
      longText: `There's a shared roots connection in ${candidateContext.rootsRegion}.`,
    };
  }

  if (relationship.sameDistrict && candidateContext.district) {
    return {
      reasonCode: "same_district",
      strength: 2.1,
      shortText: `Same district: ${candidateContext.district}`,
      longText: `You both have ties to ${candidateContext.district}.`,
    };
  }

  if (relationship.sameRegion && candidateContext.region) {
    return {
      reasonCode: "same_region",
      strength: 1.5,
      shortText: `Shared connection to ${candidateContext.region}`,
      longText: `You both have a connection to ${candidateContext.region}.`,
    };
  }

  if (relationship.sameCountry && candidateContext.country) {
    return {
      reasonCode: "same_country",
      strength: 0.6,
      shortText: `Both connected to ${candidateContext.country}`,
      longText: `You both call ${candidateContext.country} home.`,
    };
  }

  return null;
}

export function getLocationAffinityStrength(viewer: any, candidate: any) {
  return getLocationAffinity(viewer, candidate)?.strength ?? 0;
}

export function getCircleLocationAffinity(
  circle: {
    city?: string | null;
    region?: string | null;
    country_name?: string | null;
    country_code?: string | null;
    visibility_scope?: string | null;
    diaspora_tags?: string[] | null;
  } | null | undefined,
  profile?: any,
  scope: "near_me" | "my_country" | "diaspora" | "global" = "my_country",
): CircleLocationAffinity | null {
  if (!circle || !profile) return null;

  const viewerContext = buildLocationContext(profile);
  const circleCity = normalizeText(circle.city);
  const circleRegion = normalizeText(circle.region);
  const circleCountry = normalizeText(circle.country_name);
  const circleCountryCode = normalizeCode(circle.country_code);
  const visibilityScope = normalizeKey(circle.visibility_scope);
  const viewerCity = normalizeText(viewerContext.city);
  const viewerRegion = normalizeText(viewerContext.region);
  const viewerCountryCode = normalizeCode(viewerContext.countryCode);
  const viewerCountry = normalizeText(viewerContext.country);
  const diasporaMatches =
    visibilityScope === "diaspora" ||
    arrayify(circle.diaspora_tags).length > 0 ||
    intersects(circle.diaspora_tags, [
      viewerCountryCode,
      viewerCountry,
      viewerRegion,
    ]);

  if (scope === "diaspora" && diasporaMatches) {
    return {
      reasonCode: "diaspora_circle",
      strength: 28,
      shortText: circleRegion
        ? `${circleRegion} diaspora circle`
        : "Diaspora circle for you",
    };
  }

  if (circleCity && viewerCity && normalizeKey(circleCity) === normalizeKey(viewerCity)) {
    return {
      reasonCode: "same_city",
      strength: 30,
      shortText: `Near you in ${circleCity}`,
    };
  }

  if (circleRegion && viewerRegion && normalizeKey(circleRegion) === normalizeKey(viewerRegion)) {
    return {
      reasonCode: "same_region",
      strength: 16,
      shortText: `${circleRegion}-based circle`,
    };
  }

  if (
    (circleCountryCode && viewerCountryCode && circleCountryCode === viewerCountryCode) ||
    (circleCountry && viewerCountry && normalizeKey(circleCountry) === normalizeKey(viewerCountry))
  ) {
    return {
      reasonCode: "same_country",
      strength: 35,
      shortText: circleCountry ? `${circleCountry}-based circle` : "In your country",
    };
  }

  if (diasporaMatches) {
    return {
      reasonCode: "diaspora_circle",
      strength: 12,
      shortText: circleRegion
        ? `${circleRegion} diaspora circle`
        : "Diaspora circle for you",
    };
  }

  return null;
}

export function getLocationConnectionInsight(
  viewer: any,
  candidate: any,
  surface: LocationInsightSurface = "profile",
) {
  const affinity = getLocationAffinity(viewer, candidate);
  if (!affinity) return null;
  return surface === "profile" ? affinity.longText : affinity.shortText;
}
