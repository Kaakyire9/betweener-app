export type AgeRange = {
  min: number;
  max: number;
};

export type AgePresetMode = 'focused' | 'balanced' | 'open' | 'custom';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeRange = (range: AgeRange, absoluteMin: number, absoluteMax: number): AgeRange => {
  const nextMin = clamp(Math.round(range.min), absoluteMin, absoluteMax);
  const nextMax = clamp(Math.round(range.max), absoluteMin, absoluteMax);
  return {
    min: Math.min(nextMin, nextMax),
    max: Math.max(nextMin, nextMax),
  };
};

const areRangesEqual = (left: AgeRange, right: AgeRange) => left.min === right.min && left.max === right.max;

const buildAnchoredRange = ({
  anchor,
  span,
  bounds,
}: {
  anchor: number;
  span: number;
  bounds: AgeRange;
}): AgeRange => {
  const normalizedBounds = normalizeRange(bounds, bounds.min, bounds.max);
  const boundedSpan = clamp(Math.round(span), 4, Math.max(4, normalizedBounds.max - normalizedBounds.min));
  const boundedAnchor = clamp(anchor, normalizedBounds.min, normalizedBounds.max);
  const halfSpan = boundedSpan / 2;

  let nextMin = Math.round(boundedAnchor - halfSpan);
  let nextMax = nextMin + boundedSpan;

  if (nextMin < normalizedBounds.min) {
    nextMin = normalizedBounds.min;
    nextMax = nextMin + boundedSpan;
  }

  if (nextMax > normalizedBounds.max) {
    nextMax = normalizedBounds.max;
    nextMin = nextMax - boundedSpan;
  }

  return normalizeRange(
    {
      min: nextMin,
      max: nextMax,
    },
    normalizedBounds.min,
    normalizedBounds.max,
  );
};

export const formatAgeRangeValue = (range: AgeRange) => {
  if (range.min === range.max) return `${range.min}`;
  return `${range.min} — ${range.max}`;
};

export const formatAgePresetLabel = (mode: AgePresetMode) => {
  switch (mode) {
    case 'focused':
      return 'Focused';
    case 'balanced':
      return 'Balanced';
    case 'open':
      return 'Open';
    default:
      return 'Custom';
  }
};

export const getAgeRangeForPreset = ({
  mode,
  userAge,
  savedRange,
  absoluteMin,
  absoluteMax,
}: {
  mode: Exclude<AgePresetMode, 'custom'>;
  userAge?: number | null;
  savedRange: AgeRange;
  absoluteMin: number;
  absoluteMax: number;
}): AgeRange => {
  const baseRange = normalizeRange(savedRange, absoluteMin, absoluteMax);
  const baseSpan = Math.max(0, baseRange.max - baseRange.min);
  const anchor = clamp(
    typeof userAge === 'number' && Number.isFinite(userAge)
      ? userAge
      : Math.round((baseRange.min + baseRange.max) / 2),
    baseRange.min,
    baseRange.max,
  );

  if (mode === 'open') {
    return baseRange;
  }

  if (baseSpan <= 4) {
    return baseRange;
  }

  if (mode === 'balanced') {
    return buildAnchoredRange({
      anchor,
      span: Math.max(6, Math.round(baseSpan * 0.72)),
      bounds: baseRange,
    });
  }

  return buildAnchoredRange({
    anchor,
    span: Math.max(4, Math.round(baseSpan * 0.46)),
    bounds: baseRange,
  });
};

export const resolveAgePresetMode = ({
  value,
  userAge,
  savedRange,
  absoluteMin,
  absoluteMax,
}: {
  value: AgeRange;
  userAge?: number | null;
  savedRange: AgeRange;
  absoluteMin: number;
  absoluteMax: number;
}): AgePresetMode => {
  const normalizedValue = normalizeRange(value, absoluteMin, absoluteMax);
  const focused = getAgeRangeForPreset({
    mode: 'focused',
    userAge,
    savedRange,
    absoluteMin,
    absoluteMax,
  });
  const balanced = getAgeRangeForPreset({
    mode: 'balanced',
    userAge,
    savedRange,
    absoluteMin,
    absoluteMax,
  });
  const open = getAgeRangeForPreset({
    mode: 'open',
    userAge,
    savedRange,
    absoluteMin,
    absoluteMax,
  });

  if (areRangesEqual(normalizedValue, focused)) return 'focused';
  if (areRangesEqual(normalizedValue, balanced) && !areRangesEqual(balanced, open)) return 'balanced';
  if (areRangesEqual(normalizedValue, open)) return 'open';
  return 'custom';
};

export const getAgePresetSupportCopy = (mode: AgePresetMode) => {
  switch (mode) {
    case 'focused':
      return 'A tighter range for stronger fit.';
    case 'balanced':
      return 'A calm middle range inside your preference.';
    case 'open':
      return 'Your full preferred discovery range.';
    default:
      return 'Shape a narrower range for this room.';
  }
};
