import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicProfileText,
  extractResponseOutputText,
  hasForbiddenTargetIdentifier,
  hasOnlyWritableProfileFields,
  hasPublicTextUpdate,
  hasValidPromptPayload,
  hasValidPublicTextFieldValues,
  needsSemanticReview,
  removeServerManagedProfileFields,
  removeUnchangedProfileFields,
  resolveGuardConfiguration,
  semanticFailureFallback,
  shouldInvokeSemantic,
} from '../supabase/functions/_shared/profile-guard-policy.ts';

test('feature flags fail safely when the database row is missing', () => {
  assert.deepEqual(resolveGuardConfiguration(null), {
    enabled: true,
    semanticEnabled: false,
    enforcementMode: 'ENFORCE',
    backfillEnabled: false,
  });
});

test('OFF and REPORT_ONLY are recognized only from server configuration', () => {
  assert.equal(resolveGuardConfiguration({ enforcement_mode: 'OFF' }).enforcementMode, 'OFF');
  assert.equal(resolveGuardConfiguration({ enforcement_mode: 'REPORT_ONLY' }).enforcementMode, 'REPORT_ONLY');
  assert.equal(resolveGuardConfiguration({ enforcement_mode: 'unexpected' }).enforcementMode, 'ENFORCE');
});

test('client target identifiers are rejected at either payload level', () => {
  assert.equal(hasForbiddenTargetIdentifier({ user_id: 'victim' }, {}), true);
  assert.equal(hasForbiddenTargetIdentifier({}, { profileId: 'victim' }), true);
  assert.equal(hasForbiddenTargetIdentifier({ updates: {} }, { bio: 'Hello' }), false);
});

test('bridge payload allowlist excludes security and business fields', () => {
  assert.equal(hasOnlyWritableProfileFields({ bio: 'Hello', city: 'Accra' }), true);
  assert.equal(hasOnlyWritableProfileFields({ subscription_tier: 'gold' }), false);
  assert.equal(hasOnlyWritableProfileFields({ profile_moderation_state: 'CLEAR' }), false);
  assert.equal(hasOnlyWritableProfileFields({ verification_level: 10 }), false);
  assert.equal(hasOnlyWritableProfileFields({ user_id: 'victim' }), false);
});

test('server-managed onboarding fields are removed from the write object', () => {
  assert.deepEqual(removeServerManagedProfileFields({
    bio: 'Hello',
    profile_completed: true,
    identity_status: 'active',
    phone_verified: true,
  }), { bio: 'Hello' });
});

test('full profile snapshots retain only fields that actually changed', () => {
  assert.deepEqual(removeUnchangedProfileFields(
    { bio: 'Museum walks', roots: ['African'], min_age_interest: 24 },
    { bio: 'Museum walks', roots: ['African'], min_age_interest: 25 },
  ), { min_age_interest: 25 });
});

test('semantic classification runs for every deterministic-safe public text change', () => {
  const config = resolveGuardConfiguration({
    enabled: true,
    semantic_enabled: true,
    enforcement_mode: 'ENFORCE',
    backfill_enabled: false,
  });
  assert.equal(needsSemanticReview('Ask me about my private page elsewhere'), true);
  assert.equal(needsSemanticReview('I build private banking software'), true);
  assert.equal(hasPublicTextUpdate({ bio: 'A normal dating profile' }), true);
  assert.equal(hasPublicTextUpdate({ city: 'Accra' }), false);
  assert.equal(shouldInvokeSemantic('ALLOW', true, config, true), true);
  assert.equal(shouldInvokeSemantic('REQUIRE_REWRITE', true, config, true), false);
  assert.equal(shouldInvokeSemantic('ALLOW', false, config, true), false);
});

test('complete proposed profile text includes unchanged fields with labels', () => {
  const text = buildPublicProfileText(
    {
      occupation: 'Software Engineer',
      bio: 'Old bio',
      languages_spoken: ['English'],
      relationship_compass: { updatedAt: '2026-09-01T15:04:57.497Z' },
    },
    { bio: 'New bio' },
  );
  assert.match(text, /occupation: Software Engineer/);
  assert.match(text, /bio: New bio/);
  assert.match(text, /languages_spoken: English/);
  assert.match(text, /relationship_compass: \[structured\]/);
  assert.doesNotMatch(text, /2026-09-01/);
});

test('public text and prompt payloads are bounded and type-safe', () => {
  assert.equal(hasValidPublicTextFieldValues({ bio: 'Hello', roots: ['Ghanaian'] }), true);
  assert.equal(hasValidPublicTextFieldValues({ bio: 'x'.repeat(501) }), false);
  assert.equal(hasValidPublicTextFieldValues({ languages_spoken: 'English' }), false);
  assert.equal(hasValidPromptPayload({
    prompt_key: 'weekend', prompt_title: 'A weekend looks like', answer: 'Hiking',
    guess_options: ['Hiking', 'Cooking'], hint_text: 'Outdoors',
  }), true);
  assert.equal(hasValidPromptPayload({
    prompt_key: 'weekend', prompt_title: 'Title', answer: 'x'.repeat(1_001),
  }), false);
});

test('semantic failure policy is mode-aware and fail-safe', () => {
  const enforce = resolveGuardConfiguration({ semantic_enabled: true, enforcement_mode: 'ENFORCE' });
  const report = resolveGuardConfiguration({ semantic_enabled: true, enforcement_mode: 'REPORT_ONLY' });
  const off = resolveGuardConfiguration({ enabled: false, enforcement_mode: 'OFF' });
  assert.equal(semanticFailureFallback('ALLOW', true, enforce), 'REQUIRE_REWRITE');
  assert.equal(semanticFailureFallback('REQUIRE_REWRITE', false, enforce), 'REQUIRE_REWRITE');
  assert.equal(semanticFailureFallback('ALLOW', true, report), 'ALLOW_AND_LOG');
  assert.equal(semanticFailureFallback('ALLOW', true, off), 'ALLOW');
});

test('Responses API structured output is extracted from either supported shape', () => {
  assert.equal(extractResponseOutputText({ output_text: '{"ok":true}' }), '{"ok":true}');
  assert.equal(extractResponseOutputText({
    output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }],
  }), '{"ok":true}');
  assert.equal(extractResponseOutputText({ output: [] }), null);
});
