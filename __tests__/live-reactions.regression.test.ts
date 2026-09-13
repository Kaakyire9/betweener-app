import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  appendLiveReactionBurst,
  isLiveReactionKind,
  MAX_LIVE_REACTION_BURSTS,
  newestLiveReactionSummary,
  parseLiveReactionEvent,
  parseLiveReactionSummary,
} from '../features/live/application/live-reactions.ts';
import type { LiveReactionEvent, LiveReactionSummary } from '../features/live/application/live-models.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260913113000_live_reaction_broadcast.sql', import.meta.url),
  'utf8',
);
const aggregateMigration = readFileSync(
  new URL('../supabase/migrations/20260913130000_live_reaction_aggregate_projection.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);
const picker = readFileSync(
  new URL('../features/live/components/LiveReactionPicker.tsx', import.meta.url),
  'utf8',
);
const layer = readFileSync(
  new URL('../features/live/components/LiveReactionBurstLayer.tsx', import.meta.url),
  'utf8',
);
const glyph = readFileSync(
  new URL('../features/live/components/LiveReactionGlyph.tsx', import.meta.url),
  'utf8',
);
const presentation = readFileSync(
  new URL('../features/live/components/live-reaction-presentation.ts', import.meta.url),
  'utf8',
);
const summaryChip = readFileSync(
  new URL('../features/live/components/LiveReactionSummaryChip.tsx', import.meta.url),
  'utf8',
);
const loader = readFileSync(
  new URL('../components/ui/BetweenerLoader.tsx', import.meta.url),
  'utf8',
);

const reactionSummary = (version = 3): LiveReactionSummary => ({
  sessionId: 'da1d3ec5-071c-4493-a45d-3dd5eef9fc3c',
  totalCount: 3,
  version,
  updatedAt: '2026-09-13T10:00:00.000Z',
  counts: {
    heart: 2,
    spark: 1,
    applause: 0,
    support: 0,
    joy: 0,
    wow: 0,
    insight: 0,
    celebrate: 0,
  },
});

const reactionEvent = (eventId: string, reaction: LiveReactionEvent['reaction'] = 'heart'): LiveReactionEvent => ({
  eventId,
  sessionId: 'da1d3ec5-071c-4493-a45d-3dd5eef9fc3c',
  reaction,
  emittedAt: '2026-09-13T10:00:00.000Z',
});

test('Live exposes a curated, database-constrained reaction vocabulary', () => {
  for (const kind of ['heart', 'spark', 'applause', 'support', 'joy', 'wow', 'insight', 'celebrate']) {
    assert.equal(isLiveReactionKind(kind), true);
    assert.match(migration, new RegExp(`'${kind}'`));
  }
  assert.equal(isLiveReactionKind('arbitrary-emoji'), false);
});

test('Reaction broadcasts are server-authoritative, private and capability-scoped', () => {
  assert.match(migration, /perform realtime\.send\([\s\S]+?'reaction'[\s\S]+?'live-reactions:'[\s\S]+?true/i);
  assert.match(migration, /on realtime\.messages\s+for select\s+to authenticated/i);
  assert.match(migration, /has_live_capability\(v_session_id, 'live\.join', p_user_id\)/i);
  assert.doesNotMatch(migration, /on realtime\.messages\s+for insert/i);
  assert.match(repository, /config: \{ private: true \}/i);
  assert.match(repository, /\.on\('broadcast', \{ event: 'reaction' \}/i);
});

test('Malformed and cross-protocol reaction payloads are rejected', () => {
  assert.equal(parseLiveReactionEvent(null), null);
  assert.equal(parseLiveReactionEvent({ ...reactionEvent('not-a-uuid') }), null);
  assert.equal(parseLiveReactionEvent({ ...reactionEvent('66e82d96-4329-4f98-8544-cf380d21ce5a'), reaction: 'spam' }), null);
  assert.deepEqual(
    parseLiveReactionEvent(reactionEvent('66e82d96-4329-4f98-8544-cf380d21ce5a')),
    reactionEvent('66e82d96-4329-4f98-8544-cf380d21ce5a'),
  );
});

test('Reaction summaries are balanced and converge monotonically across reconnects', () => {
  const current = reactionSummary(3);
  const newer = { ...reactionSummary(4), totalCount: 4, counts: { ...reactionSummary().counts, heart: 3 } };
  assert.deepEqual(parseLiveReactionSummary(current), current);
  assert.equal(parseLiveReactionSummary({ ...current, totalCount: 99 }), null);
  assert.equal(parseLiveReactionSummary({ ...current, version: -1 }), null);
  assert.deepEqual(newestLiveReactionSummary(current, newer), newer);
  assert.deepEqual(newestLiveReactionSummary(newer, current), newer);
  assert.deepEqual(
    parseLiveReactionEvent({
      ...reactionEvent('66e82d96-4329-4f98-8544-cf380d21ce5a'),
      summary: current,
    })?.summary,
    current,
  );
});

test('Durable reaction totals are server projected, anonymous and RPC scoped', () => {
  assert.match(aggregateMigration, /create table public\.live_reaction_totals/i);
  assert.match(aggregateMigration, /after insert on public\.live_reactions/i);
  assert.match(aggregateMigration, /rpc_get_live_reaction_summary/i);
  assert.match(aggregateMigration, /returns jsonb/i);
  assert.match(aggregateMigration, /'summary', public\.live_reaction_summary_payload/i);
  assert.match(aggregateMigration, /revoke select on public\.live_reactions from authenticated/i);
  assert.match(repository, /getReactionSummary[\s\S]*rpc_get_live_reaction_summary/i);
  assert.match(repository, /createReaction[\s\S]*parseLiveReactionEvent/i);
});

test('Reaction bursts coalesce and remain bounded under audience load', () => {
  const first = reactionEvent('66e82d96-4329-4f98-8544-cf380d21ce5a');
  const second = reactionEvent('027ede32-d7db-48ec-96fc-e500b2bca5aa');
  let bursts = appendLiveReactionBurst([], first, 1_000);
  bursts = appendLiveReactionBurst(bursts, second, 1_200);
  assert.equal(bursts.length, 1);
  assert.equal(bursts[0]?.count, 2);

  for (let index = 0; index < MAX_LIVE_REACTION_BURSTS + 8; index += 1) {
    const suffix = index.toString(16).padStart(12, '0');
    bursts = appendLiveReactionBurst(
      bursts,
      reactionEvent(`66e82d96-4329-4f98-8544-${suffix}`, index % 2 ? 'spark' : 'heart'),
      2_000 + index * 500,
    );
  }
  assert.equal(bursts.length, MAX_LIVE_REACTION_BURSTS);
});

test('Reaction UX includes an expanded tray, haptics, reduced motion and a non-interactive stage layer', () => {
  assert.match(picker, /LIVE_MORE_REACTIONS/);
  assert.match(picker, /impactAsync/);
  assert.match(picker, /selectMoreReaction[\s\S]*setMoreOpen\(false\)/);
  assert.match(picker, /tray:\s*\{[^}]*position: 'absolute'[^}]*bottom: 52/);
  assert.match(picker, /hitSlop=\{5\}/);
  assert.match(picker, /reaction:\s*\{[^}]*width: 38[^}]*height: 38/);
  assert.match(picker, /presentation\.accent\}3D/);
  assert.match(picker, /reactionGlow:\s*\{[^}]*width: 24[^}]*height: 24/);
  assert.match(picker, /moreButtonOpen:[^\n]+tealSoft/);
  assert.match(picker, /LiveReactionGlyph/);
  assert.match(picker, /reactionRipple/);
  assert.match(picker, /useReduceMotion/);
  assert.match(layer, /LiveReactionGlyph/);
  assert.match(layer, /BurstGlyphCluster/);
  assert.match(layer, /Math\.min\(burst\.count, 3\)/);
  assert.match(layer, /burst\.count > 3/);
  assert.doesNotMatch(layer, /color="#FFF9F1"/);
  assert.match(layer, /trailDotOne/);
  assert.match(layer, /burst\.count >= 4/);
  assert.match(layer, /surgeFrame/);
  assert.match(glyph, /Readonly<Record<LiveReactionKind, LucideIcon>>/);
  assert.doesNotMatch(presentation, /symbol:/);
  assert.match(layer, /useReduceMotion/);
  assert.match(layer, /pointerEvents="none"/);
  assert.match(layer, /useNativeDriver: true/);
  assert.match(presentation, /heart:[^\n]+#FF809F/);
  assert.match(summaryChip, /Reaction mix/);
  assert.match(summaryChip, /shared anonymously/);
  assert.match(summaryChip, /Animated\.spring/);
  assert.match(summaryChip, /formatLiveReactionCount/);
  assert.doesNotMatch(summaryChip, /styles\.leader,[\s\S]{0,120}backgroundColor/);
  assert.match(loader, /useReduceMotion/);
  assert.match(loader, /\{label \? <Text/);
});
