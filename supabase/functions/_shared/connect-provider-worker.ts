import type { createConnectStreamAdapter, ProviderSnapshot } from './connect-stream-adapter.ts';
import { assertConnectEndAcknowledged } from './connect-provider-end.ts';
export interface ConnectJob { call_id: string; operation: 'create' | 'end' | 'sync'; lease: string }
export interface ConnectWorkerStore {
  snapshot(id: string): Promise<ProviderSnapshot | null>;
  complete(job: ConnectJob, success: boolean): Promise<void>;
  // `ended` means permanent call termination/missing call, never just session end.
  reconcile(id: string, media: { session: string | null; users: string[]; ended: boolean }): Promise<void>;
}
/** A successful HTTP/RPC response can still reject a stale completion lease. */
export function assertConnectJobAcknowledged(value: unknown): asserts value is true {
  if (value !== true) throw new Error('connect_job_not_acknowledged');
}
export async function runConnectEndJob(job: ConnectJob, store: Pick<ConnectWorkerStore, 'complete'>,
  provider: Pick<ReturnType<typeof createConnectStreamAdapter>, 'end'>) {
  if (job.operation !== 'end') throw new Error('connect_invalid_cleanup_job');
  try {
    const acknowledgement = await provider.end({ id: job.call_id });
    assertConnectEndAcknowledged(acknowledgement, job.call_id);
    await store.complete(job, true);
    return { success: true };
  } catch {
    await store.complete(job, false);
    return { success: false };
  }
}
/** Durable work is claimed by Postgres with a lease. Completion fences stale work. */
export async function runConnectProviderJob(job: ConnectJob, store: ConnectWorkerStore, provider: ReturnType<typeof createConnectStreamAdapter>) {
  if (job.operation === 'end') return await runConnectEndJob(job, store, provider);
  try {
    const s = await store.snapshot(job.call_id);
    if (!s) { await store.complete(job, true); return { success: true }; }
    if (job.operation === 'create') {
      if (s.state === 'REQUESTED' && !s.ended_at && s.can_provision) {
        await provider.provision(s);
        const fresh = await store.snapshot(s.id);
        if (!fresh || fresh.ended_at || fresh.state === 'ENDING' || !fresh.can_provision) {
          assertConnectEndAcknowledged(await provider.end({ id: s.id }), s.id);
        }
      }
    } else if (!s.ended_at && ['RINGING', 'ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(s.state)) {
      const media = await provider.media(s);
      await store.reconcile(s.id, { session: media.session, users: media.sessionEnded ? [] : media.users,
        ended: media.callEnded || media.missing });
    }
    await store.complete(job, true);
    return { success: true };
  } catch {
    // The database stores a bounded safe code and retries with backoff. Provider
    // errors and payloads can contain secrets and must never be logged.
    await store.complete(job, false);
    return { success: false };
  }
}
