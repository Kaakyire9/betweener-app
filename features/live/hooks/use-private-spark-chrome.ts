import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

const PRIVATE_SPARK_IDLE_MS = 3_600;

export const usePrivateSparkChrome = ({
  keepVisible,
}: {
  keepVisible: boolean;
}) => {
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const progress = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const animateTo = useCallback((nextVisible: boolean) => {
    setVisible(nextVisible);
    Animated.timing(progress, {
      toValue: nextVisible ? 1 : 0,
      duration: reduceMotion ? 120 : 280,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  const scheduleHide = useCallback(() => {
    clearIdleTimer();
    if (keepVisible || screenReaderEnabled) return;
    timerRef.current = setTimeout(() => animateTo(false), PRIVATE_SPARK_IDLE_MS);
  }, [animateTo, clearIdleTimer, keepVisible, screenReaderEnabled]);

  const reveal = useCallback(() => {
    animateTo(true);
    scheduleHide();
  }, [animateTo, scheduleHide]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      AccessibilityInfo.isScreenReaderEnabled(),
    ]).then(([motion, reader]) => {
      if (!mounted) return;
      setReduceMotion(motion);
      setScreenReaderEnabled(reader);
    });
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const readerSubscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderEnabled);
    return () => {
      mounted = false;
      motionSubscription.remove();
      readerSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (keepVisible || screenReaderEnabled) {
      clearIdleTimer();
      animateTo(true);
      return undefined;
    }
    scheduleHide();
    return clearIdleTimer;
  }, [animateTo, clearIdleTimer, keepVisible, scheduleHide, screenReaderEnabled]);

  return {
    visible,
    progress,
    reduceMotion,
    reveal,
  };
};
