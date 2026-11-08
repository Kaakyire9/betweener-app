import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Visual work only: no dependency on microphone, SDK, native call ownership or admission. */
export function useCallVisualActivity(foreground: boolean, visible = true) {
  const [active, setActive] = useState(AppState.currentState === 'active');
  // Prefer stillness until the asynchronous accessibility preferences are known.
  const [reduceMotion, setReduceMotion] = useState(true);
  const [screenReader, setScreenReader] = useState(true);
  useEffect(() => {
    let current = true, motionChanged = false, readerChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (current && !motionChanged) setReduceMotion(value); }).catch(() => undefined);
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (current && !readerChanged) setScreenReader(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { motionChanged = true; setReduceMotion(value); });
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', value => { readerChanged = true; setScreenReader(value); });
    const app = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { current = false; motion.remove(); reader.remove(); app.remove(); };
  }, []);
  return { screenActive: active && foreground && visible, motionAllowed: !reduceMotion && !screenReader };
}
