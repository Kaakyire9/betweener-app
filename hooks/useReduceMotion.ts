import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!mounted) return;
      setReduceMotion(Boolean(value));
    });

    // RN 0.65+ returns an EventSubscription with `.remove()`.
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReduceMotion(Boolean(value));
    });

    return () => {
      mounted = false;
      // Backwards/forwards compatible cleanup.
      const removable = sub as unknown as { remove?: () => void } | undefined;
      if (removable?.remove) removable.remove();
    };
  }, []);

  return reduceMotion;
}
