export type DistanceDisplayConfidence = 'approximate' | 'locality' | 'unknown';
export type ResolvedDistanceUnit = 'km' | 'mi';

const KM_PER_MILE = 1.60934;

const normalizePrecision = (value?: string | null) =>
  String(value || '').trim().toUpperCase();

const cleanLocalityLabel = (value?: string | null) =>
  String(value || '').trim().replace(/\s+/g, ' ');

export const formatApproximateDistance = (
  distanceKm: number,
  unit: ResolvedDistanceUnit = 'km',
) => {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return '';

  if (km < 1) return 'Very close by';

  const value = unit === 'mi' ? km / KM_PER_MILE : km;
  const singular = unit === 'mi' ? 'mile' : 'km';
  const plural = unit === 'mi' ? 'miles' : 'km';

  if (value < 10) {
    const rounded = Number(value.toFixed(1));
    const label = unit === 'mi' && rounded >= 1 && rounded < 1.5 ? singular : plural;
    return `About ${rounded.toFixed(1)} ${label} away`;
  }

  const rounded = Math.round(value);
  const label = unit === 'mi' && rounded === 1 ? singular : plural;
  return `About ${rounded} ${label} away`;
};

export const buildNearbyLocalityLabel = ({
  confidence,
  localityLabel,
  affinityReasonCode,
  sameCityConfirmed = false,
  fallbackLabel,
}: {
  confidence?: DistanceDisplayConfidence | null;
  localityLabel?: string | null;
  affinityReasonCode?: string | null;
  sameCityConfirmed?: boolean;
  fallbackLabel?: string | null;
}) => {
  const locality = cleanLocalityLabel(localityLabel);
  const fallback = cleanLocalityLabel(fallbackLabel);
  if (confidence !== 'locality' || !locality) return fallback || locality;

  const normalizedReason = String(affinityReasonCode || '').trim().toLowerCase();
  const sameCity =
    sameCityConfirmed ||
    normalizedReason === 'same_city' ||
    normalizedReason === 'same_locality';
  return `${sameCity ? 'Also in' : 'Near'} ${locality}`;
};

export const buildDistanceDisplay = ({
  distanceKm,
  candidatePrecision,
  viewerPrecision,
  localityLabel,
  unit = 'km',
  knownConfidence,
}: {
  distanceKm?: number | null;
  candidatePrecision?: string | null;
  viewerPrecision?: string | null;
  localityLabel?: string | null;
  unit?: ResolvedDistanceUnit;
  knownConfidence?: DistanceDisplayConfidence | null;
}): { label: string; confidence: DistanceDisplayConfidence } => {
  const locality = cleanLocalityLabel(localityLabel);
  const numericDistance = distanceKm == null ? Number.NaN : Number(distanceKm);
  const hasDistance = Number.isFinite(numericDistance) && numericDistance >= 0;
  const candidate = normalizePrecision(candidatePrecision);
  const viewer = normalizePrecision(viewerPrecision);

  const canShowApproximateDistance =
    hasDistance &&
    (knownConfidence === 'approximate' || (candidate === 'EXACT' && viewer === 'EXACT'));

  if (canShowApproximateDistance) {
    return {
      label: formatApproximateDistance(numericDistance, unit),
      confidence: 'approximate',
    };
  }

  if (candidate === 'CITY' || knownConfidence === 'locality' || (hasDistance && locality)) {
    return {
      label: locality ? `Near ${locality}` : 'Nearby area',
      confidence: 'locality',
    };
  }

  return {
    label: locality,
    confidence: 'unknown',
  };
};
