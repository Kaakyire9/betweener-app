import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hasLocalStorageCapacity } from '../lib/offline/storage-capacity-policy.ts';

const migration = readFileSync(
  'supabase/migrations/20260731160000_production_harden_chat_attachments.sql',
  'utf8',
);
const consumeFunction = readFileSync(
  'supabase/functions/chat-attachment-consume/index.ts',
  'utf8',
);
const retentionFunction = readFileSync(
  'supabase/functions/chat-attachment-retention/index.ts',
  'utf8',
);

test('finalized attachment objects are immutable to authenticated clients', () => {
  assert.match(migration, /is_chat_attachment_object_mutable/);
  assert.match(migration, /lifecycle_status in \('ready', 'quarantined', 'expired'\)/);
  assert.match(migration, /drop policy if exists "Chat senders can delete media"/);
});

test('server finalization claims one exact payload per client message', () => {
  assert.match(migration, /primary key \(sender_id, client_message_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_existing is distinct from p_request_payload/);
  assert.match(migration, /attachment_idempotency_conflict/);
});

test('view-once access is an atomic server claim and split completion is revoked', () => {
  assert.match(consumeFunction, /rpc_claim_view_once_attachment/);
  assert.doesNotMatch(consumeFunction, /rpc_prepare_view_once_attachment/);
  assert.match(migration, /revoke all on function public\.rpc_prepare_view_once_attachment/);
  assert.match(migration, /revoke all on function public\.rpc_complete_view_once_attachment/);
});

test('retention has scheduling, dead-lettering, and durable run outcomes', () => {
  assert.match(migration, /chat_attachment_retention_runs/);
  assert.match(migration, /dead_letter/);
  assert.match(migration, /configure_chat_attachment_retention_worker/);
  assert.match(retentionFunction, /status: 'succeeded'/);
  assert.match(retentionFunction, /status: 'failed'/);
});

test('local staging protects a reserve instead of filling the device', () => {
  assert.equal(
    hasLocalStorageCapacity({ freeBytes: 600, requiredBytes: 100, reserveBytes: 500 }),
    true,
  );
  assert.equal(
    hasLocalStorageCapacity({ freeBytes: 599, requiredBytes: 100, reserveBytes: 500 }),
    false,
  );
});
