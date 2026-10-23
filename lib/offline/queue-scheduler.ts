export type RetryScheduledQueueItem = {
  nextAttemptAt?: number | null;
};

type QueueSchedulerPolicy<T extends RetryScheduledQueueItem> = {
  isExpired?: (item: T) => boolean;
  dependsOnEarlier?: (item: T, earlierItems: T[]) => boolean;
};

/**
 * Selects the first causally-safe item that can run now. A delayed item does
 * not block unrelated work behind it, while dependent operations remain in
 * order until their parent operation completes and remaps their identifiers.
 */
export function selectNextReadyQueueItem<T extends RetryScheduledQueueItem>(
  queue: T[],
  now: number,
  policy: QueueSchedulerPolicy<T> = {},
): T | null {
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index]!;
    const ready =
      Boolean(policy.isExpired?.(item)) ||
      !item.nextAttemptAt ||
      item.nextAttemptAt <= now;
    if (!ready) continue;
    if (policy.dependsOnEarlier?.(item, queue.slice(0, index))) continue;
    return item;
  }
  return null;
}
