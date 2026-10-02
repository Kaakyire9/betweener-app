import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  evaluatePushTokenCompatibility,
  INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
  isSemanticVersionAtLeast,
  LIVE_ROUTING_MINIMUM_APP_VERSION,
  selectCompatiblePushTokensForDelivery,
} from '../supabase/functions/_shared/push-notification-compatibility.ts'

const LIVE_UNICAST_TYPES = [
  'live_rescheduled',
  'live_cancelled',
  'live_quick_connect_opportunity',
  'live_quick_connect_ready',
  'live_host_assigned',
  'live_host_revoked',
] as const

LIVE_UNICAST_TYPES.forEach((notificationType) => {
  test(`${notificationType} requires a valid v1.2.0-or-newer token version`, () => {
    assert.deepEqual(evaluatePushTokenCompatibility(notificationType, '1.1.1'), {
      compatible: false,
      minimumAppVersion: LIVE_ROUTING_MINIMUM_APP_VERSION,
      reason: INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
    })
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.2.0').compatible, true)
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.10.0').compatible, true)
    assert.equal(evaluatePushTokenCompatibility(notificationType, '2.0.0').compatible, true)
    assert.equal(evaluatePushTokenCompatibility(notificationType, undefined).compatible, false)
    assert.equal(evaluatePushTokenCompatibility(notificationType, null).compatible, false)
    assert.equal(evaluatePushTokenCompatibility(notificationType, '').compatible, false)
    assert.equal(evaluatePushTokenCompatibility(notificationType, 'not-a-version').compatible, false)
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.2').compatible, false)
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.2.0-beta.1').compatible, false)
  })
})

test('Live campaigns use the same compatibility policy as Live unicast notifications', () => {
  for (const notificationType of ['live_starting_soon', 'live_now']) {
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.1.1').compatible, false)
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.2.0').compatible, true)
    assert.equal(evaluatePushTokenCompatibility(notificationType, undefined).compatible, false)
  }
})

test('v1.1.1-compatible notification families remain deliverable without a version gate', () => {
  const legacyTypes = [
    'message',
    'message_reaction',
    'match',
    'circle_invitation',
    'intent_request',
    'moment_post',
    'profile_reaction',
    'system_message',
  ]
  for (const notificationType of legacyTypes) {
    assert.equal(evaluatePushTokenCompatibility(notificationType, '1.1.1').compatible, true)
    assert.equal(evaluatePushTokenCompatibility(notificationType, undefined).compatible, true)
  }
})

test('semantic comparison is numeric and treats prereleases as older than the stable release', () => {
  assert.equal(isSemanticVersionAtLeast('1.10.0', '1.2.0'), true)
  assert.equal(isSemanticVersionAtLeast('1.2.0+42', '1.2.0'), true)
  assert.equal(isSemanticVersionAtLeast('1.2.0-rc.1', '1.2.0'), false)
  assert.equal(isSemanticVersionAtLeast('1.02.0', '1.2.0'), false)
  assert.equal(isSemanticVersionAtLeast('1.2', '1.2.0'), false)
  assert.equal(
    isSemanticVersionAtLeast(
      '1.2.0-beta.10000000000000000000000000000000000000000000000000',
      '1.2.0-beta.9999999999999999999999999999999999999999999999999',
    ),
    true,
  )
  assert.deepEqual(evaluatePushTokenCompatibility('live_now', '1.1.1', '1.1.0'), {
    compatible: false,
    minimumAppVersion: LIVE_ROUTING_MINIMUM_APP_VERSION,
    reason: INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
  })
})

test('ten-most-recent selection gates each token independently without mutating token rows', () => {
  const orderedTokens = Array.from({ length: 12 }, (_, index) => ({
    id: `token-${index + 1}`,
    token: `ExponentPushToken[${index + 1}]`,
    app_version: index % 2 === 0 ? '1.1.1' : '1.2.0',
  }))
  const snapshot = structuredClone(orderedTokens)
  const selected = selectCompatiblePushTokensForDelivery(
    orderedTokens,
    10,
    'live_host_assigned',
  )

  assert.deepEqual(selected.consideredTokens.map((token) => token.id),
    orderedTokens.slice(0, 10).map((token) => token.id))
  assert.deepEqual(selected.compatibleTokens.map((token) => token.id), [
    'token-2',
    'token-4',
    'token-6',
    'token-8',
    'token-10',
  ])
  assert.equal(selected.suppressedIncompatibleCount, 5)
  assert.deepEqual(orderedTokens, snapshot)
})

test('worker loads app_version, preserves newest-token ordering and records aggregate suppression', () => {
  const worker = readFileSync('supabase/functions/push-notifications/index.ts', 'utf8')
  assert.match(worker, /select\('id,token,last_seen_at,app_version'\)/)
  assert.match(worker, /order\('last_seen_at', \{ ascending: false, nullsFirst: false \}\)/)
  assert.match(worker, /order\('id', \{ ascending: true \}\)/)
  assert.match(worker, /selectCompatiblePushTokensForDelivery\([\s\S]*MAX_TOKENS_PER_RECIPIENT/)
  assert.match(worker, /evaluatePushTokenCompatibility\([\s\S]*row\.app_version/)
  assert.match(worker, /reason: INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON/)
  assert.match(worker, /incompatible_app_version_suppressed/)
  assert.doesNotMatch(worker, /delete\(\)[\s\S]*push_tokens|from\('push_tokens'\)[\s\S]*\.delete\(\)/)
})
