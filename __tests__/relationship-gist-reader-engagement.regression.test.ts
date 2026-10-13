import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getRelationshipGistProgressBucket,
  getRelationshipGistReactionLabel,
  normalizeRelationshipGistReflection,
} from '../features/relationship-gists/engagement/relationship-gist-engagement.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('reaction vocabulary and progress analytics are finite and deterministic', () => {
  assert.equal(getRelationshipGistReactionLabel('made_me_think'), 'Made me think');
  assert.equal(getRelationshipGistProgressBucket(-1), 0);
  assert.equal(getRelationshipGistProgressBucket(0.49), 25);
  assert.equal(getRelationshipGistProgressBucket(0.75), 75);
  assert.equal(getRelationshipGistProgressBucket(1), 100);
  assert.equal(normalizeRelationshipGistReflection(`  ${'x'.repeat(2100)}  `).length, 2000);
});

test('every engagement capability is default-off behind static Expo environment references', () => {
  const flags = read('features/relationship-gists/config/relationship-gist-feature-flags.ts');
  assert.match(flags, /process\.env\.EXPO_PUBLIC_RELATIONSHIP_GIST_ENGAGEMENT_ENABLED/);
  assert.match(flags, /process\.env\.EXPO_PUBLIC_RELATIONSHIP_GIST_REACTIONS_ENABLED/);
  assert.match(flags, /process\.env\.EXPO_PUBLIC_RELATIONSHIP_GIST_REFLECTIONS_ENABLED/);
  assert.match(flags, /process\.env\.EXPO_PUBLIC_RELATIONSHIP_GIST_ANALYTICS_ENABLED/);
  assert.match(flags, /ENGAGEMENT_FLAG === 'true'/);
});

test('private reflection text never enters the durable outbox or analytics contract', () => {
  const outbox = read('features/relationship-gists/engagement/relationship-gist-engagement-outbox.ts');
  const migration = read('supabase/migrations/20261010150000_relationship_gist_reader_engagement.sql');
  assert.doesNotMatch(outbox, /reflectionBody|reflectionText|p_body/);
  assert.match(migration, /The receipt deliberately excludes private reflection text/);
  assert.doesNotMatch(migration, /relationship_gist_reader_events[\s\S]{0,900}\bpayload\b/i);
});

test('database changes are additive and keep stable edition plus immutable revision attribution', () => {
  const migration = read('supabase/migrations/20261010150000_relationship_gist_reader_engagement.sql');
  assert.doesNotMatch(migration, /drop\s+(table|function|column)/i);
  assert.match(migration, /primary key \(edition_id, user_id\)/);
  assert.match(migration, /revision_id uuid not null references public\.relationship_gist_revisions/);
  assert.match(migration, /revoke all on table public\.relationship_gist_reflections from public, anon, authenticated/);
  assert.match(migration, /reaction_counts/);
});

test('reader controls are accessible and preserve canonical Saved Gist navigation', () => {
  const panel = read('features/relationship-gists/components/RelationshipGistEngagementPanel.tsx');
  const saved = read('app/saved-gists.tsx');
  const explore = read('app/(tabs)/explore.tsx');
  assert.match(panel, /accessibilityRole="radiogroup"/);
  assert.match(panel, /accessibilityRole="radio"/);
  assert.match(panel, /Only you can read this/);
  assert.match(saved, /openGistId: gist\.gist_id/);
  assert.match(saved, /gistSource: 'saved_library'/);
  assert.match(explore, /RelationshipGistEngagementPanel/);
  assert.match(explore, /CirclesLiveGateway/);
});

test('Milestone 3 operational gaps are explicit and are not described as end-to-end proof', () => {
  const document = read('docs/relationship-gist-2/milestone-3-operational-verification-gaps.md');
  assert.match(document, /Deno runtime execution/);
  assert.match(document, /Real OpenAI provider integration/);
  assert.match(document, /Persistent disposable-database lifecycle/);
  assert.match(document, /does not yet have end-to-end operational proof/i);
});
