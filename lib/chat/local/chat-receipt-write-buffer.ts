export type ChatReceiptWrite<TStatus extends string = string> = {
  ownerUserId: string;
  threadId: string;
  messageId: string;
  status: TStatus;
};

type PendingReceiptWrite<TStatus extends string> = {
  write: ChatReceiptWrite<TStatus>;
  waiters: {
    resolve: () => void;
    reject: (error: unknown) => void;
  }[];
};

type ChatReceiptWriteBufferOptions<TStatus extends string> = {
  persist: (writes: ChatReceiptWrite<TStatus>[]) => Promise<void>;
  getStatusRank: (status: TStatus) => number;
};

const receiptWriteKey = (write: ChatReceiptWrite) =>
  `${write.ownerUserId}:${write.threadId}:${write.messageId}`;

/**
 * Collapses repeated receipt updates into one write batch. Requests received
 * while a batch is waiting on SQLite become at most one trailing batch.
 */
export const createChatReceiptWriteBuffer = <TStatus extends string>({
  persist,
  getStatusRank,
}: ChatReceiptWriteBufferOptions<TStatus>) => {
  let pending = new Map<string, PendingReceiptWrite<TStatus>>();
  let drainScheduled = false;
  let draining = false;

  const scheduleDrain = () => {
    if (drainScheduled || draining) return;
    drainScheduled = true;
    queueMicrotask(() => {
      drainScheduled = false;
      void drain();
    });
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      while (pending.size > 0) {
        const batch = pending;
        pending = new Map();
        try {
          await persist(Array.from(batch.values(), (entry) => entry.write));
          batch.forEach((entry) => entry.waiters.forEach(({ resolve }) => resolve()));
        } catch (error) {
          batch.forEach((entry) => entry.waiters.forEach(({ reject }) => reject(error)));
        }
      }
    } finally {
      draining = false;
      if (pending.size > 0) scheduleDrain();
    }
  };

  return {
    enqueue(write: ChatReceiptWrite<TStatus>): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const key = receiptWriteKey(write);
        const existing = pending.get(key);
        if (existing) {
          if (getStatusRank(write.status) > getStatusRank(existing.write.status)) {
            existing.write = write;
          }
          existing.waiters.push({ resolve, reject });
        } else {
          pending.set(key, {
            write,
            waiters: [{ resolve, reject }],
          });
        }
        scheduleDrain();
      });
    },
  };
};
