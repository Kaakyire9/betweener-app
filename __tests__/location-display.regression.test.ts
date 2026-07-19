// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocationDisplay,
  getFirstLocationPart,
  isBroadRegionLabel,
  pickBetterLocationValue,
  pickPreferredLocationLabel,
} from '../lib/location/location-display.ts';
import { normalizeGhanaRegionValue } from '../lib/location/ghana-locality-shared.ts';

test('Ghana locality search canonicalizes legacy Region suffixes', () => {
  assert.equal(normalizeGhanaRegionValue('Greater Accra Region'), 'Greater Accra');
  assert.equal(normalizeGhanaRegionValue('  ASHANTI region  '), 'Ashanti');
  assert.equal(normalizeGhanaRegionValue('Volta'), 'Volta');
});

test('pickPreferredLocationLabel prefers city over coarse region', () => {
  const value = pickPreferredLocationLabel({
    city: 'Oforikrom',
    region: 'Ashanti Region',
    current_country: 'Ghana',
  });

  assert.equal(value, 'Oforikrom');
});

test('pickPreferredLocationLabel prefers precise location over administrative city', () => {
  const value = pickPreferredLocationLabel({
    city: 'Ashanti Region',
    location: 'Asokwa, Ashanti Region',
    region: 'Ashanti Region',
    current_country: 'Ghana',
  });

  assert.equal(value, 'Asokwa');
});

test('pickPreferredLocationLabel uses country when only coarse onboarding location exists', () => {
  const value = pickPreferredLocationLabel({
    city: null,
    location: 'Ghana',
    region: 'Ashanti',
    current_country: 'Ghana',
  });

  assert.equal(value, 'Ghana');
});

test('pickPreferredLocationLabel uses country before broad continent metadata', () => {
  const value = pickPreferredLocationLabel({
    city: null,
    location: 'United Kingdom',
    region: 'Europe',
    current_country: 'United Kingdom',
  });

  assert.equal(value, 'United Kingdom');
});

test('pickPreferredLocationLabel falls back to country when region is broad continent label', () => {
  const value = pickPreferredLocationLabel({
    city: null,
    location: null,
    region: 'Africa',
    current_country: 'Ghana',
  });

  assert.equal(value, 'Ghana');
});

test('buildLocationDisplay uses compact city label on vibes cards', () => {
  const value = buildLocationDisplay({
    city: 'London',
    region: 'Europe',
    current_country: 'United Kingdom',
    current_country_code: 'GB',
  }, { surface: 'vibes', includeFlag: false });

  assert.equal(value.primary, 'London');
});

test('buildLocationDisplay falls back to country when only administrative region exists', () => {
  const value = pickPreferredLocationLabel({
    city: null,
    location: null,
    region: 'Ashanti Region',
    current_country: 'Ghana',
  });

  assert.equal(value, 'Ghana');
});

test('buildLocationDisplay falls back to country when only broad region exists', () => {
  const value = buildLocationDisplay({
    city: null,
    location: 'Europe',
    region: 'Europe',
    current_country: 'United Kingdom',
    current_country_code: 'GB',
  }, { surface: 'vibes', includeFlag: false });

  assert.equal(value.primary, 'United Kingdom');
});

test('buildLocationDisplay keeps full city and country on profile surfaces', () => {
  const value = buildLocationDisplay({
    city: 'Bristol',
    current_country: 'United Kingdom',
    current_country_code: 'GB',
  }, { surface: 'profile', includeFlag: false });

  assert.equal(value.primary, 'Bristol, United Kingdom');
});

test('buildLocationDisplay prepends distance only for compact nearby usage', () => {
  const value = buildLocationDisplay({
    city: 'Bristol',
    current_country: 'United Kingdom',
    current_country_code: 'GB',
  }, { surface: 'vibes', distanceLabel: '<1 km away', includeFlag: false });

  assert.equal(value.withFlag, '<1 km away · Bristol');
});

test('pickBetterLocationValue keeps shorter non-administrative city over administrative variant', () => {
  const value = pickBetterLocationValue('Oforikrom, Ashanti Region', 'Oforikrom', {
    preferShorter: true,
    avoidAdministrative: true,
  });

  assert.equal(value, 'Oforikrom');
});

test('pickBetterLocationValue keeps non-administrative city over administrative region', () => {
  const value = pickBetterLocationValue('Ashanti Region', 'Asokwa', {
    preferShorter: true,
    avoidAdministrative: true,
  });

  assert.equal(value, 'Asokwa');
});

test('helper basics stay stable for comma-separated location values', () => {
  assert.equal(getFirstLocationPart('Bristol, United Kingdom'), 'Bristol');
  assert.equal(isBroadRegionLabel('Europe'), true);
  assert.equal(isBroadRegionLabel('Ashanti Region'), false);
});
