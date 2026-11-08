export type DisconnectableStreamClient = {
  disconnectUser(): Promise<void>;
};

export type StreamVideoClientLease<TClient extends DisconnectableStreamClient> = {
  client: TClient;
  release(): Promise<void>;
};

type ClientEntry = {
  client: DisconnectableStreamClient;
  leaseCount: number;
  closing: boolean;
  disconnecting?: Promise<void>;
};

/**
 * StreamVideoClient is a user-scoped singleton. Call-scoped providers must
 * therefore lease it instead of disconnecting it independently; otherwise a
 * delayed screen cleanup can tear down the next room during a route handoff.
 */
export class StreamVideoClientLeaseRegistry {
  private readonly entries = new Map<string, ClientEntry>();
  private nativeExclusiveKey: string | null = null;
  private creating = 0;

  /** Native audio routing is process-wide. Connect must not share Live's token closure. */
  acquireNativeExclusive<TClient extends DisconnectableStreamClient>(
    key: string, createClient: () => TClient,
  ): StreamVideoClientLease<TClient> {
    if (this.nativeExclusiveKey !== null || this.entries.size > 0 || this.creating > 0) throw new Error('stream_native_owner_busy');
    this.nativeExclusiveKey = key;
    try {
      const entry: ClientEntry = { client: createClient(), leaseCount: 1, closing: false };
      this.entries.set(key, entry);
      return this.lease<TClient>(key, entry);
    } catch (error) { this.nativeExclusiveKey = null; throw error; }
  }

  acquire<TClient extends DisconnectableStreamClient>(
    key: string,
    createClient: () => TClient,
  ): StreamVideoClientLease<TClient> {
    if (this.nativeExclusiveKey !== null || this.creating > 0) throw new Error('stream_native_owner_busy');
    let entry = this.entries.get(key);
    if (entry?.closing) throw new Error('stream_client_release_pending');
    if (!entry) {
      this.creating++;
      try { entry = { client: createClient(), leaseCount: 0, closing: false }; }
      finally { this.creating--; }
      this.entries.set(key, entry);
    }
    entry.leaseCount += 1;

    return this.lease<TClient>(key, entry);
  }

  private lease<TClient extends DisconnectableStreamClient>(key: string, entry: ClientEntry): StreamVideoClientLease<TClient> {
    let released = false;
    return {
      client: entry.client as TClient,
      release: async () => {
        const current = this.entries.get(key);
        if (!current || current !== entry) return;
        if (!released) { released = true; current.leaseCount = Math.max(0, current.leaseCount - 1); }
        if (current.leaseCount > 0) return;
        if (current.disconnecting) return current.disconnecting;
        current.closing = true;
        // Keep a tombstone until disconnect completes. A failed/hung release must
        // not let a successor borrow the old SDK singleton or refresh callback.
        const operation = Promise.resolve().then(() => current.client.disconnectUser()).then(() => {
          if (this.entries.get(key) === current) this.entries.delete(key);
          if (this.nativeExclusiveKey === key) this.nativeExclusiveKey = null;
        }).finally(() => { current.disconnecting = undefined; });
        current.disconnecting = operation;
        return operation;
      },
    };
  }
}

export const streamVideoClientLeaseRegistry = new StreamVideoClientLeaseRegistry();
