import type { VibesFilters } from "@/hooks/useVibesFeed";
import type { Match } from "@/types/match";

export type CompassWeight = "essential" | "nice" | "open";
export type CompassFlex = "must" | "prefer" | "open";

export type RelationshipCompass = {
  intention: string;
  updatedAt?: string;
  pace: string;
  geography: {
    mode: string;
    radius?: number;
    city?: string;
  };
  priorities: {
    religion: CompassWeight;
    lifestyle: CompassWeight;
    family: CompassWeight;
    interests: CompassWeight;
    education: CompassWeight;
    career: CompassWeight;
  };
  flexibility: {
    religion: CompassFlex;
    children: CompassFlex;
    verified: CompassFlex;
  };
};

export const DEFAULT_RELATIONSHIP_COMPASS: RelationshipCompass = {
  intention: "serious",
  pace: "balanced",
  geography: {
    mode: "ghana_diaspora",
    radius: 80,
    city: "",
  },
  priorities: {
    religion: "nice",
    lifestyle: "nice",
    family: "nice",
    interests: "nice",
    education: "open",
    career: "open",
  },
  flexibility: {
    religion: "prefer",
    children: "open",
    verified: "prefer",
  },
};

const INTENTION_LABELS: Record<string, string> = {
  serious: "Serious dating",
  long_term: "Long-term relationship",
  marriage: "Marriage-minded",
  open: "Open connection",
};

const PACE_LABELS: Record<string, string> = {
  slow: "Slow pace",
  balanced: "Balanced pace",
  chemistry: "Chemistry first",
  meet_soon: "Ready to meet soon",
};

const GEOGRAPHY_LABELS: Record<string, string> = {
  nearby: "Nearby",
  same_city: "Same city",
  uk: "Across UK",
  ghana_diaspora: "Ghana + diaspora",
  long_distance: "Long distance",
};

const normalizeWeight = (value: unknown): CompassWeight =>
  value === "essential" || value === "nice" || value === "open" ? value : "nice";

const normalizeFlex = (value: unknown): CompassFlex =>
  value === "must" || value === "prefer" || value === "open" ? value : "prefer";

export const applyDefaults = (value?: Partial<RelationshipCompass> | null): RelationshipCompass => {
  const raw = value && typeof value === "object" ? value : {};
  const geography =
    raw.geography && typeof raw.geography === "object"
      ? (raw.geography as Partial<RelationshipCompass["geography"]>)
      : {};
  const priorities =
    raw.priorities && typeof raw.priorities === "object"
      ? (raw.priorities as Partial<RelationshipCompass["priorities"]>)
      : {};
  const flexibility =
    raw.flexibility && typeof raw.flexibility === "object"
      ? (raw.flexibility as Partial<RelationshipCompass["flexibility"]>)
      : {};

  return {
    intention: typeof raw.intention === "string" ? raw.intention : DEFAULT_RELATIONSHIP_COMPASS.intention,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    pace: typeof raw.pace === "string" ? raw.pace : DEFAULT_RELATIONSHIP_COMPASS.pace,
    geography: {
      mode: typeof geography.mode === "string" ? geography.mode : DEFAULT_RELATIONSHIP_COMPASS.geography.mode,
      radius:
        typeof geography.radius === "number" && Number.isFinite(geography.radius)
          ? Math.max(10, Math.min(500, geography.radius))
          : DEFAULT_RELATIONSHIP_COMPASS.geography.radius,
      city: typeof geography.city === "string" ? geography.city : "",
    },
    priorities: {
      religion: normalizeWeight(priorities.religion),
      lifestyle: normalizeWeight(priorities.lifestyle),
      family: normalizeWeight(priorities.family),
      interests: normalizeWeight(priorities.interests),
      education: normalizeWeight(priorities.education),
      career: normalizeWeight(priorities.career),
    },
    flexibility: {
      religion: normalizeFlex(flexibility.religion),
      children: normalizeFlex(flexibility.children),
      verified: normalizeFlex(flexibility.verified),
    },
  };
};

export const deriveCompassSummary = (compass: RelationshipCompass) => {
  const pieces = [
    INTENTION_LABELS[compass.intention] ?? "Open connection",
    PACE_LABELS[compass.pace] ?? "Balanced pace",
    compass.geography.city?.trim() || GEOGRAPHY_LABELS[compass.geography.mode] || "Open geography",
  ];

  const essentialPriorities = Object.entries(compass.priorities)
    .filter(([, value]) => value === "essential")
    .map(([key]) => key);
  if (essentialPriorities.includes("religion")) pieces.push("Faith matters");
  else if (essentialPriorities.includes("family")) pieces.push("Family matters");
  else if (compass.flexibility.verified === "must") pieces.push("Verified only");

  return pieces.join(" • ");
};

export const getPreviewTone = (compass: RelationshipCompass) => {
  const essentialCount = Object.values(compass.priorities).filter((value) => value === "essential").length;
  const mustCount = Object.values(compass.flexibility).filter((value) => value === "must").length;

  if (essentialCount + mustCount >= 4) return "Highly curated matches ahead";
  if (essentialCount + mustCount >= 2) return "Selective and focused";
  if (compass.pace === "balanced" || compass.intention === "serious") return "Balanced and intentional";
  return "Open and exploratory";
};

export const mapToDiscoveryFilters = (compass: RelationshipCompass): Partial<VibesFilters> => {
  const filters: Partial<VibesFilters> = {};

  if (compass.flexibility.verified === "must") {
    filters.verifiedOnly = true;
  }

  if (compass.priorities.interests === "essential") {
    filters.minSharedInterests = 2;
  } else if (compass.priorities.interests === "nice") {
    filters.minSharedInterests = 1;
  }

  if (compass.geography.mode === "nearby" || compass.geography.mode === "same_city") {
    filters.distanceFilterKm = compass.geography.radius ?? 50;
  }

  if (compass.geography.city?.trim()) {
    filters.locationQuery = compass.geography.city.trim();
  }

  return filters;
};

export const mapCompassIntentionToLookingFor = (intention: string) => {
  switch (intention) {
    case "long_term":
      return "Long-term relationship";
    case "marriage":
      return "Marriage";
    case "open":
      return "Let's see what happens";
    case "serious":
    default:
      return "Something serious";
  }
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const includesAny = (value: unknown, needles: string[]) => {
  const normalized = normalizeText(value);
  return needles.some((needle) => normalized.includes(needle));
};

const valuesMatch = (left: unknown, right: unknown) => {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
};

const getSharedInterestCount = (match: Match, viewerInterests?: string[]) => {
  const common = Array.isArray((match as any).commonInterests) ? (match as any).commonInterests.length : 0;
  if (common > 0) return common;
  if (!Array.isArray(viewerInterests) || viewerInterests.length === 0) return 0;
  const interests = Array.isArray((match as any).interests) ? (match as any).interests : [];
  if (!interests.length) return 0;
  const viewerSet = new Set(
    viewerInterests.map((item) => normalizeText(item)).filter(Boolean),
  );
  let count = 0;
  interests.forEach((interest) => {
    if (viewerSet.has(normalizeText(interest))) count += 1;
  });
  return count;
};

const getDistanceKm = (match: Match) => {
  const direct = (match as any).distanceKm;
  return typeof direct === "number" && Number.isFinite(direct) ? direct : null;
};

const getLocationText = (value: unknown) =>
  [
    (value as any)?.city,
    (value as any)?.location,
    (value as any)?.region,
    (value as any)?.current_country,
    (value as any)?.current_country_code,
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(" ");

const weightBoost = (weight: CompassWeight, strong: number, soft: number) => {
  if (weight === "essential") return strong;
  if (weight === "nice") return soft;
  return 0;
};

const flexBoost = (flex: CompassFlex, matches: boolean, known = true) => {
  if (!known) return 0;
  if (flex === "must") return matches ? 2.2 : -5.5;
  if (flex === "prefer") return matches ? 1.25 : -0.45;
  return 0;
};

export const getRelationshipCompassMatchScore = (
  match: Match,
  compass: RelationshipCompass | null | undefined,
  opts: {
    viewerProfile?: any;
    viewerInterests?: string[];
  } = {},
) => {
  if (!compass) return 0;

  let score = 0;
  const matchIntentText = [
    (match as any).lookingFor,
    (match as any).looking_for,
    match.tagline,
    match.bio,
  ].join(" ");
  const distanceKm = getDistanceKm(match);
  const matchLocation = getLocationText(match);
  const matchCountry = normalizeText((match as any).current_country_code || (match as any).current_country);
  const viewerCountry = normalizeText((opts.viewerProfile as any)?.current_country_code || (opts.viewerProfile as any)?.current_country);

  if (compass.intention === "marriage") {
    if (includesAny(matchIntentText, ["marriage", "married", "wife", "husband"])) score += 2.4;
    else if (includesAny(matchIntentText, ["serious", "long-term", "long term", "relationship"])) score += 1.1;
  } else if (compass.intention === "long_term") {
    if (includesAny(matchIntentText, ["long-term", "long term", "relationship", "serious", "partner"])) score += 2.0;
  } else if (compass.intention === "serious") {
    if (includesAny(matchIntentText, ["serious", "relationship", "long", "marriage"])) score += 1.6;
  } else if (compass.intention === "open") {
    if (includesAny(matchIntentText, ["open", "see", "chemistry", "friend"])) score += 0.9;
  }

  if (compass.pace === "slow" && includesAny(matchIntentText, ["serious", "long", "marriage"])) score += 0.8;
  if (compass.pace === "balanced") score += 0.35;
  if (compass.pace === "chemistry" && ((match as any).profileVideo || (match as any).isActiveNow)) score += 0.9;
  if (compass.pace === "meet_soon") {
    if ((match as any).isActiveNow) score += 0.9;
    if (distanceKm != null && distanceKm <= 35) score += 1.0;
  }

  if (compass.geography.city?.trim() && matchLocation.includes(normalizeText(compass.geography.city))) {
    score += 2.1;
  } else if (compass.geography.mode === "nearby") {
    if (distanceKm != null && distanceKm <= (compass.geography.radius ?? 50)) score += 1.8;
    else if (distanceKm != null) score -= 1.0;
  } else if (compass.geography.mode === "same_city") {
    const viewerCity = normalizeText((opts.viewerProfile as any)?.city || (opts.viewerProfile as any)?.location).split(",")[0];
    if (viewerCity && matchLocation.includes(viewerCity)) score += 1.6;
  } else if (compass.geography.mode === "uk") {
    if (matchCountry === "gb" || matchLocation.includes("united kingdom") || matchLocation.includes("uk")) score += 1.4;
  } else if (compass.geography.mode === "ghana_diaspora") {
    if (matchCountry === "gh" || matchLocation.includes("ghana") || (viewerCountry && matchCountry === viewerCountry)) score += 1.5;
  } else if (compass.geography.mode === "long_distance") {
    score += 0.45;
  }

  const sharedInterests = getSharedInterestCount(match, opts.viewerInterests);
  if (sharedInterests > 0) {
    score += Math.min(2.2, sharedInterests * weightBoost(compass.priorities.interests, 0.7, 0.42));
  } else if (compass.priorities.interests === "essential") {
    score -= 0.8;
  }

  const sameReligion = valuesMatch((opts.viewerProfile as any)?.religion, (match as any).religion);
  const religionKnown = Boolean(normalizeText((opts.viewerProfile as any)?.religion) && normalizeText((match as any).religion));
  score += weightBoost(compass.priorities.religion, sameReligion ? 1.5 : -0.4, sameReligion ? 0.75 : 0);
  score += flexBoost(compass.flexibility.religion, sameReligion, religionKnown);

  const sameChildrenDirection = valuesMatch(
    (opts.viewerProfile as any)?.wants_children || (opts.viewerProfile as any)?.wantsChildren,
    (match as any).wants_children || (match as any).wantsChildren,
  );
  const childrenKnown = Boolean(
    normalizeText((opts.viewerProfile as any)?.wants_children || (opts.viewerProfile as any)?.wantsChildren) &&
      normalizeText((match as any).wants_children || (match as any).wantsChildren),
  );
  score += weightBoost(compass.priorities.family, sameChildrenDirection ? 1.35 : -0.35, sameChildrenDirection ? 0.65 : 0);
  score += flexBoost(compass.flexibility.children, sameChildrenDirection, childrenKnown);

  const verified = ((match as any).verification_level ?? 0) > 0 || Boolean((match as any).verified);
  score += flexBoost(compass.flexibility.verified, verified, true);

  if (compass.priorities.lifestyle !== "open") {
    if ((match as any).profileVideo || (match as any).isActiveNow) {
      score += compass.priorities.lifestyle === "essential" ? 0.9 : 0.45;
    }
    if (
      valuesMatch((opts.viewerProfile as any)?.smoking, (match as any).smoking) ||
      valuesMatch((opts.viewerProfile as any)?.love_language || (opts.viewerProfile as any)?.loveLanguage, (match as any).love_language || (match as any).loveLanguage)
    ) {
      score += compass.priorities.lifestyle === "essential" ? 0.8 : 0.4;
    }
  }

  if (compass.priorities.education !== "open" && normalizeText((match as any).education)) {
    score += compass.priorities.education === "essential" ? 0.6 : 0.3;
  }
  if (compass.priorities.career !== "open" && normalizeText((match as any).occupation)) {
    score += compass.priorities.career === "essential" ? 0.6 : 0.3;
  }

  return Math.max(-8, Math.min(8, score));
};
