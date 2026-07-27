export type ChatOperationPriority = 'user-blocking' | 'normal' | 'background';

type ScheduledOperation<T> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export type PriorityOperationScheduler = {
  schedule<T>(run: () => Promise<T>, priority?: ChatOperationPriority): Promise<T>;
  getPendingCount(): number;
};

type PriorityOperationSchedulerOptions = {
  maxUserBlockingBurst?: number;
  maxNormalBurst?: number;
};

const DEFAULT_MAX_USER_BLOCKING_BURST = 8;
const DEFAULT_MAX_NORMAL_BURST = 4;

export const createPriorityOperationScheduler = (
  options: PriorityOperationSchedulerOptions = {},
): PriorityOperationScheduler => {
  const queues: Record<ChatOperationPriority, ScheduledOperation<unknown>[]> = {
    'user-blocking': [],
    normal: [],
    background: [],
  };
  const maxUserBlockingBurst = Math.max(
    1,
    options.maxUserBlockingBurst ?? DEFAULT_MAX_USER_BLOCKING_BURST,
  );
  const maxNormalBurst = Math.max(1, options.maxNormalBurst ?? DEFAULT_MAX_NORMAL_BURST);

  let running = false;
  let userBlockingBurst = 0;
  let normalBurst = 0;

  const pendingCount = () =>
    queues['user-blocking'].length + queues.normal.length + queues.background.length;

  const takeNext = (): ScheduledOperation<unknown> | undefined => {
    const hasLowerPriorityWork = queues.normal.length > 0 || queues.background.length > 0;
    if (
      queues['user-blocking'].length > 0 &&
      (userBlockingBurst < maxUserBlockingBurst || !hasLowerPriorityWork)
    ) {
      userBlockingBurst += 1;
      return queues['user-blocking'].shift();
    }

    if (queues.normal.length > 0) {
      if (queues.background.length > 0 && normalBurst >= maxNormalBurst) {
        userBlockingBurst = 0;
        normalBurst = 0;
        return queues.background.shift();
      }
      userBlockingBurst = 0;
      normalBurst += 1;
      return queues.normal.shift();
    }

    if (queues.background.length > 0) {
      userBlockingBurst = 0;
      normalBurst = 0;
      return queues.background.shift();
    }

    if (queues['user-blocking'].length > 0) {
      userBlockingBurst += 1;
      return queues['user-blocking'].shift();
    }

    return undefined;
  };

  const drain = () => {
    if (running) return;
    running = true;

    queueMicrotask(async () => {
      try {
        for (let operation = takeNext(); operation; operation = takeNext()) {
          try {
            operation.resolve(await operation.run());
          } catch (error) {
            operation.reject(error);
          }
        }
      } finally {
        running = false;
        if (pendingCount() > 0) {
          drain();
        }
      }
    });
  };

  return {
    schedule<T>(
      run: () => Promise<T>,
      priority: ChatOperationPriority = 'normal',
    ): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queues[priority].push({
          run,
          resolve: resolve as ScheduledOperation<unknown>['resolve'],
          reject,
        });
        drain();
      });
    },
    getPendingCount: pendingCount,
  };
};
