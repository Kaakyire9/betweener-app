import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parsePushWebhookBody,
  PUSH_WEBHOOK_MAX_BODY_BYTES,
  signPushWebhookBody,
  verifyPushWebhookRequest,
} from '../supabase/functions/_shared/push-webhook-security.ts';

const migration = readFileSync(
  'supabase/migrations/20260914123000_push_notification_event_security.sql',
  'utf8',
);
const worker = readFileSync('supabase/functions/push-notifications/index.ts', 'utf8');
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');
const reservationMigration = readFileSync(
  'supabase/migrations/20260914124000_push_notification_delivery_reservations.sql',
  'utf8',
);
const atomicRateLimitMigration = readFileSync(
  'supabase/migrations/20260914126000_push_notification_atomic_rate_limits.sql',
  'utf8',
);
const nowSeconds = 1_789_400_000;
const currentKey = {
  keyId: 'push-v2',
  secret: 'current-key-material-is-dedicated-and-at-least-256-bits-long-0001',
};
const previousKey = {
  keyId: 'push-v1',
  secret: 'previous-key-material-is-dedicated-and-at-least-256-bits-long-01',
};
const rawBody = '{"event_id":"b2421cbb-4d61-4618-878a-6011c237e21e"}';

const verify = async ({
  key = currentKey,
  timestamp = String(nowSeconds),
  body = rawBody,
  signature,
}: {
  key?: typeof currentKey
  timestamp?: string
  body?: string
  signature?: string | null
} = {}) => verifyPushWebhookRequest({
  contentType: 'application/json',
  keyId: key.keyId,
  signature: signature === undefined
    ? await signPushWebhookBody(key.secret, timestamp, body)
    : signature,
  timestamp,
  rawBody: body,
  keys: [currentKey, previousKey],
  nowSeconds,
});

test('unauthorized requests fail when the HMAC signature is missing or tampered', async () => {
  assert.deepEqual(await verify({ signature: null }), { ok: false, reason: 'invalid_signature' });
  const result = await verify({ signature: '0'.repeat(64) });
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
});

test('expired signed requests fail outside the short replay window', async () => {
  const result = await verify({ timestamp: String(nowSeconds - 181) });
  assert.deepEqual(result, { ok: false, reason: 'stale_request' });
});

test('malformed and oversized bodies fail strict event-ID-only validation', async () => {
  assert.equal(parsePushWebhookBody('{"event_id":"not-a-uuid"}'), null);
  assert.equal(parsePushWebhookBody(`${rawBody.slice(0, -1)},"title":"injected"}`), null);
  assert.equal(parsePushWebhookBody('[]'), null);
  const oversized = JSON.stringify({ event_id: 'b2421cbb-4d61-4618-878a-6011c237e21e', padding: 'x'.repeat(200) });
  assert.ok(Buffer.byteLength(oversized) > PUSH_WEBHOOK_MAX_BODY_BYTES);
  assert.deepEqual(await verify({ body: oversized }), { ok: false, reason: 'body_too_large' });
});

test('raw-body tampering fails even when the parsed event ID remains valid', async () => {
  const timestamp = String(nowSeconds);
  const signature = await signPushWebhookBody(currentKey.secret, timestamp, rawBody);
  const reformattedBody = rawBody.replace(':', ': ');
  const result = await verify({ body: reformattedBody, signature });
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
});

test('current and previous rotation keys verify only under their declared key IDs', async () => {
  assert.equal((await verify()).ok, true);
  assert.equal((await verify({ key: previousKey })).ok, true);
  const timestamp = String(nowSeconds);
  const currentSignature = await signPushWebhookBody(currentKey.secret, timestamp, rawBody);
  const wrongKeyResult = await verify({ key: previousKey, signature: currentSignature });
  assert.deepEqual(wrongKeyResult, { ok: false, reason: 'invalid_signature' });
});

test('replayed and duplicate event IDs are rejected atomically before delivery', () => {
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*push-notification-event:/i);
  assert.match(migration, /if v_event\.status <> 'pending'[\s\S]*'claimStatus', 'duplicate'/i);
  assert.match(migration, /where id = p_event_id[\s\S]*and status = 'processing'/i);
  assert.match(worker, /claim\?\.claimStatus !== 'claimed'[\s\S]*duplicate_or_replay/i);
  assert.match(worker, /return jsonResponse\(rateLimited \? 429 : 409/i);
});

test('the endpoint is POST-only, server-only and has no arbitrary-message contract', () => {
  assert.match(
    supabaseConfig,
    /\[functions\.push-notifications\][\s\S]*?verify_jwt\s*=\s*false/i,
  );
  assert.match(worker, /request\.method !== 'POST'/i);
  assert.doesNotMatch(worker, /corsHeaders|Access-Control-Allow-Origin/i);
  assert.doesNotMatch(worker, /x-push-secret|PUSH_WEBHOOK_SECRET/i);
  assert.doesNotMatch(worker, /payload\.(?:user_id|title|body|data|campaign_id)/i);
  assert.match(worker, /rpc_service_claim_push_notification_event_v1/i);
  assert.match(worker, /MAX_TOKENS_PER_RECIPIENT = 10/i);
  assert.match(
    worker,
    /order\('last_seen_at',[\s\S]*?selectCompatiblePushTokensForDelivery\([\s\S]*?MAX_TOKENS_PER_RECIPIENT/i,
  );
  assert.match(worker, /MAX_CAMPAIGN_TOKENS = 20_000/i);
  assert.match(worker, /PUSH_HMAC_PREVIOUS_VALID_UNTIL/i);
  assert.match(worker, /rpc_service_reserve_push_notification_deliveries_v1/i);
  assert.match(atomicRateLimitMigration, /push-notification-rate-window/i);
  assert.match(atomicRateLimitMigration, /v_global_claims >= 300/i);
  assert.match(atomicRateLimitMigration, /v_recipient_claims >= 20/i);
});

test('database producers transmit only a signed canonical event ID', () => {
  assert.match(migration, /jsonb_build_object\('event_id', v_event\.id\)::text/i);
  assert.match(migration, /v_timestamp \|\| '\.' \|\| v_raw_body/i);
  assert.match(migration, /extensions\.hmac[\s\S]*'sha256'/i);
  assert.match(migration, /x-betweener-key-id/i);
  assert.match(migration, /x-betweener-timestamp/i);
  assert.match(migration, /x-betweener-signature/i);
  assert.doesNotMatch(migration, /'x-push-secret'/i);
  assert.match(migration, /vault\.decrypted_secrets/i);
  assert.match(migration, /webhook_secret = null/i);
  assert.match(
    migration,
    /revoke all on function private\.send_push_webhook\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function private\.dispatch_push_notification_event_v1\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(reservationMigration, /unique\(canonical_delivery_key, token_id\)/i);
  assert.match(reservationMigration, /cardinality\(p_token_ids\) > 100/i);
});

test('authentication and volume logs exclude secrets and signatures', () => {
  assert.match(worker, /event: 'authentication_failure'/i);
  assert.match(worker, /notification_volume_anomaly/i);
  assert.doesNotMatch(worker, /console\.(?:log|warn|error)\([^\n]*(?:signature|secret)/i);
});
