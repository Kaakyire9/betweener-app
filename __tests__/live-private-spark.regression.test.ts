import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseLiveMediaAdmission } from '../features/live/media/live-media-admission.ts';
import {
  formatLivePrivateSparkRemainingTime,
  getLivePrivateSparkRemainingSeconds,
} from '../features/live/hooks/use-live-private-spark-countdown.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260816120000_live_private_spark_handoff.sql', import.meta.url),
  'utf8',
);
const participantTransitionFix = readFileSync(
  new URL('../supabase/migrations/20260816150000_fix_live_private_spark_participant_transition.sql', import.meta.url),
  'utf8',
);
const profileBindingFix = readFileSync(
  new URL('../supabase/migrations/20260816173000_fix_live_private_spark_profile_binding.sql', import.meta.url),
  'utf8',
);
const privateAdmissionIndependenceFix = readFileSync(
  new URL('../supabase/migrations/20260816180000_decouple_private_spark_from_public_presence.sql', import.meta.url),
  'utf8',
);
const privateAdmissionAmbiguityFix = readFileSync(
  new URL('../supabase/migrations/20260816184500_fix_private_spark_admission_column_ambiguity.sql', import.meta.url),
  'utf8',
);
const privateExperienceProjection = readFileSync(
  new URL('../supabase/migrations/20260816200000_private_spark_experience_projection.sql', import.meta.url),
  'utf8',
);
const privateExitDecisions = readFileSync(
  new URL('../supabase/migrations/20260816210000_private_spark_exit_decisions.sql', import.meta.url),
  'utf8',
);
const privateSparkChatOrigin = readFileSync(
  new URL('../supabase/migrations/20260821100000_live_private_spark_chat_origin.sql', import.meta.url),
  'utf8',
);
const tokenFunction = readFileSync(
  new URL('../supabase/functions/live-private-spark-token/index.ts', import.meta.url),
  'utf8',
);
const controlFunction = readFileSync(
  new URL('../supabase/functions/live-private-spark-control/index.ts', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);
const panel = readFileSync(
  new URL('../features/live/components/LiveHostedMatchingPanel.tsx', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/live/private-spark/[privateSparkId].tsx', import.meta.url),
  'utf8',
);
const publicRoute = readFileSync(
  new URL('../app/live/[sessionId].tsx', import.meta.url),
  'utf8',
);
const exitExperience = readFileSync(
  new URL('../features/live/components/LivePrivateSparkExitExperience.tsx', import.meta.url),
  'utf8',
);

test('completing a public introduction creates an idempotent private offer, not automatic admission', () => {
  assert.match(migration, /match_round_id uuid not null unique/i);
  assert.match(migration, /insert into public\.live_private_sparks/i);
  assert.match(migration, /on conflict\(match_round_id\) do nothing/i);
  const completion = migration.match(
    /elsif p_target_state='completed'[\s\S]+?elsif p_target_state='cancelled'/i,
  )?.[0] ?? '';
  assert.match(completion, /state='completed'/i);
  assert.match(completion, /private_spark_consent_requested/i);
  assert.match(completion, /set open_to_introductions=false/i);
  assert.doesNotMatch(completion, /state='active'/i);
});

test('private consent is immutable, participant-only and activates only with two available acceptances', () => {
  assert.match(migration, /unique \(private_spark_id,user_id\)/i);
  assert.match(migration, /live_private_spark_response_participant_guard/i);
  assert.match(migration, /if v_existing<>v_decision then/i);
  assert.match(migration, /if v_accepted=2 then/i);
  assert.match(migration, /if v_available<>2 then/i);
  assert.match(migration, /state='private_spark'/i);
  assert.doesNotMatch(migration, /create policy[^;]+live_private_spark_responses/is);
});

test('the active participant guard admits every state accepted by Private Spark activation', () => {
  assert.match(participantTransitionFix, /create or replace function public\.enforce_live_participant_transition\(\)/i);
  for (const sourceState of [
    'audience',
    'on_stage',
    'backstage',
    'stage_requested',
    'temporarily_disconnected',
  ]) {
    assert.match(
      participantTransitionFix,
      new RegExp(`old\\.state = '${sourceState}'[^\\n]+private_spark`, 'i'),
    );
  }
  assert.match(
    participantTransitionFix,
    /drop function if exists public\.enforce_live_participant_state_transition\(\)/i,
  );
});

test('overlapping private rooms are serialized and rejected at the database boundary', () => {
  assert.match(migration, /live_private_spark_availability_guard/i);
  assert.match(migration, /live_private_spark_participant_busy/i);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]+least\(v_round\.participant_a_user_id,v_round\.participant_b_user_id\)/i);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]+greatest\(v_round\.participant_a_user_id,v_round\.participant_b_user_id\)/i);
});

test('private transport admits exactly the accepted pair and never the host', () => {
  assert.match(migration, /auth\.uid\(\) not in \(v_spark\.participant_a_user_id,v_spark\.participant_b_user_id\)/i);
  assert.match(migration, /array\['live\.join','live\.publish','live\.report','live\.block'\]/i);
  assert.match(migration, /array\[v_spark\.participant_a_user_id,v_spark\.participant_b_user_id\]/i);
  assert.match(tokenFunction, /admission\.maximum_participants !== 2/i);
  assert.match(tokenFunction, /members: admission\.participant_user_ids\.map/i);
  assert.match(tokenFunction, /settings_override: \{ limits: \{ max_participants: 2 \} \}/i);
  assert.match(tokenFunction, /call_cids: \[callCid\]/i);
  assert.match(tokenFunction, /\[live-private-spark-token\] admission-denied/i);
  assert.match(tokenFunction, /safeAdmissionDenialCode\(error\.message\)/i);
  assert.match(tokenFunction, /live_private_spark_admission_contract_invalid/i);
  assert.match(tokenFunction, /databaseReason: error\.message/i);
});

test('private transport binds admission to the exact accepted profile', () => {
  assert.match(
    profileBindingFix,
    /v_expected_profile_id := case[\s\S]+participant_a_profile_id[\s\S]+participant_b_profile_id/i,
  );
  assert.match(
    profileBindingFix,
    /where id = v_expected_profile_id[\s\S]+and user_id = auth\.uid\(\)/i,
  );
  assert.doesNotMatch(
    profileBindingFix,
    /from public\.profiles\s+where user_id\s*=\s*auth\.uid\(\)\s+limit 1/i,
  );
});

test('private transport is authorized by Spark consent, not mutable public-room presence', () => {
  assert.match(
    privateAdmissionIndependenceFix,
    /count\(distinct response\.user_id\)[\s\S]+response\.decision = 'accepted'/i,
  );
  assert.match(
    privateAdmissionIndependenceFix,
    /if v_accepted_participants <> 2 then/i,
  );
  assert.match(
    privateAdmissionIndependenceFix,
    /live_private_spark_consent_incomplete/i,
  );
  assert.doesNotMatch(
    privateAdmissionIndependenceFix,
    /from public\.live_participants/i,
  );
  assert.doesNotMatch(
    privateAdmissionIndependenceFix,
    /live_private_spark_participant_state_invalid/i,
  );
});

test('private admission qualifies columns that collide with table output names', () => {
  assert.match(
    privateAdmissionAmbiguityFix,
    /from public\.profiles as profile_record[\s\S]+profile_record\.user_id = auth\.uid\(\)/i,
  );
  assert.match(
    privateAdmissionAmbiguityFix,
    /count\(distinct response_record\.user_id\)/i,
  );
  assert.doesNotMatch(
    privateAdmissionAmbiguityFix,
    /from public\.profiles\s+where[\s\S]+\buser_id\s*=\s*auth\.uid\(\)/i,
  );
});

test('the private RTC contract is accepted only by the private parser path', () => {
  const admission = {
    apiKey: 'stream-key',
    token: 'signed-token-with-safe-length',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    sessionId: '11111111-1111-4111-8111-111111111111',
    user: { id: '22222222-2222-4222-8222-222222222222' },
    call: {
      provider: 'stream' as const,
      type: 'betweener_live',
      id: 'private_11111111111141118111111111111111',
      cid: 'betweener_live:private_11111111111141118111111111111111',
    },
    primaryRole: 'audience' as const,
    roles: ['audience'],
    capabilities: ['live.join', 'live.publish'],
    participantState: 'private_spark' as const,
    sessionStatus: 'live' as const,
  };
  assert.throws(() => parseLiveMediaAdmission(admission), /live_media_admission_authority_invalid/);
  assert.equal(
    parseLiveMediaAdmission(admission, { allowPrivateSpark: true }).participantState,
    'private_spark',
  );
});

test('client refreshes the composed snapshot and exposes a dedicated private room route', () => {
  assert.match(repository, /if \(targetState === 'completed'\)[\s\S]+getHostedMatching\(sessionId\)/i);
  assert.match(panel, /Your answer stays private/i);
  assert.match(panel, /Only the two of you can enter/i);
  assert.match(route, /requestLivePrivateSparkAdmission/i);
  assert.match(route, /mode: 'private_spark'/i);
  assert.match(route, /constrainMultiStage/i);
  assert.match(route, /if \(!spark \|\| !spark\.isParticipant\)/i);
  assert.match(publicRoute, /privateSpark\?\.state !== 'active'/i);
  assert.match(publicRoute, /await media\.leave\(\)[\s\S]+private-spark/i);
  assert.match(publicRoute, /if \(privateSparkHandoffRef\.current\) return/i);
  assert.match(route, /returnMediaIntentRef/i);
  assert.match(route, /startAudio: audioEnabled \? '1' : '0'/i);
  assert.match(route, /startVideo: videoEnabled \? '1' : '0'/i);
});

test('ending a Spark revokes database admission and terminates the provider call', () => {
  assert.match(repository, /functions\.invoke\('live-private-spark-control'/i);
  assert.match(controlFunction, /rpc_end_live_private_spark/i);
  assert.match(controlFunction, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(controlFunction, /\.call\(providerState\.provider_call_type, providerState\.provider_call_id\)/i);
  assert.match(controlFunction, /\.end\(\)/i);
  assert.match(controlFunction, /providerSyncPending: true/i);
});

test('private room countdown is deterministic and never becomes negative', () => {
  assert.equal(
    getLivePrivateSparkRemainingSeconds('2026-08-16T10:01:01.000Z', Date.parse('2026-08-16T10:00:00.000Z')),
    61,
  );
  assert.equal(
    getLivePrivateSparkRemainingSeconds('2026-08-16T09:59:59.000Z', Date.parse('2026-08-16T10:00:00.000Z')),
    0,
  );
  assert.equal(formatLivePrivateSparkRemainingTime(61), '1:01');
});

test('Private Spark projects a consent-safe Conversation Spark without private media', () => {
  assert.match(privateExperienceProjection, /round\.conversation_spark/i);
  assert.match(privateExperienceProjection, /'conversation_spark',v_conversation_spark/i);
  assert.doesNotMatch(privateExperienceProjection, /media_url|recording_url|transcript_text/i);
});

test('post-Spark choices are server-private, immutable and idempotent', () => {
  assert.match(privateExitDecisions, /enable row level security/i);
  assert.match(
    privateExitDecisions,
    /revoke all on table public\.live_private_spark_exit_responses from public, anon, authenticated/i,
  );
  assert.match(privateExitDecisions, /primary key \(private_spark_id,user_id\)/i);
  assert.match(privateExitDecisions, /if v_existing<>p_decision then/i);
  assert.match(privateExitDecisions, /return public\.live_private_spark_projection\(v_spark\.id\)/i);
  assert.doesNotMatch(privateExitDecisions, /'other_exit_decision'/i);
});

test('only two continue choices open the existing match and chat pipeline', () => {
  assert.match(privateExitDecisions, /if v_continue_count=2 and not v_blocked then/i);
  assert.match(privateExitDecisions, /insert into public\.matches\(user1_id,user2_id,status\)/i);
  assert.match(privateExitDecisions, /set status='ACCEPTED'/i);
  assert.match(privateExitDecisions, /live_private_spark_mutual/i);
  assert.match(privateExitDecisions, /system_messages_private_spark_mutual_unique/i);
  assert.match(privateExitDecisions, /on conflict do nothing/i);
  assert.match(route, /pathname: '\/chat\/\[id\]'/i);
});

test('mutual chat receives a server-authored Live origin story without private decisions', () => {
  assert.match(privateSparkChatOrigin, /before insert on public\.system_messages/i);
  assert.match(privateSparkChatOrigin, /Hosted on Betweener Live/i);
  assert.match(privateSparkChatOrigin, /live_session_title/i);
  assert.match(privateSparkChatOrigin, /origin_type', 'private_spark'/i);
  assert.doesNotMatch(privateSparkChatOrigin, /exit_responses|response\.decision|p_decision/i);
});

test('the post-call screen never exposes rejection or the other private choice', () => {
  assert.match(exitExperience, /How did that connection feel\?/i);
  assert.match(exitExperience, /We will only reveal a mutual connection/i);
  assert.match(exitExperience, /Neither person’s private choice will be shared/i);
  assert.doesNotMatch(exitExperience, /they (declined|rejected)|their (answer|decision) was/i);
});
