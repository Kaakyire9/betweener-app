import type { MessageType } from '../../../components/chat/types';

export const getLatestIncomingMessageTimestamp = (
  messages: MessageType[],
  peerUserId: string,
) => messages.reduce<number | null>((latest, message) => {
  if (message.senderId !== peerUserId) return latest;
  const timestamp = message.timestamp.getTime();
  if (!Number.isFinite(timestamp)) return latest;
  return latest === null ? timestamp : Math.max(latest, timestamp);
}, null);

type ReadOperation = {
  currentUserId: string;
  peerUserId: string;
  forceRemote?: boolean;
  persistLocal: () => Promise<void>;
  persistSnapshot: () => Promise<void>;
  markRemote: () => Promise<{ error?: unknown } | void>;
};

/** Coordinates one durable read acknowledgement per active thread. */
export class ChatThreadReadCoordinator {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly completed = new Set<string>();

  async acknowledge(operation: ReadOperation) {
    const key = `${operation.currentUserId}:${operation.peerUserId}`;
    const active = this.inFlight.get(key);
    if (active) {
      await active;
      if (!operation.forceRemote) return;
    }
    if (!operation.forceRemote && this.completed.has(key)) return;
    if (operation.forceRemote) this.completed.delete(key);

    const run = (async () => {
      // The server acknowledgement starts immediately; local persistence is
      // best-effort and must never delay receipt reconciliation.
      const remoteRequest = Promise.resolve().then(operation.markRemote);
      await Promise.allSettled([
        operation.persistLocal(),
        operation.persistSnapshot(),
      ]);
      try {
        const remote = await remoteRequest;
        if (!remote || !remote.error) this.completed.add(key);
      } catch {
        // Leave the key incomplete so a later focus event can retry.
      }
    })().finally(() => {
      if (this.inFlight.get(key) === run) this.inFlight.delete(key);
    });
    this.inFlight.set(key, run);
    await run;
  }

  clear(currentUserId: string, peerUserId: string) {
    this.completed.delete(`${currentUserId}:${peerUserId}`);
  }
}
