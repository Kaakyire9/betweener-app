import { runConnectProviderJob, type ConnectJob, type ConnectWorkerStore } from './connect-provider-worker.ts';
import type { createConnectStreamAdapter } from './connect-stream-adapter.ts';

/** Bounded sequential draining. Postgres retains priority, leases, retry backoff
 * and all authority. A soft time budget never abandons an already claimed job. */
export async function runConnectProviderBatch(store: ConnectWorkerStore & { claim(): Promise<ConnectJob | null> },
  provider: ReturnType<typeof createConnectStreamAdapter>, options: { maxJobs?: number; budgetMs?: number; now?(): number } = {}) {
  const maxJobs = options.maxJobs ?? 4, budgetMs = options.budgetMs ?? 7000, now = options.now ?? Date.now;
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 8 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 12000) throw Error('connect_worker_budget_invalid');
  const start = now(), leases = new Set<string>(); let completed = 0, failed = 0;
  for (let count = 0; count < maxJobs && now() - start < budgetMs; count++) {
    const job = await store.claim();
    if (!job) break;
    if (!job.lease || leases.has(job.lease)) throw Error('connect_worker_lease_repeated');
    leases.add(job.lease);
    // An ambiguous completion throws and stops this invocation. Never blindly
    // retry a privileged operation whose database acknowledgement is unknown.
    const result = await runConnectProviderJob(job, store, provider);
    if (result.success) completed++; else failed++;
  }
  return completed + failed === 0 ? { processed: false as const }
    : { processed: true as const, success: failed === 0, completed, failed };
}
