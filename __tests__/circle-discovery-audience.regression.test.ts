import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCircleReachScopes, toggleCircleReachScope } from '../lib/circles/circle-audience.ts';
import { isCircleDiscoverableForViewer } from '../lib/circles/circle-discovery-audience.ts';

const ghanaCountryCircle = {
  reach_scope: 'country',
  access_policy: 'open',
  country_code: 'GH',
};

test('Country reach uses current country and never origin country', () => {
  assert.equal(isCircleDiscoverableForViewer(
    ghanaCountryCircle,
    { current_country_code: 'GB', origin_country_code: 'GH' },
    'my_country',
  ), false);
  assert.equal(isCircleDiscoverableForViewer(
    ghanaCountryCircle,
    { current_country_code: 'GH', origin_country_code: 'GB' },
    'my_country',
  ), true);
});

test('Global browsing cannot bypass Country or Local reach', () => {
  assert.equal(isCircleDiscoverableForViewer(
    ghanaCountryCircle,
    { current_country_code: 'GB', origin_country_code: 'GH' },
    'global',
  ), false);
  assert.equal(isCircleDiscoverableForViewer(
    { reach_scope: 'global', access_policy: 'open' },
    { current_country_code: 'GB' },
    'global',
  ), true);
});

test('Local reach requires both current country and city', () => {
  const circle = { ...ghanaCountryCircle, reach_scope: 'local', city: 'Accra' };
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GH', city: 'Accra' }, 'near_me'), true);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GH', city: 'Kumasi' }, 'near_me'), false);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GH' }, 'near_me'), false);
});

test('Diaspora reach matches origin and optional destination', () => {
  const circle = {
    reach_scope: 'diaspora',
    access_policy: 'open',
    diaspora_origin_country_codes: ['GH'],
    diaspora_destination_country_codes: ['GB', 'US'],
  };
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GB', origin_country_code: 'GH' }, 'diaspora'), true);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'CA', origin_country_code: 'GH' }, 'diaspora'), false);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GB', origin_country_code: 'NG' }, 'diaspora'), false);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GH', origin_country_code: 'GH' }, 'diaspora'), false);
});

test('Country and Diaspora segments serve residents and emigrants without becoming global', () => {
  const circle = {
    reach_scope: 'country',
    reach_scopes: ['country', 'diaspora'],
    access_policy: 'open',
    country_code: 'GH',
    diaspora_origin_country_codes: ['GH'],
    diaspora_destination_country_codes: [],
  };
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GH' }, 'my_country'), true);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GB', origin_country_code: 'GH' }, 'diaspora'), true);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GB', origin_country_code: 'NG' }, 'diaspora'), false);
  assert.equal(isCircleDiscoverableForViewer(circle, { current_country_code: 'GB', origin_country_code: 'GH' }, 'global'), false);
});

test('Reach selection keeps Global exclusive and Local/Country mutually exclusive', () => {
  assert.deepEqual(toggleCircleReachScope(['country'], 'diaspora'), ['country', 'diaspora']);
  assert.deepEqual(toggleCircleReachScope(['country', 'diaspora'], 'local'), ['local', 'diaspora']);
  assert.deepEqual(toggleCircleReachScope(['country', 'diaspora'], 'global'), ['global']);
  assert.deepEqual(normalizeCircleReachScopes(['global', 'diaspora']), ['global']);
});

test('Missing location and private Circles fail closed', () => {
  assert.equal(isCircleDiscoverableForViewer(ghanaCountryCircle, {}, 'my_country'), false);
  assert.equal(isCircleDiscoverableForViewer(
    { reach_scope: 'global', access_policy: 'invite_only', visibility: 'private' },
    { current_country_code: 'GB' },
    'global',
  ), false);
});
