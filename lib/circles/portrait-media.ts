export type PortraitMediaDimensions = {
  width: number;
  height: number;
};

export type PortraitMediaSuitability =
  | 'invalid_dimensions'
  | 'low_resolution'
  | 'extreme_aspect_ratio'
  | 'suitable';

// Profile photos are commonly delivered as square crops, and some older
// uploads retain a moderate landscape crop. Both work with contentFit="cover".
// Only reject sources that cannot produce a clean, useful portrait-card crop.
const MIN_SOURCE_EDGE = 240;
const MIN_COVER_ASPECT_RATIO = 0.45;
const MAX_COVER_ASPECT_RATIO = 1.9;

export const getPortraitMediaSuitability = ({
  width,
  height,
}: PortraitMediaDimensions): PortraitMediaSuitability => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'invalid_dimensions';
  }
  if (Math.min(width, height) < MIN_SOURCE_EDGE) {
    return 'low_resolution';
  }

  const aspectRatio = width / height;
  if (
    aspectRatio < MIN_COVER_ASPECT_RATIO
    || aspectRatio > MAX_COVER_ASPECT_RATIO
  ) {
    return 'extreme_aspect_ratio';
  }

  return 'suitable';
};

export const isPortraitHeroMediaSuitable = (
  dimensions: PortraitMediaDimensions,
) => getPortraitMediaSuitability(dimensions) === 'suitable';
