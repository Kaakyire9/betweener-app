type Timer = ReturnType<typeof setTimeout>;

export type ChatReadReceiptBatcherDependencies = {
  markRemoteRead: (messageIds: string[], currentUserId: string) => Promise<{ error?: unknown } | void>;
  persistThreadRead: (currentUserId: string, peerUserId: string) => Promise<void>;
  onError?: (scope: 'remote' | 'local', error: unknown) => void;
  delayMs?: number;
};

/** Batches visible-message read receipts and always provides a cleanup path. */
export class ChatReadReceiptBatcher {
  private readonly pendingMessageIds = new Set<string>();
  private remoteTimer: Timer | null = null;
  private localTimer: Timer | null = null;
  private activeUserId: string | null = null;
  private activePeerUserId: string | null = null;
  private readonly delayMs: number;
  private readonly dependencies: ChatReadReceiptBatcherDependencies;

  constructor(dependencies: ChatReadReceiptBatcherDependencies) {
    this.dependencies = dependencies;
    this.delayMs = dependencies.delayMs ?? 120;
  }

  enqueue({
    messageId,
    currentUserId,
    peerUserId,
  }: {
    messageId: string;
    currentUserId: string;
    peerUserId: string;
  }) {
    this.pendingMessageIds.add(messageId);
    this.activeUserId = currentUserId;
    this.activePeerUserId = peerUserId;
    if (!this.remoteTimer) this.remoteTimer = setTimeout(() => void this.flushRemote(), this.delayMs);
    if (!this.localTimer) this.localTimer = setTimeout(() => void this.flushLocal(), this.delayMs);
  }

  dispose() {
    if (this.remoteTimer) clearTimeout(this.remoteTimer);
    if (this.localTimer) clearTimeout(this.localTimer);
    this.remoteTimer = null;
    this.localTimer = null;
    this.pendingMessageIds.clear();
    this.activeUserId = null;
    this.activePeerUserId = null;
  }

  private async flushRemote() {
    this.remoteTimer = null;
    const messageIds = Array.from(this.pendingMessageIds);
    this.pendingMessageIds.clear();
    if (!this.activeUserId || messageIds.length === 0) return;
    try {
      const result = await this.dependencies.markRemoteRead(messageIds, this.activeUserId);
      if (result && 'error' in result && result.error) {
        this.dependencies.onError?.('remote', result.error);
      }
    } catch (error) {
      this.dependencies.onError?.('remote', error);
    }
  }

  private async flushLocal() {
    this.localTimer = null;
    if (!this.activeUserId || !this.activePeerUserId) return;
    try {
      await this.dependencies.persistThreadRead(this.activeUserId, this.activePeerUserId);
    } catch (error) {
      this.dependencies.onError?.('local', error);
    }
  }
}
