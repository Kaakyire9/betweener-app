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

test('helper basics stay stable for comma-separated location values', () => {
  assert.equal(getFirstLocationPart('Bristol, United Kingdom'), 'Bristol');
  assert.equal(isBroadRegionLabel('Europe'), true);
  assert.equal(isBroadRegionLabel('Ashanti Region'), false);
});
