import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export const CIRCLE_PULSE_REFRESH_INTERVAL_MS = 12_000;
export const CIRCLE_PULSE_REFRESH_MIN_GAP_MS = 12_000;

type Options = {
  enabled: boolean;
  reload: () => void | Promise<void>;
  minGapMs?: number;
};

export function useCirclePulseRefresh({
  enabled,
  reload,
  minGapMs = CIRCLE_PULSE_REFRESH_MIN_GAP_MS,
}: Options) {
  const lastReloadAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    lastReloadAtRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastReloadAtRef.current < minGapMs) return;
      lastReloadAtRef.current = now;
      void reload();
    }, CIRCLE_PULSE_REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      lastReloadAtRef.current = Date.now();
      void reload();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, minGapMs, reload]);
}
