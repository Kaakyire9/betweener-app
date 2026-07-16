import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProfileLocationUpdate } from '../lib/profile/profile-location-update.ts';

test('preserves a global city with canonical GeoNames metadata', () => {
  const update = buildProfileLocationUpdate({
    city: 'Bristol',
    region: 'England',
    country: 'United Kingdom',
    localityGeonameId: 2654675,
    localityAdmin1Code: 'ENG',
    localityProvider: 'geonames',
    latitude: 51.45523,
    longitude: -2.59665,
  });

  assert.equal(update.city, 'Bristol');
  assert.equal(update.region, 'England');
  assert.equal(update.location, 'Bristol, England, United Kingdom');
  assert.equal(update.location_precision, 'CITY');
  assert.equal(update.locality_geoname_id, 2654675);
});

test('does not reinterpret the administrative region as the city without a GeoNames ID', () => {
  const update = buildProfileLocationUpdate({
    city: 'Bristol',
    region: 'England',
    country: 'United Kingdom',
    localityGeonameId: null,
  });

  assert.equal(update.city, 'Bristol');
  assert.equal(update.region, 'England');
  assert.equal(update.location, 'Bristol, England, United Kingdom');
  assert.equal(update.location_precision, 'CITY');
  assert.equal(update.locality_geoname_id, null);
});

test('falls back progressively from region to country only when no city exists', () => {
  const regional = buildProfileLocationUpdate({
    region: 'England',
    country: 'United Kingdom',
  });
  const countryOnly = buildProfileLocationUpdate({ country: 'United Kingdom' });

  assert.deepEqual(
    { city: regional.city, region: regional.region, location: regional.location, precision: regional.location_precision },
    { city: null, region: 'England', location: 'England, United Kingdom', precision: 'REGION' },
  );
  assert.deepEqual(
    { city: countryOnly.city, region: countryOnly.region, location: countryOnly.location, precision: countryOnly.location_precision },
    { city: null, region: null, location: 'United Kingdom', precision: 'COUNTRY' },
  );
});
