// @ts-nocheck
import { selectNextReadyQueueItem } from '@/lib/offline/queue-scheduler';

type Item = {
  id: string;
  parentId?: string;
  nextAttemptAt?: number | null;
  expired?: boolean;
};

const select = (queue: Item[], now = 1_000) =>
  selectNextReadyQueueItem(queue, now, {
    isExpired: (item) => Boolean(item.expired),
    dependsOnEarlier: (item, earlier) =>
      Boolean(item.parentId && earlier.some((candidate) => candidate.id === item.parentId)),
  });

describe('offline queue scheduler', () => {
  it('does not let a delayed item block unrelated ready work', () => {
    expect(
      select([
        { id: 'delayed', nextAttemptAt: 2_000 },
        { id: 'ready' },
      ])?.id,
    ).toBe('ready');
  });

  it('keeps a dependent item behind its delayed parent', () => {
    expect(
      select([
        { id: 'parent', nextAttemptAt: 2_000 },
        { id: 'child', parentId: 'parent' },
        { id: 'independent' },
      ])?.id,
    ).toBe('independent');
  });

  it('selects the parent when its retry becomes due', () => {
    expect(
      select([
        { id: 'parent', nextAttemptAt: 900 },
        { id: 'child', parentId: 'parent' },
      ])?.id,
    ).toBe('parent');
  });

  it('allows expired cleanup to bypass a future retry time', () => {
    expect(select([{ id: 'expired', nextAttemptAt: 5_000, expired: true }])?.id).toBe(
      'expired',
    );
  });
});
