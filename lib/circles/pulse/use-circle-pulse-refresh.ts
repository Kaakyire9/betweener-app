import { useEffect } from 'react';
import { AppState } from 'react-native';

export const CIRCLE_PULSE_REFRESH_INTERVAL_MS = 30_000;
export const CIRCLE_PULSE_DISCUSSION_REFRESH_INTERVAL_MS = 15_000;

type Options = {
  enabled: boolean;
  reload: () => void | Promise<void>;
  intervalMs?: number;
};

export function useCirclePulseRefresh({
  enabled,
  reload,
  intervalMs = CIRCLE_PULSE_REFRESH_INTERVAL_MS,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      void reload();
    }, intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, intervalMs, reload]);
}
