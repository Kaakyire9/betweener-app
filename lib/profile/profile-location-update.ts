type ProfileLocationDraft = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  localityGeonameId?: number | null;
  localityDistrict?: string | null;
  localityAdmin1Code?: string | null;
  localityProvider?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ProfileLocationUpdate = {
  city: string | null;
  region: string | null;
  location: string | null;
  location_precision: 'CITY' | 'REGION' | 'COUNTRY';
  locality_geoname_id: number | null;
  locality_district: string | null;
  locality_admin1_code: string | null;
  locality_provider: string | null;
  latitude: number | null;
  longitude: number | null;
};

const clean = (value?: string | null) => String(value || '').trim();

const finiteNumber = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const joinUniqueLocationParts = (...values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  return values
    .map(clean)
    .filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
};

/**
 * Serializes the profile editor's explicit city, region, and country fields.
 * A city remains authoritative even when canonical GeoNames metadata is absent
 * (for example while the production locality migration is rolling out).
 */
export const buildProfileLocationUpdate = (
  draft: ProfileLocationDraft,
): ProfileLocationUpdate => {
  const city = clean(draft.city);
  const region = clean(draft.region);
  const country = clean(draft.country);
  const localityGeonameId = finiteNumber(draft.localityGeonameId);

  if (city) {
    return {
      city,
      region: region || null,
      location: joinUniqueLocationParts(city, region, country) || city,
      location_precision: 'CITY',
      locality_geoname_id: localityGeonameId,
      locality_district: clean(draft.localityDistrict) || region || null,
      locality_admin1_code: localityGeonameId ? clean(draft.localityAdmin1Code) || null : null,
      locality_provider: localityGeonameId ? clean(draft.localityProvider) || 'geonames' : null,
      latitude: localityGeonameId ? finiteNumber(draft.latitude) : null,
      longitude: localityGeonameId ? finiteNumber(draft.longitude) : null,
    };
  }

  if (region) {
    return {
      city: null,
      region,
      location: joinUniqueLocationParts(region, country) || region,
      location_precision: 'REGION',
      locality_geoname_id: null,
      locality_district: null,
      locality_admin1_code: null,
      locality_provider: null,
      latitude: null,
      longitude: null,
    };
  }

  return {
    city: null,
    region: null,
    location: country || null,
    location_precision: 'COUNTRY',
    locality_geoname_id: null,
    locality_district: null,
    locality_admin1_code: null,
    locality_provider: null,
    latitude: null,
    longitude: null,
  };
};
