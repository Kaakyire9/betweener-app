import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRelationshipGistReaderContent,
  buildVisibleRelationshipGistPerspectives,
  calculateRelationshipGistProgress,
  calculateRelationshipGistReaderProgress,
  findRelationshipGistReadingAnchor,
  getRelationshipGistReadTimeLabel,
  resolveRelationshipGistResumeOffset,
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

test('v2 completion separates scroll, acknowledgement, and reading duration', () => {
  assert.deepEqual(calculateRelationshipGistReaderProgress({
    offsetY: 0,
    contentHeight: 500,
    viewportHeight: 600,
    previousProgress: 0,
    layoutReady: true,
  }), {
    progress: 0,
    scrollCompleted: false,
    needsReadAcknowledgement: true,
  });
  assert.deepEqual(calculateRelationshipGistReaderProgress({
    offsetY: 0,
    contentHeight: 500,
    viewportHeight: 600,
    previousProgress: 0,
    layoutReady: true,
    readAcknowledged: true,
  }), {
    progress: 1,
    scrollCompleted: false,
    needsReadAcknowledgement: false,
  });
  assert.deepEqual(calculateRelationshipGistReaderProgress({
    offsetY: 400,
    contentHeight: 1000,
    viewportHeight: 600,
    previousProgress: 0.25,
    layoutReady: true,
  }), {
    progress: 1,
    scrollCompleted: true,
    needsReadAcknowledgement: false,
  });
});

test('reader resume prefers a stable section anchor and falls back to progress', () => {
  const offsets = { lead: 0, boundaries: 420, takeaway: 900 };
  assert.deepEqual(findRelationshipGistReadingAnchor(470, offsets), ['boundaries', 420]);
  assert.equal(resolveRelationshipGistResumeOffset({
    anchor: 'boundaries',
    anchorOffset: 35,
    progress: 0.2,
    sectionOffsets: offsets,
    contentHeight: 1400,
    viewportHeight: 600,
  }), 455);
  assert.equal(resolveRelationshipGistResumeOffset({
    anchor: null,
    anchorOffset: null,
    progress: 0.5,
    sectionOffsets: {},
    contentHeight: 1400,
    viewportHeight: 600,
  }), 400);
  assert.equal(resolveRelationshipGistResumeOffset({
    anchor: 'not-laid-out',
    anchorOffset: 0,
    progress: 0.5,
    sectionOffsets: offsets,
    contentHeight: 1400,
    viewportHeight: 600,
  }), null);
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
  assert.match(circlesHome, /calculateRelationshipGistReaderProgress/);
  assert.match(circlesHome, /accessibilityLabel="Share Relationship Gist"/);
  assert.match(circlesHome, /reduceMotionEnabled/);
  assert.doesNotMatch(circlesHome, /rpc_create_circle_relationship_gist/);
});

test('Gist reader keeps only compact actions fixed and makes saved state visually explicit', () => {
  const circlesHome = read('app/(tabs)/explore.tsx');
  const readerStart = circlesHome.indexOf('<Modal visible={gistReaderOpen}');
  const readerScroll = circlesHome.indexOf('<Animated.ScrollView', readerStart);
  const readerTitle = circlesHome.indexOf('<Text style={styles.readerTitle}>', readerStart);
  const readerMetaStart = circlesHome.indexOf('<View style={styles.readerMetaRow}>', readerStart);
  const readerMetaEnd = circlesHome.indexOf('{gistSyncIssue ?', readerMetaStart);

  assert.ok(readerStart >= 0 && readerScroll > readerStart);
  assert.ok(readerTitle > readerScroll, 'the full title should scroll away instead of occupying a fixed header');
  assert.match(circlesHome, /currentGistLocalState\?\.saved && styles\.readerActionButtonActive/);
  assert.match(circlesHome, /currentGistLocalState\?\.saved \? theme\.tint : theme\.text/);
  assert.doesNotMatch(circlesHome.slice(readerMetaStart, readerMetaEnd), /tune-variant/);
});

test('Gist reader starts with a short version and progressively reveals full guidance', () => {
  const circlesHome = read('app/(tabs)/explore.tsx');

  assert.match(circlesHome, /useState\(false\).*gistReaderExpanded|gistReaderExpanded.*useState\(false\)/s);
  assert.match(circlesHome, /accessibilityState=\{\{ expanded: gistReaderExpanded \}\}/);
  assert.match(circlesHome, /The short Gist/);
  assert.match(circlesHome, /gistReaderExpanded \? \(\s*<>/);
  assert.match(circlesHome, /setGistReaderExpanded\(false\)/);
});

test('dedicated Gist editor remains isolated behind its compatibility wrapper', () => {
  const editorialRoute = read('app/admin-editorial.tsx');

  assert.match(editorialRoute, /RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED/);
  assert.match(editorialRoute, /RelationshipGistEditorialV2Workspace/);
  assert.match(editorialRoute, /LegacyAdminEditorialScreen/);
  assert.match(editorialRoute, /capability="editorial"/);
});

test('Creator Studio makes Editorial 2.0 and AI-assisted drafting discoverable', () => {
  const creatorStudio = read('app/circles/manage.tsx');
  const editorialWorkspace = read('features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx');

  assert.match(creatorStudio, /router\.push\('\/admin-editorial'\)/);
  assert.match(creatorStudio, /accessibilityLabel="Open Relationship Gist Editorial Studio"/);
  assert.match(editorialWorkspace, /RELATIONSHIP_GIST_AI_STUDIO_ENABLED/);
  assert.match(editorialWorkspace, /RelationshipGistAIStudio/);
});
