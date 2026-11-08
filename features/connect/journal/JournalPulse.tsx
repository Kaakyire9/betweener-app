import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState } from 'react-native';
const motion = createContext({ reduced: true, seen: new Set<string>() });
export const JournalPulseValue = createContext<Animated.Value | null>(null);
export const useJournalReducedMotion = () => useContext(motion).reduced;
export function JournalMotionProvider({ children, scope = '' }: { children: React.ReactNode; scope?: string }) {
  const [preferences, setPreferences] = useState<[boolean, boolean]>([true, true]), seen = useRef(new Set<string>()).current;
  useEffect(() => { seen.clear(); }, [scope, seen]);
  useEffect(() => {
    let live = true;
    void Promise.all([AccessibilityInfo.isReduceMotionEnabled(), AccessibilityInfo.isScreenReaderEnabled()])
      .then(values => { if (live) setPreferences(values); }).catch(() => undefined);
    const reduce = AccessibilityInfo.addEventListener('reduceMotionChanged', value => setPreferences(old => [value, old[1]]));
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', value => setPreferences(old => [old[0], value]));
    return () => { live = false; reduce.remove(); reader.remove(); };
  }, []);
  return <motion.Provider value={{ reduced: preferences[0] || preferences[1], seen }}>{children}</motion.Provider>;
}
/** A single brief settle and portrait accent, once per identity in the current account session. */
export function JournalPulse({ id, fresh, children }: { id: string; fresh?: boolean; children: React.ReactNode }) {
  const value = useRef(new Animated.Value(1)).current, { reduced, seen } = useContext(motion);
  useEffect(() => {
    if (!fresh || reduced || AppState.currentState !== 'active' || seen.has(id)) return;
    seen.add(id); value.setValue(0);
    const animation = Animated.timing(value, { toValue: 1, duration: 360, useNativeDriver: true }); animation.start();
    return () => { animation.stop(); value.setValue(1); };
  }, [fresh, id, reduced, seen, value]);
  return <JournalPulseValue.Provider value={value}><Animated.View style={{ opacity: value.interpolate({ inputRange: [0, 1], outputRange: [.8, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }}>{children}</Animated.View></JournalPulseValue.Provider>;
}
