// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('shared offline mutation hardening', () => {
  const queue = read('lib/offline/mutation-queue.ts');
  const auth = read('lib/auth-context.tsx');
  const migration = read(
    'supabase/migrations/20260918120000_idempotent_app_mutation_receipts.sql',
  );

  it('scopes durable records to the authenticated owner and clears them at auth boundaries', () => {
    expect(queue).toContain('ownerUserId?: string | null');
    expect(queue).toContain('scopeQueueToOwner');
    expect(queue).toContain('clearOfflineMutationQueuesForOwner');
    expect(auth.match(/clearOfflineMutationQueuesForOwner\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('serializes state changes and surfaces durable persistence failures', () => {
    expect(queue).toContain('withQueueStateLock');
    expect(queue).toContain('writeOfflineEnvelopeStrict');
    expect(queue).toContain("area: 'offline_mutation_drain'");
  });

  it('uses receipt-backed idempotent RPCs for non-idempotent creates', () => {
    expect(migration).toContain('create table if not exists public.app_mutation_receipts');
    expect(migration).toContain('rpc_create_text_moment_v2');
    expect(migration).toContain('rpc_create_media_moment_v2');
    expect(migration).toContain('rpc_create_moment_comment_v2');
    expect(migration).toContain('rpc_create_circle_pulse_comment_v2');
    expect(migration).toContain('rpc_create_profile_boost_v3');
    expect(migration).toContain('rpc_send_profile_gift_v2');
    expect(migration).toContain('rpc_replace_profile_interests_v2');
  });

  it('does not keep terminal failures in optimistic Moments state', () => {
    const reconciler = read('lib/offline/moment-mutation-reconciler.ts');
    expect(reconciler).toContain('const allMutations = pendingMutations');
    expect(queue).toContain('reconcileTerminalMutationFailure');
  });
});
