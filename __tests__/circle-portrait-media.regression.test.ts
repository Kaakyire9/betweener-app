import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPortraitMediaSuitability,
  isPortraitHeroMediaSuitable,
} from '../lib/circles/portrait-media.ts';

test('the Welcome Lounge hero accepts useful portrait-card crops', () => {
  assert.equal(isPortraitHeroMediaSuitable({ width: 900, height: 1200 }), true);
  assert.equal(getPortraitMediaSuitability({ width: 800, height: 1200 }), 'suitable');
  assert.equal(getPortraitMediaSuitability({ width: 1000, height: 1000 }), 'suitable');
  assert.equal(getPortraitMediaSuitability({ width: 1200, height: 800 }), 'suitable');
  assert.equal(getPortraitMediaSuitability({ width: 1280, height: 720 }), 'suitable');
  assert.equal(getPortraitMediaSuitability({ width: 320, height: 480 }), 'suitable');
});

test('the Welcome Lounge hero rejects only unusable media', () => {
  assert.equal(getPortraitMediaSuitability({ width: 1600, height: 500 }), 'extreme_aspect_ratio');
  assert.equal(getPortraitMediaSuitability({ width: 400, height: 1200 }), 'extreme_aspect_ratio');
  assert.equal(getPortraitMediaSuitability({ width: 160, height: 160 }), 'low_resolution');
  assert.equal(getPortraitMediaSuitability({ width: 0, height: 0 }), 'invalid_dimensions');
});
