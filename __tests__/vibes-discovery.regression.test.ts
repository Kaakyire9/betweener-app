// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocationSearchText, rerankVibesSegment } from '../lib/vibes/discovery-logic.ts';

const createMatch = (overrides: Record<string, any>) => ({
  id: overrides.id ?? 'm1',
  name: overrides.name ?? 'Test',
  age: overrides.age ?? 30,
  interests: overrides.interests ?? [],
  distance: overrides.distance ?? '',
  distanceKm: overrides.distanceKm,
  compatibility: overrides.compatibility ?? 0,
  commonInterests: overrides.commonInterests ?? [],
  isActiveNow: overrides.isActiveNow ?? false,
  lastActive: overrides.lastActive ?? null,
  verified: overrides.verified ?? false,
  verification_level: overrides.verification_level,
  profileVideo: overrides.profileVideo,
  city: overrides.city,
  location: overrides.location,
  region: overrides.region,
  current_country: overrides.current_country,
});

test('Nearby keeps precise-distance cards ahead of city-only cards', () => {
  const precise = createMatch({
    id: 'precise',
    distanceKm: 12,
    distance: '12 km away',
    city: 'Bristol',
    compatibility: 74,
  });
  const cityOnly = createMatch({
    id: 'city-only',
    location: 'Kumasi',
    current_country: 'Ghana',
    compatibility: 95,
    commonInterests: ['Music', 'Food'],
  });

  const ranked = rerankVibesSegment([cityOnly, precise] as any, 'nearby');

  assert.equal(ranked[0].id, 'precise');
  assert.equal(ranked[1].id, 'city-only');
});

test('Active Now prefers urgent reachable cards over stale ones', () => {
  const activeNear = createMatch({
    id: 'active-near',
    isActiveNow: true,
    distanceKm: 8,
    distance: '8 km away',
    compatibility: 62,
  });
  const staleFar = createMatch({
    id: 'stale-far',
    distanceKm: 200,
    distance: '200 km away',
    compatibility: 90,
    isActiveNow: false,
    lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  });

  const ranked = rerankVibesSegment([staleFar, activeNear] as any, 'activeNow');

  assert.equal(ranked[0].id, 'active-near');
});

test('location search text prefers city before region/country fallback', () => {
  const cityValue = buildLocationSearchText(createMatch({ city: 'Oforikrom', region: 'Ashanti Region', current_country: 'Ghana' }) as any);
  const fallbackValue = buildLocationSearchText(createMatch({ city: null, location: null, current_country: 'Canada', region: 'North America' }) as any);

  assert.equal(cityValue, 'oforikrom');
  assert.equal(fallbackValue, 'canada');
});
