import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { ScreenAwakeReason } from '@/lib/device/screen-awake';
import { acquireScreenAwake, isScreenAwakeAllowed, releaseScreenAwake } from '@/lib/device/screen-awake';

type UseScopedScreenAwakeOptions = {
  enabled: boolean;
  reason: ScreenAwakeReason;
  instanceId?: string;
  requireScreenFocus?: boolean;
  requireAppActive?: boolean;
};

export function useScopedScreenAwake({
  enabled,
  reason,
  instanceId,
  requireScreenFocus = true,
  requireAppActive = true,
}: UseScopedScreenAwakeOptions): {
  isHeld: boolean;
} {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const shouldDebugLog = isDev && process.env.NODE_ENV !== 'test';
  const [isFocused, setIsFocused] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isHeld, setIsHeld] = useState(false);
  const activeTagRef = useRef<string | null>(null);
  const activeLeaseKeyRef = useRef<string | null>(null);
  const lastDebugSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => {
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  const shouldHold = useMemo(() => {
    if (!enabled) return false;
    if (!isScreenAwakeAllowed(reason)) return false;
    if (requireScreenFocus && !isFocused) return false;
    if (requireAppActive && appState !== 'active') return false;
    return true;
  }, [appState, enabled, isFocused, reason, requireAppActive, requireScreenFocus]);

  const leaseKey = useMemo(
    () => `${reason}:${instanceId ?? 'default'}`,
    [instanceId, reason],
  );

  useEffect(() => {
    if (!shouldDebugLog) return;
    const snapshot = JSON.stringify({
      leaseKey,
      enabled,
      reason,
      appState,
      isFocused,
      requireScreenFocus,
      requireAppActive,
      shouldHold,
      isHeld,
      activeTag: activeTagRef.current,
    });
    if (lastDebugSnapshotRef.current === snapshot) return;
    lastDebugSnapshotRef.current = snapshot;
    console.log('[screen-awake:scope]', {
      leaseKey,
      enabled,
      reason,
      appState,
      isFocused,
      requireScreenFocus,
      requireAppActive,
      shouldHold,
      isHeld,
      activeTag: activeTagRef.current,
    });
  }, [appState, enabled, isFocused, isHeld, leaseKey, reason, requireAppActive, requireScreenFocus, shouldHold, shouldDebugLog]);

  useEffect(() => {
    let cancelled = false;

    const releaseActiveLease = async () => {
      const tag = activeTagRef.current;
      activeTagRef.current = null;
      activeLeaseKeyRef.current = null;
      if (!tag) {
        if (!cancelled) setIsHeld(false);
        return;
      }
      try {
        await releaseScreenAwake(tag);
      } finally {
        if (shouldDebugLog) {
          console.log('[screen-awake:scope]', {
            leaseKey,
            reason,
            event: 'lease_released',
            tag,
          });
        }
        if (!cancelled) setIsHeld(false);
      }
    };

    const syncLease = async () => {
      if (!shouldHold) {
        await releaseActiveLease();
        return;
      }

      if (activeTagRef.current && activeLeaseKeyRef.current === leaseKey) {
        if (!cancelled) setIsHeld(true);
        return;
      }

      await releaseActiveLease();

      try {
        const tag = await acquireScreenAwake(reason, instanceId);
        if (cancelled) {
          await releaseScreenAwake(tag);
          return;
        }
        activeTagRef.current = tag;
        activeLeaseKeyRef.current = leaseKey;
        if (shouldDebugLog) {
          console.log('[screen-awake:scope]', {
            leaseKey,
            reason,
            event: 'lease_acquired',
            tag,
          });
        }
        setIsHeld(true);
      } catch {
        if (!cancelled) setIsHeld(false);
      }
    };

    void syncLease();

    return () => {
      cancelled = true;
      const tag = activeTagRef.current;
      activeTagRef.current = null;
      activeLeaseKeyRef.current = null;
      setIsHeld(false);
      if (tag) {
        void releaseScreenAwake(tag);
      }
    };
  }, [instanceId, leaseKey, reason, shouldHold, shouldDebugLog]);

  return { isHeld };
}
