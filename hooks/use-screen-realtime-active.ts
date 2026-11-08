import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Keeps screen-owned Realtime work attached only while its route is visible. */
export const useScreenRealtimeActive = () => {
  const [focused, setFocused] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useFocusEffect(useCallback(() => {
    setAppState(AppState.currentState);
    setFocused(true);
    const subscription = AppState.addEventListener('change', setAppState);
    return () => {
      setFocused(false);
      subscription.remove();
    };
  }, []));

  return focused && appState === 'active';
};
