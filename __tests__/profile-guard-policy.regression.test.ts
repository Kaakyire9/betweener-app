import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractResponseOutputText,
  hasForbiddenTargetIdentifier,
  hasOnlyWritableProfileFields,
  needsSemanticReview,
  removeServerManagedProfileFields,
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

test('semantic classification runs only for deterministic-safe ambiguous text', () => {
  const config = resolveGuardConfiguration({
    enabled: true,
    semantic_enabled: true,
    enforcement_mode: 'ENFORCE',
    backfill_enabled: false,
  });
  assert.equal(needsSemanticReview('Ask me about my private page elsewhere'), true);
  assert.equal(needsSemanticReview('I build private banking software'), false);
  assert.equal(shouldInvokeSemantic('ALLOW', 'Ask me about my private page elsewhere', config, true), true);
  assert.equal(shouldInvokeSemantic('REQUIRE_REWRITE', '+44 7000 000000', config, true), false);
  assert.equal(shouldInvokeSemantic('ALLOW', 'A normal dating profile', config, true), false);
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
