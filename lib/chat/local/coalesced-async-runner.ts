export type CoalescedAsyncRunner = {
  request: () => void;
  stop: () => void;
};

/**
 * Runs at most one task at a time and collapses any number of requests received
 * while it is running into one trailing execution.
 *
 * Local chat observers can fire several times during one attachment lifecycle.
 * Coalescing prevents those notifications from flooding the serialized SQLite
 * queue with redundant reads while still guaranteeing a final fresh read.
 */
export const createCoalescedAsyncRunner = (
  task: () => Promise<void>,
  onError?: (error: unknown) => void,
): CoalescedAsyncRunner => {
  let running = false;
  let rerunRequested = false;
  let stopped = false;

  const drain = async () => {
    if (running || stopped) return;
    running = true;

    try {
      do {
        rerunRequested = false;
        try {
          await task();
        } catch (error) {
          onError?.(error);
        }
      } while (rerunRequested && !stopped);
    } finally {
      running = false;
    }
  };

  return {
    request: () => {
      if (stopped) return;
      if (running) {
        rerunRequested = true;
        return;
      }
      void drain();
    },
    stop: () => {
      stopped = true;
      rerunRequested = false;
    },
  };
};
