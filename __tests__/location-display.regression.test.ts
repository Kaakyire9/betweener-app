// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFirstLocationPart,
  isBroadRegionLabel,
  pickBetterLocationValue,
  pickPreferredLocationLabel,
} from '../lib/location/location-display.ts';

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

test('pickPreferredLocationLabel uses country location before onboarding region metadata', () => {
  const value = pickPreferredLocationLabel({
    city: null,
    location: 'Ghana',
    region: 'Ashanti',
    current_country: 'Ghana',
  });

  assert.equal(value, 'Ghana');
});

test('pickPreferredLocationLabel uses global country before broad continent metadata', () => {
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
