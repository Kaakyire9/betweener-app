export type ChatOutboxFlushGate<T> = {
  run: (ownerUserId: string, task: () => Promise<T>) => Promise<T>;
  hasActiveTask: (ownerUserId: string) => boolean;
};

/**
 * Enqueue, app resume, connectivity, and realtime can request the same flush.
 * Coalesce them per account so one attachment is never uploaded concurrently.
 */
export const createChatOutboxFlushGate = <T>(): ChatOutboxFlushGate<T> => {
  const activeTasks = new Map<string, {
    promise: Promise<T>;
    rerunRequested: boolean;
    latestTask: () => Promise<T>;
  }>();

  return {
    run(ownerUserId, task) {
      const state = activeTasks.get(ownerUserId);
      if (state) {
        state.rerunRequested = true;
        state.latestTask = task;
        return state.promise;
      }

      const nextState: {
        promise: Promise<T>;
        rerunRequested: boolean;
        latestTask: () => Promise<T>;
      } = {
        promise: Promise.resolve(undefined as T) as Promise<T>,
        rerunRequested: false,
        latestTask: task,
      };
      const pending = (async (): Promise<T> => {
        let result: T = await task();
        while (nextState.rerunRequested) {
          nextState.rerunRequested = false;
          result = await nextState.latestTask();
        }
        return result;
      })().finally(() => {
        if (activeTasks.get(ownerUserId) === nextState) {
          activeTasks.delete(ownerUserId);
        }
      });
      nextState.promise = pending;
      activeTasks.set(ownerUserId, nextState);
      return pending;
    },
    hasActiveTask(ownerUserId) {
      return activeTasks.has(ownerUserId);
    },
  };
};
