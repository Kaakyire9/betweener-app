type IdleCallbackHandle = number;

type IdleCapableGlobal = typeof globalThis & {
  requestIdleCallback?: (
    callback: (deadline: unknown) => void,
    options?: { timeout?: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

export type CancelableIdleTask = {
  cancel: () => void;
};

/**
 * Defers non-urgent UI work without relying on React Native's deprecated
 * InteractionManager. The timeout prevents important bootstrap work from
 * being starved on a continuously busy JS thread.
 */
export function scheduleIdleTask(
  task: () => void,
  timeoutMs = 500,
): CancelableIdleTask {
  const idleGlobal = globalThis as IdleCapableGlobal;
  let cancelled = false;

  const run = () => {
    if (!cancelled) task();
  };

  if (typeof idleGlobal.requestIdleCallback === 'function') {
    const handle = idleGlobal.requestIdleCallback(run, { timeout: timeoutMs });
    return {
      cancel: () => {
        cancelled = true;
        idleGlobal.cancelIdleCallback?.(handle);
      },
    };
  }

  const timer = setTimeout(run, 0);
  return {
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
    },
  };
}
