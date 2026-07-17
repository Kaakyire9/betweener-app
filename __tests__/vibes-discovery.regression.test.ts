// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { getAgeRangeForPreset, resolveAgePresetMode } from '../lib/vibes/age-range-presets.ts';
import { applyInboundInterestLift, buildLocationSearchText, rerankVibesSegment } from '../lib/vibes/discovery-logic.ts';
import { derivePreviewTone, deriveRoomSummary, hasAnyDraftFilters } from '../lib/vibes/vibes-filter-preview.ts';
import { getLocationConnectionInsight } from '../lib/location/location-intelligence.ts';

test('current-location affinity ranks silently instead of duplicating the location line', () => {
  const viewer = { city: 'Manchester', region: 'England', current_country: 'United Kingdom' };

  assert.equal(
    getLocationConnectionInsight(viewer, {
      city: 'Bristol',
      region: 'England',
      current_country: 'United Kingdom',
      location_affinity_reason_code: 'same_region',
      location_affinity_strength: 1.5,
      location_affinity_short_text: 'Shared connection to England',
    }, 'discovery'),
    null,
  );
});

test('heritage affinity keeps distinctive roots copy', () => {
  assert.equal(
    getLocationConnectionInsight({}, {
      roots_region: 'Ashanti',
      roots_visibility: 'VISIBLE',
      location_affinity_reason_code: 'shared_roots_region',
      location_affinity_strength: 1.3,
      location_affinity_short_text: 'Shared roots in Ashanti',
    }, 'discovery'),
    'Shared roots in Ashanti',
  );
});

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
  premiumPlan: overrides.premiumPlan ?? 'FREE',
  hasActiveBoost: overrides.hasActiveBoost ?? false,
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

test('inbound interest can lift a profile without overwhelming server order', () => {
  const profiles = [
    { id: 'a', name: 'A', interestRelevanceScore: 0 },
    { id: 'b', name: 'B', interestRelevanceScore: 0 },
    { id: 'c', name: 'C', interestRelevanceScore: 0 },
    { id: 'd', name: 'D', interestRelevanceScore: 100 },
    { id: 'e', name: 'E', interestRelevanceScore: 0 },
    { id: 'f', name: 'F', interestRelevanceScore: 100 },
  ];

  const ranked = applyInboundInterestLift(profiles);

  assert.equal(ranked[0]?.id, 'd');
  assert.ok(ranked.findIndex((profile) => profile.id === 'f') >= 1);
});

test('For You gives active boosts real visibility lift', () => {
  const boosted = createMatch({
    id: 'boosted',
    compatibility: 62,
    premiumPlan: 'SILVER',
    hasActiveBoost: true,
  });
  const baseline = createMatch({
    id: 'baseline',
    compatibility: 62,
    premiumPlan: 'FREE',
  });

  const ranked = rerankVibesSegment([baseline, boosted] as any, 'forYou');

  assert.equal(ranked[0].id, 'boosted');
});

test('Verification still outranks a plain premium badge when fit is equal', () => {
  const goldUnverified = createMatch({
    id: 'gold-unverified',
    compatibility: 68,
    premiumPlan: 'GOLD',
    verified: false,
    verification_level: 0,
  });
  const freeVerified = createMatch({
    id: 'free-verified',
    compatibility: 68,
    premiumPlan: 'FREE',
    verified: true,
    verification_level: 1,
  });

  const ranked = rerankVibesSegment([goldUnverified, freeVerified] as any, 'forYou');

  assert.equal(ranked[0].id, 'free-verified');
});

test('saved age preference baseline does not count as an active room filter', () => {
  const filters = {
    verifiedOnly: false,
    distanceFilterKm: null,
    minAge: 45,
    maxAge: 50,
    religionFilter: null,
    locationQuery: '',
    hasVideoOnly: false,
    activeOnly: false,
    minVibeScore: null,
    minSharedInterests: 0,
  };
  const baseline = { minAge: 45, maxAge: 50 };

  assert.equal(hasAnyDraftFilters(filters as any, baseline), false);

  const roomSummary = deriveRoomSummary(filters as any, baseline);
  assert.equal(roomSummary.title, 'Open room - discover freely');

  const previewTone = derivePreviewTone(11, filters as any, 0, baseline);
  assert.equal(previewTone.eyebrow, 'Open discovery');
});

test('narrowing inside a saved age baseline still counts as an active room filter', () => {
  const filters = {
    verifiedOnly: false,
    distanceFilterKm: null,
    minAge: 46,
    maxAge: 48,
    religionFilter: null,
    locationQuery: '',
    hasVideoOnly: false,
    activeOnly: false,
    minVibeScore: null,
    minSharedInterests: 0,
  };
  const baseline = { minAge: 45, maxAge: 50 };

  assert.equal(hasAnyDraftFilters(filters as any, baseline), true);
});

test('age presets stay deterministic inside the saved discovery range', () => {
  const savedRange = { min: 20, max: 36 };

  const focused = getAgeRangeForPreset({
    mode: 'focused',
    userAge: 28,
    savedRange,
    absoluteMin: savedRange.min,
    absoluteMax: savedRange.max,
  });
  const balanced = getAgeRangeForPreset({
    mode: 'balanced',
    userAge: 28,
    savedRange,
    absoluteMin: savedRange.min,
    absoluteMax: savedRange.max,
  });
  const open = getAgeRangeForPreset({
    mode: 'open',
    userAge: 28,
    savedRange,
    absoluteMin: savedRange.min,
    absoluteMax: savedRange.max,
  });

  assert.deepEqual(open, savedRange);
  assert.ok(focused.min >= savedRange.min && focused.max <= savedRange.max);
  assert.ok(balanced.min >= savedRange.min && balanced.max <= savedRange.max);
  assert.ok((focused.max - focused.min) <= (balanced.max - balanced.min));
});

test('saved baseline resolves to open mode and manual tightening resolves to custom when needed', () => {
  const savedRange = { min: 20, max: 36 };

  assert.equal(
    resolveAgePresetMode({
      value: savedRange,
      userAge: 28,
      savedRange,
      absoluteMin: savedRange.min,
      absoluteMax: savedRange.max,
    }),
    'open',
  );

  assert.equal(
    resolveAgePresetMode({
      value: { min: 21, max: 31 },
      userAge: 28,
      savedRange,
      absoluteMin: savedRange.min,
      absoluteMax: savedRange.max,
    }),
    'custom',
  );
});
