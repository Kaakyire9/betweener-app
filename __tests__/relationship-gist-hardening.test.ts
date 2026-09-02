import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRelationshipGistReaderContent,
  buildVisibleRelationshipGistPerspectives,
  calculateRelationshipGistProgress,
  getRelationshipGistReadTimeLabel,
} from '../features/relationship-gists/domain/relationship-gist.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('global Gist authority excludes legacy Circle records and returns one current item per perspective', () => {
  const migration = read('supabase/migrations/20260831130000_relationship_gist_hardening.sql');
  assert.match(migration, /rpc_get_global_relationship_gists/);
  assert.match(migration, /gist\.circle_id is null/);
  assert.match(migration, /partition by gist\.perspective/);
  assert.match(migration, /scheduled_for is null or gist\.scheduled_for <=/);
  assert.match(migration, /relationship_gist_user_states_select_own/);
  assert.match(migration, /viewer\.user_id = auth\.uid\(\)/);
});

test('reader preserves editorial paragraphs without inventing headings or duplicating takeaway', () => {
  const content = buildRelationshipGistReaderContent({
    id: 'gist-1',
    title: 'Clear beginnings',
    short_body: 'Clarity is kindness.',
    body: 'Notice consistency before chemistry.\n\nBoundaries: Name what steadiness means to you.\n\nTakeaway: Let actions carry the promise.',
  }, 'general');

  assert.equal(content.lead, 'Clarity is kindness.');
  assert.equal(content.sections.length, 2);
  assert.equal(content.sections[0].title, null);
  assert.equal(content.sections[1].title, 'Boundaries');
  assert.equal(content.takeaway, 'Let actions carry the promise.');
  assert.equal(content.sections.some((section) => section.body === content.takeaway), false);
});

test('short Gists complete without scrolling and long Gists track clamped progress', () => {
  assert.equal(calculateRelationshipGistProgress({ offsetY: 0, contentHeight: 500, viewportHeight: 600 }), 1);
  assert.equal(calculateRelationshipGistProgress({ offsetY: 200, contentHeight: 1000, viewportHeight: 600 }), 0.5);
  assert.equal(calculateRelationshipGistProgress({ offsetY: 900, contentHeight: 1000, viewportHeight: 600 }), 1);
});

test('read time counts article body once and perspective visibility respects profile context', () => {
  const body = Array.from({ length: 181 }, () => 'word').join(' ');
  assert.equal(getRelationshipGistReadTimeLabel({ body }), '2 min read');
  assert.deepEqual(
    buildVisibleRelationshipGistPerspectives(['general', 'christian', 'muslim', 'safety'], 'Christian'),
    ['christian', 'general', 'safety'],
  );
});

test('Gist UI has no nested preview scroller and exposes accessible reader controls', () => {
  const homeCards = read('components/circles/CirclesHomeCards.tsx');
  const circlesHome = read('app/(tabs)/explore.tsx');
  assert.match(homeCards, /gistPreviewShell/);
  assert.doesNotMatch(homeCards, /nestedScrollEnabled/);
  assert.match(homeCards, /accessibilityLabel=\{saved \? 'Remove Relationship Gist from saved'/);
  assert.match(circlesHome, /calculateRelationshipGistProgress/);
  assert.match(circlesHome, /accessibilityLabel="Share Relationship Gist"/);
  assert.match(circlesHome, /reduceMotionEnabled/);
  assert.doesNotMatch(circlesHome, /rpc_create_circle_relationship_gist/);
});
