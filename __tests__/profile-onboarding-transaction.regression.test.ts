import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareProfileGuardInvocation } from '../lib/profile-guard/write-payload.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260905110000_atomic_guarded_profile_onboarding.sql');
const handler = read('../supabase/functions/_shared/profile-guard-handler.ts');
const onboardingEntry = read('../supabase/functions/profile-onboarding-submit/index.ts');
const profileEditEntry = read('../supabase/functions/profile-guard-update/index.ts');
const authContext = read('../lib/auth-context.tsx');
const offlineQueue = read('../lib/offline/mutation-queue.ts');

test('completion payloads route only to the dedicated onboarding endpoint', () => {
  const invocation = prepareProfileGuardInvocation({
    full_name: 'Safe Member',
    profile_completed: true,
    identity_status: 'active',
    phone_verified: true,
  });
  assert.equal(invocation.functionName, 'profile-onboarding-submit');
  assert.deepEqual(invocation.body, { updates: { full_name: 'Safe Member' } });
});

test('ordinary edits remain on the guarded profile-edit endpoint', () => {
  const invocation = prepareProfileGuardInvocation({ bio: 'A safe profile.' });
  assert.equal(invocation.functionName, 'profile-guard-update');
  assert.deepEqual(invocation.body, {
    updates: { bio: 'A safe profile.' },
    complete_onboarding: false,
  });
});

test('mobile and offline replay both use the centralized endpoint selection', () => {
  assert.match(authContext, /prepareProfileGuardInvocation/);
  assert.match(authContext, /guardInvocation\.functionName/);
  assert.match(offlineQueue, /prepareProfileGuardInvocation/);
  assert.match(offlineQueue, /guardInvocation\.functionName/);
});

test('dedicated endpoint reuses the authoritative handler in onboarding-only mode', () => {
  assert.match(onboardingEntry, /handleProfileGuardRequest\(request, \{ requireOnboarding: true \}\)/);
  assert.match(profileEditEntry, /handleProfileGuardRequest\(request\)/);
  assert.match(handler, /authClient\.auth\.getUser\(bearerMatch\[1\]\)/);
  assert.match(handler, /options\.requireOnboarding === true && promptRecord !== null/);
  assert.match(handler, /rpc_service_complete_profile_onboarding_with_guard_v1/);
  assert.doesNotMatch(handler, /rpc_service_finalize_profile_onboarding/);
});

test('atomic RPC locks, guards, completes, and supports safe response-loss retries', () => {
  assert.match(migration, /where user_id = p_user_id\s+for update/i);
  assert.match(migration, /rpc_service_update_profile_with_guard_v3/i);
  assert.match(migration, /if coalesce\(v_profile\.profile_completed, false\)[\s\S]*already_completed/i);
  assert.match(migration, /profile_moderation_state <> 'CLEAR'/i);
  assert.match(migration, /profile_completed = true[\s\S]*identity_status = 'active'/i);
  assert.match(migration, /PROFILE_WRITE_CONFLICT/i);
});

test('atomic RPC is service-only', () => {
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /revoke all on function public\.rpc_service_complete_profile_onboarding_with_guard_v1[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rpc_service_complete_profile_onboarding_with_guard_v1[\s\S]*to service_role/i);
});
