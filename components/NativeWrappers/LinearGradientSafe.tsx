import React from 'react';
import { Platform, View, ViewProps, UIManager } from 'react-native';

let ExpoLinear: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoLinear = require('expo-linear-gradient').LinearGradient;
} catch (e) {
  ExpoLinear = null;
}

function hasNativeLinearGradient(): boolean {
  if (Platform.OS === 'web' || !ExpoLinear) return false;
  try {
    // The native view manager for expo-linear-gradient is typically named
    // 'ExpoLinearGradient' — if it's not registered, rendering it will throw
    // an "unimplemented component" error. Check UIManager for the config.
    // Some RN versions expose UIManager.getViewManagerConfig.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getConfig = (UIManager as any).getViewManagerConfig;
    if (typeof getConfig === 'function') {
      const cfg = getConfig('ExpoLinearGradient');
      if (cfg) return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

export default function LinearGradientSafe(props: ViewProps & { colors?: string[]; start?: [number, number]; end?: [number, number] }) {
  if (!hasNativeLinearGradient()) {
    return <View {...props} />;
  }

  // @ts-ignore - delegate to native linear gradient
  return <ExpoLinear {...props} />;
}
