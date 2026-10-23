import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createRelationshipGistLinks,
  resolveRelationshipGistLinkEnvironment,
} from '../features/relationship-gists/config/relationship-gist-link-environment.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical Gist links are environment-bound and preserve stable identity', () => {
  const staging = createRelationshipGistLinks('gist/id', 'Christian', {
    variant: 'staging',
    scheme: 'betweenerstaging',
    webOrigin: 'https://staging.getbetweener.com',
  });
  assert.deepEqual(staging, {
    deepLink: 'betweenerstaging://gists/gist%2Fid?perspective=christian',
    webLink: 'https://staging.getbetweener.com/gists/gist%2Fid?perspective=christian',
  });
  assert.throws(() => resolveRelationshipGistLinkEnvironment({
    variant: 'production',
    scheme: 'betweenerstaging',
    webOrigin: 'https://getbetweener.com',
  }), /does not match/);
});

test('standalone reader, sharing, and hosted app-link manifests use the canonical Gist route', () => {
  const route = read('app/gists/[gistId].tsx');
  const reader = read('features/relationship-gists/components/RelationshipGistStandaloneReader.tsx');
  const explore = read('app/(tabs)/explore.tsx');
  const productionAasa = read('public/.well-known/apple-app-site-association');
  const stagingAasa = read('staging-hosting-files/.well-known/apple-app-site-association');
  const productionHostRules = read('hostinger-files/.htaccess');
  const productionFallback = read('hostinger-files/gists/index.html');
  const stagingFallback = read('staging-hosting-files/gists/index.html');

  assert.match(route, /RelationshipGistStandaloneReader/);
  assert.match(reader, /createCurrentRelationshipGistLinks/);
  assert.match(reader, /url: links\.webLink/);
  assert.match(explore, /pathname: '\/gists\/\[gistId\]'/);
  assert.match(explore, /url: links\.webLink/);
  assert.match(productionAasa, /"\/gists\/\*"/);
  assert.match(stagingAasa, /"\/gists\/\*"/);
  assert.match(productionHostRules, /\^gists\/\[\^\/\]\+\//);
  assert.match(productionFallback, /betweenerapp/);
  assert.match(stagingFallback, /betweenerstaging/);
});

test('Gist content loading is account-scoped and independent from supplemental Circle queries', () => {
  const cache = read('features/relationship-gists/data/relationship-gist-content-cache.ts');
  const catalog = read('features/relationship-gists/data/relationship-gist-catalog.ts');
  const explore = read('app/(tabs)/explore.tsx');
  const reader = read('features/relationship-gists/components/RelationshipGistStandaloneReader.tsx');

  assert.match(cache, /relationship-gist-content:v1:/);
  assert.match(cache, /ownerUserId/);
  assert.match(reader, /loadRequestRef/);
  assert.match(reader, /setCatalog\(\[\]\)/);
  assert.match(catalog, /writeRelationshipGistContentCache/);
  assert.match(catalog, /source: 'cache'/);
  assert.match(explore, /const globalGistsPromise = loadGlobalGists\(true\)/);
  assert.doesNotMatch(explore, /const gistsPromise = fetchCurrentRelationshipGists/);
  assert.ok(
    explore.indexOf('const globalGists = (await globalGistsPromise)')
      < explore.indexOf('if (membershipError) throw membershipError'),
  );
});

test('approved cover visibility is independent from AI image generation', () => {
  const flags = read('features/relationship-gists/config/relationship-gist-ai-flags.ts');
  const cover = read('features/relationship-gists/components/RelationshipGistCover.tsx');
  const coverCache = read('features/relationship-gists/media/relationship-gist-cover-cache.ts');
  const engagementCache = read('features/relationship-gists/engagement/relationship-gist-engagement-cache.ts');
  assert.match(flags, /EXPO_PUBLIC_RELATIONSHIP_GIST_COVERS_ENABLED/);
  assert.match(flags, /RELATIONSHIP_GIST_COVERS_ENABLED/);
  assert.match(cover, /RELATIONSHIP_GIST_COVERS_ENABLED/);
  assert.match(cover, /getOfflineImageUriForOwner/);
  assert.match(coverCache, /ownerUserId/);
  assert.match(engagementCache, /reflection: null/);
  assert.doesNotMatch(cover, /RELATIONSHIP_GIST_AI_IMAGES_ENABLED/);
});
