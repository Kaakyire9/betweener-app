import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export const CIRCLE_PULSE_FOREGROUND_MIN_GAP_MS = 60_000;

type Options = {
  enabled: boolean;
  reload: () => void | Promise<void>;
  minGapMs?: number;
};

export function useCirclePulseRefresh({
  enabled,
  reload,
  minGapMs = CIRCLE_PULSE_FOREGROUND_MIN_GAP_MS,
}: Options) {
  const lastReloadAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    lastReloadAtRef.current = Date.now();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastReloadAtRef.current < minGapMs) return;
      lastReloadAtRef.current = now;
      void reload();
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, minGapMs, reload]);
}
