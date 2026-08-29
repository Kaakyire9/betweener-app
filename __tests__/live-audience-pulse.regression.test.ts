import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  parseLiveAudiencePoll,
  parseLiveAudiencePulseSnapshot,
} from '../features/live/application/live-parsers.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260821130000_live_phase5_audience_pulse.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);
const controller = readFileSync(
  new URL('../features/live/hooks/use-live-session-controller.ts', import.meta.url),
  'utf8',
);
const card = readFileSync(
  new URL('../features/live/components/LiveAudiencePulseCard.tsx', import.meta.url),
  'utf8',
);
const conversationPanel = readFileSync(
  new URL('../features/live/components/LiveConversationPanel.tsx', import.meta.url),
  'utf8',
);

test('Audience Pulse accepts only curated server-owned conversation prompts', () => {
  assert.match(migration, /live_audience_poll_templates/);
  assert.match(migration, /What should the host ask next\?/);
  assert.match(migration, /Would you relocate for the right relationship\?/);
  assert.doesNotMatch(migration, /rpc_open_live_audience_poll\([\s\S]{0,250}p_prompt/i);
  assert.match(migration, /where template\.template_key = p_template_key and template\.enabled/i);
  assert.match(card, /never a romantic decision/i);
  assert.doesNotMatch(card, /top gifter|leaderboard|who should date|attractiveness|who won/i);
});

test('Ballots are private, immutable and idempotent at the database boundary', () => {
  assert.match(migration, /primary key \(poll_id, user_id\)/i);
  assert.match(migration, /unique \(poll_id, user_id, client_vote_id\)/i);
  assert.match(migration, /foreign key \(poll_id, option_id\)[\s\S]+references public\.live_audience_poll_options\(poll_id, id\)/i);
  assert.match(migration, /live_audience_poll_vote_locked/i);
  assert.match(migration, /on conflict \(poll_id, user_id\) do nothing/i);
  assert.match(migration, /revoke all on table[\s\S]+public\.live_audience_poll_votes[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /create policy [^\n]*vote/i);
});

test('Only one poll can be open and realtime publishes aggregate invalidations', () => {
  assert.match(migration, /unique index live_audience_polls_one_open_per_session[\s\S]+where state = 'open'/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /Repeat the idempotency lookup after[\s\S]+client_request_id = p_client_request_id/i);
  assert.match(migration, /live_audience_poll_already_open/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.live_audience_poll_updates/i);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.live_audience_poll_votes/i);
  assert.match(repository, /table: 'live_audience_poll_updates'/);
  assert.match(controller, /event === 'pulse' \? schedulePulseRefresh\(\) : scheduleStructuralRefresh\(\)/);
});

test('Audience Pulse parsing preserves deterministic option order and aggregate results', () => {
  const poll = parseLiveAudiencePoll({
    id: 'poll-1',
    session_id: 'session-1',
    template_key: 'room_relocation',
    poll_kind: 'room_poll',
    prompt: 'Would you relocate for the right relationship?',
    state: 'open',
    opened_at: '2026-08-21T10:00:00Z',
    closes_at: '2026-08-21T10:01:30Z',
    closed_at: null,
    total_votes: 3,
    my_option_id: 'option-2',
    options: [
      { id: 'option-1', option_index: 0, label: 'Yes', vote_count: 2, percentage: 67 },
      { id: 'option-2', option_index: 1, label: 'Maybe', vote_count: 1, percentage: 33 },
    ],
  });
  assert.equal(poll.options[0]?.label, 'Yes');
  assert.equal(poll.options[1]?.label, 'Maybe');
  assert.equal(poll.myOptionId, 'option-2');

  const empty = parseLiveAudiencePulseSnapshot(null);
  assert.deepEqual(empty, { canManage: false, templates: [], activePoll: null, recentPoll: null });
});

test('Audience Pulse actions use idempotency keys and refresh only Room Pulse', () => {
  assert.match(repository, /p_client_request_id: Crypto\.randomUUID\(\)/);
  assert.match(repository, /p_client_vote_id: Crypto\.randomUUID\(\)/);
  assert.match(repository, /rpc_close_live_audience_poll/);
  assert.match(controller, /await refreshRoomPulse\(\)/);
  assert.match(controller, /refreshAfter: false/);
});

test('Audience Pulse no longer occupies the public comment surface', () => {
  assert.match(card, /presentation\?: 'compact' \| 'studio' \| 'trigger'/);
  assert.match(card, /if \(presentation === 'trigger'\)/);
  assert.match(card, /if \(!activePoll\) return null/);
  assert.match(conversationPanel, /presentation="trigger"/);
  assert.doesNotMatch(conversationPanel, /presentation="compact"/);
});
