type CompatProfile = {
  interests?: string[];
  lookingFor?: string | null;
  loveLanguage?: string | null;
  personalityType?: string | null;
  religion?: string | null;
  wantsChildren?: string | null;
  smoking?: string | null;
};

type CompatWeights = {
  interests: number;
  lookingFor: number;
  loveLanguage: number;
  personalityType: number;
  religion: number;
  wantsChildren: number;
  smoking: number;
};

const DEFAULT_WEIGHTS: CompatWeights = {
  interests: 0.4,
  lookingFor: 0.15,
  loveLanguage: 0.1,
  personalityType: 0.1,
  religion: 0.1,
  wantsChildren: 0.1,
  smoking: 0.05,
};

const normalizeToken = (value?: string | null) =>
  (value ?? '').trim().toLowerCase();

const toTokenSet = (values?: string[]) => {
  if (!values || values.length === 0) return new Set<string>();
  return new Set(values.map((v) => normalizeToken(v)).filter(Boolean));
};

const computeInterestOverlapRatio = (a?: string[], b?: string[]) => {
  const aSet = toTokenSet(a);
  const bSet = toTokenSet(b);
  if (aSet.size === 0 || bSet.size === 0) return null;
  let intersection = 0;
  aSet.forEach((value) => {
    if (bSet.has(value)) intersection += 1;
  });
  const union = new Set<string>([...aSet, ...bSet]).size;
  if (union === 0) return null;
  return intersection / union;
};

const scoreFieldMatch = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  return normalizeToken(a) === normalizeToken(b) ? 1 : 0;
};

export const computeCompatibilityPercent = (
  viewer: CompatProfile,
  target: CompatProfile,
  weights: CompatWeights = DEFAULT_WEIGHTS
): number | null => {
  let available = 0;
  let score = 0;

  const interestsRatio = computeInterestOverlapRatio(viewer.interests, target.interests);
  if (interestsRatio != null) {
    available += weights.interests;
    score += weights.interests * interestsRatio;
  }

  const lookingFor = scoreFieldMatch(viewer.lookingFor, target.lookingFor);
  if (lookingFor != null) {
    available += weights.lookingFor;
    score += weights.lookingFor * lookingFor;
  }

  const loveLanguage = scoreFieldMatch(viewer.loveLanguage, target.loveLanguage);
  if (loveLanguage != null) {
    available += weights.loveLanguage;
    score += weights.loveLanguage * loveLanguage;
  }

  const personalityType = scoreFieldMatch(viewer.personalityType, target.personalityType);
  if (personalityType != null) {
    available += weights.personalityType;
    score += weights.personalityType * personalityType;
  }

  const religion = scoreFieldMatch(viewer.religion, target.religion);
  if (religion != null) {
    available += weights.religion;
    score += weights.religion * religion;
  }

  const wantsChildren = scoreFieldMatch(viewer.wantsChildren, target.wantsChildren);
  if (wantsChildren != null) {
    available += weights.wantsChildren;
    score += weights.wantsChildren * wantsChildren;
  }

  const smoking = scoreFieldMatch(viewer.smoking, target.smoking);
  if (smoking != null) {
    available += weights.smoking;
    score += weights.smoking * smoking;
  }

  if (available <= 0) return null;
  return Math.round((score / available) * 100);
};
