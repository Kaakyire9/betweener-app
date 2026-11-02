import { AppState, Platform } from 'react-native';
import type { NativeLifecycle } from './native-owner-types';

/** Loaded only after the Connect runtime gate; access only the required RN exports. */
export function createConnectNativeLifecycle(): NativeLifecycle {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') throw new Error('connect_native_platform_unsupported');
  return {
    platform,
    appState: () => AppState.currentState,
    subscribeAppState(listener) {
      const subscription = AppState.addEventListener('change', listener);
      // Android can lose window focus without changing AppState (notification shade).
      const blur = platform === 'android' ? AppState.addEventListener('blur', () => listener('inactive')) : null;
      return () => { subscription.remove(); blur?.remove(); };
    },
  };
}
