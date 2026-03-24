import React from 'react';
import { Platform, View, ViewProps, UIManager } from 'react-native';

let ExpoLinear: any = null;
try {
   
  ExpoLinear = require('expo-linear-gradient').LinearGradient;
} catch (_e) {
  ExpoLinear = null;
}

function hasNativeLinearGradient(): boolean {
  if (Platform.OS === 'web' || !ExpoLinear) return false;
  try {
    // The native view manager for expo-linear-gradient is typically named
    // 'ExpoLinearGradient' — if it's not registered, rendering it will throw
    // an "unimplemented component" error. Check UIManager for the config.
    // Some RN versions expose UIManager.getViewManagerConfig.
     
    const getConfig = (UIManager as any).getViewManagerConfig;
    if (typeof getConfig === 'function') {
      const cfg = getConfig('ExpoLinearGradient');
      if (cfg) return true;
    }
  } catch (_e) {
    // ignore
  }
  return false;
}

// Evaluate at call-time so we don't get a false-negative during module init
// (UIManager may not be ready yet on some RN/Expo setups).
export const isLinearGradientAvailable = (): boolean => hasNativeLinearGradient();

export default function LinearGradientSafe(props: ViewProps & { colors?: string[]; start?: [number, number]; end?: [number, number] }) {
  if (!isLinearGradientAvailable()) {
    return <View {...props} />;
  }

  // @ts-ignore - delegate to native linear gradient
  return <ExpoLinear {...props} />;
}
