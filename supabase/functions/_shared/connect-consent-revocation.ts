import { runConnectEndJob, type ConnectJob, type ConnectWorkerStore } from './connect-provider-worker.ts';
import type { createConnectStreamAdapter } from './connect-stream-adapter.ts';

export interface ConnectRevocationStore extends ConnectWorkerStore {
  revoke(grant: string): Promise<{ revoked: boolean; calls: string[]; pending_count: number }>;
  claimEnd(call: string): Promise<ConnectJob | null>;
}
/** Database authority commits first. Never report remote cleanup without its ACK. */
export async function revokeConnectConsent(grant: string, store: ConnectRevocationStore, provider: Pick<ReturnType<typeof createConnectStreamAdapter>, 'end'>) {
  const result = await store.revoke(grant);
  if (!result.revoked || !Array.isArray(result.calls) || result.calls.length > 20
    || !Number.isInteger(result.pending_count) || result.pending_count < result.calls.length) throw new Error('connect_unavailable');
  let completed = 0;
  for (const id of result.calls) {
    try {
      const job = await store.claimEnd(id);
      if (!job || job.operation !== 'end' || job.call_id !== id) continue;
      if ((await runConnectEndJob(job, store, provider)).success) completed++;
    } catch { /* Authoritative revocation stays committed; durable worker retries. */ }
  }
  return { revoked: true as const, providerCleanup: completed === result.pending_count ? 'complete' as const : 'pending' as const };
}
