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
};

/**
 * StreamVideoClient is a user-scoped singleton. Call-scoped providers must
 * therefore lease it instead of disconnecting it independently; otherwise a
 * delayed screen cleanup can tear down the next room during a route handoff.
 */
export class StreamVideoClientLeaseRegistry {
  private readonly entries = new Map<string, ClientEntry>();

  acquire<TClient extends DisconnectableStreamClient>(
    key: string,
    createClient: () => TClient,
  ): StreamVideoClientLease<TClient> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { client: createClient(), leaseCount: 0 };
      this.entries.set(key, entry);
    }
    entry.leaseCount += 1;

    let released = false;
    return {
      client: entry.client as TClient,
      release: async () => {
        if (released) return;
        released = true;

        const current = this.entries.get(key);
        if (!current || current !== entry) return;
        current.leaseCount = Math.max(0, current.leaseCount - 1);
        if (current.leaseCount > 0) return;

        this.entries.delete(key);
        await current.client.disconnectUser().catch(() => undefined);
      },
    };
  }
}

export const streamVideoClientLeaseRegistry = new StreamVideoClientLeaseRegistry();
