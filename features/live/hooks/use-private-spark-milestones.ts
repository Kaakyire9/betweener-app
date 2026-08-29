import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';

export type PrivateSparkMilestone = 'one_minute' | 'almost_complete' | null;

export const usePrivateSparkMilestones = (remainingSeconds: number | null) => {
  const [milestone, setMilestone] = useState<PrivateSparkMilestone>(null);
  const previousRef = useRef<number | null>(remainingSeconds);
  const shownRef = useRef(new Set<Exclude<PrivateSparkMilestone, null>>());
  const dismissalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (dismissalTimerRef.current) clearTimeout(dismissalTimerRef.current);
  }, []);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = remainingSeconds;
    if (remainingSeconds === null) return undefined;
    const next = previous !== null && previous > 60 && remainingSeconds <= 60
      ? 'one_minute'
      : previous !== null && previous > 15 && remainingSeconds <= 15
        ? 'almost_complete'
        : null;
    if (!next || shownRef.current.has(next)) return undefined;
    shownRef.current.add(next);
    setMilestone(next);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (dismissalTimerRef.current) clearTimeout(dismissalTimerRef.current);
    dismissalTimerRef.current = setTimeout(() => {
      dismissalTimerRef.current = null;
      setMilestone(null);
    }, 3_200);
    return undefined;
  }, [remainingSeconds]);

  return milestone;
};
