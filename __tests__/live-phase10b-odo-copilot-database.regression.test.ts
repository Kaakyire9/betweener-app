import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260908100000_live_odo_phase10b_copilot.sql', 'utf8',
);
const completionMigration = readFileSync(
  'supabase/migrations/20260908110000_live_odo_phase10b_operational_completion.sql', 'utf8',
);
const edge = readFileSync('supabase/functions/live-odo-copilot/index.ts', 'utf8');
const studio = readFileSync('features/live/components/LiveStudioModal.tsx', 'utf8');
const liveRoom = readFileSync('app/live/[sessionId].tsx', 'utf8');
const health = readFileSync('supabase/verification/live_odo_phase10b_health.sql', 'utf8');

test('Phase 10B is off by default and keeps autopilot and music disabled', () => {
  assert.match(migration, /pair_narration_enabled boolean not null default false/i);
  assert.match(migration, /scene_suggestions_enabled boolean not null default false/i);
  assert.match(migration, /transition_copy_enabled boolean not null default false/i);
  assert.match(migration, /live_odo_phase10b_human_loop_invariant[\s\S]*not autopilot_enabled[\s\S]*not music_enabled/i);
});

test('suggestions are private, expiring, version-fenced and not direct-writable', () => {
  assert.match(migration, /create table(?: if not exists)? public\.live_odo_copilot_suggestions/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /session_version bigint not null/i);
  assert.match(migration, /state_version bigint not null/i);
  assert.match(migration, /round_version bigint/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.live_odo_copilot_suggestions[\s\S]*authenticated/i);
  assert.match(migration, /revoke all on table public\.live_odo_copilot_suggestions[\s\S]*service_role/i);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete)[^;]*live_odo_copilot_suggestions/i);
});

test('only the Host use RPC can turn a suggestion into participant-visible state', () => {
  const useBody = migration.match(/create or replace function public\.rpc_use_live_odo_copilot_suggestion_v1[\s\S]*?\n\$\$;/i)?.[0] ?? '';
  assert.match(useBody, /live\.view_host_console/i);
  assert.match(useBody, /suggestion\.expires_at <= v_now/i);
  assert.match(useBody, /session\.version <> v_suggestion\.session_version/i);
  assert.match(useBody, /state\.state_version <> v_suggestion\.state_version/i);
  assert.match(useBody, /content_gate_reason_code not in/i);
  assert.match(useBody, /live_odo_append_host_copilot_event_v1/i);
  assert.match(migration, /p_event_type, 'host', 'participant'/i);
  assert.doesNotMatch(useBody, /source\s*=\s*'odo'/i);
  assert.match(useBody, /if v_event_type is not null then[\s\S]*live_odo_append_host_copilot_event_v1/i);
});

test('pair context excludes private Quick Connect rounds and reuses scoped projections', () => {
  const contextBody = migration.match(/create or replace function public\.live_odo_build_copilot_context_v1[\s\S]*?\n\$\$;/i)?.[0] ?? '';
  const useBody = migration.match(/create or replace function public\.rpc_use_live_odo_copilot_suggestion_v1[\s\S]*?\n\$\$;/i)?.[0] ?? '';
  assert.doesNotMatch(contextBody, /live_quick_connect_pairings/i);
  assert.match(contextBody, /p_task = 'pair_narration'[\s\S]*v_round_state <> 'public_introduction'/i);
  assert.match(useBody, /existing round projection is pair-scoped/i);
  assert.match(useBody, /Audience Pulse owns its bounded aggregate projection/i);
});

test('Edge request cannot supply models, prompts, profiles or arbitrary actions', () => {
  assert.match(edge, /\['sessionId', 'task', 'roundId'\]/i);
  assert.doesNotMatch(edge, /body\.(model|provider|prompt|profile|action)/i);
  assert.match(edge, /router\.route\(body\.task, 'routine'\)/i);
  assert.doesNotMatch(edge, /route\([^\n]*'complex'/i);
  assert.doesNotMatch(edge, /service\.from\(/i);
});

test('Studio exposes Odo only when the server state enables Copilot', () => {
  assert.match(studio, /hasOdoCopilot = odo\.state\?\.enabled === true/i);
  assert.match(studio, /hasOdo \? \['odo' as const\]/i);
  assert.match(studio, /<OdoCopilotPanel controller=\{odo\}/i);
  assert.match(studio, /studioRefreshing = refreshing \|\| odo\.loading \|\| autopilot\.loading/i);
  assert.match(studio, /void odo\.refresh\(\)/i);
  assert.match(health, /odo_tab_should_show/i);
  assert.match(health, /scene_button_should_show/i);
});

test('authoritative scene state drives only the predefined client renderer', () => {
  assert.match(liveRoom, /useLiveDirectorEvents\(sessionId, isLive\)/i);
  assert.match(liveRoom, /director\.snapshot\?\.currentScene/i);
  assert.match(liveRoom, /ODO_COPILOT_SCENES\.includes/i);
  assert.match(liveRoom, /scene=\{odoStageScene\}/i);
});

test('operational completion bootstraps hybrid state and fences stage changes', () => {
  const getter = completionMigration.match(
    /create or replace function public\.rpc_get_live_odo_copilot_v1[\s\S]*?\n\$\$;/i,
  )?.[0] ?? '';
  assert.match(getter, /insert into public\.live_odo_session_state\(session_id\)/i);
  assert.match(completionMigration, /live_odo_session_initial_direction_mode/i);
  assert.match(completionMigration, /new\.direction_mode := 'hybrid'/i);
  assert.match(completionMigration, /live_odo_participant_stage_composition_fence/i);
  assert.match(completionMigration, /stage_composition_changed/i);
});

test('scene context separates stage composition and has a non-no-op fallback', () => {
  const context = completionMigration.match(
    /create or replace function public\.live_odo_build_copilot_context_v1[\s\S]*?\n\$\$;/i,
  )?.[0] ?? '';
  assert.match(context, /'onStageParticipantCount', v_on_stage_count/i);
  assert.match(context, /v_on_stage_count >= 3[\s\S]*v_scene := 'COMMUNITY_WIDE'/i);
  assert.match(completionMigration, /v_target_scene = v_current_scene[\s\S]*new\.suggestion_type := 'no_action'/i);
});
