import React from 'react';
import { Platform, View, ViewProps, UIManager } from 'react-native';
// Use expo-blur when available (dev-client). On web or missing native module, fall back to View.
let ExpoBlur: any = null;
try {
   
  ExpoBlur = require('expo-blur').BlurView;
} catch (_e) {
  ExpoBlur = null;
}

function hasNativeBlur(): boolean {
  if (Platform.OS === 'web' || !ExpoBlur) return false;
  try {
    const getConfig = (UIManager as any).getViewManagerConfig;
    if (typeof getConfig === 'function') {
      // Try common possible native view manager names used by blur modules
      const names = ['ExpoBlur', 'ExpoBlurView', 'RNBlurView', 'BlurView'];
      for (const n of names) {
        const cfg = getConfig(n);
        if (cfg) return true;
      }
    }
  } catch (_e) {
    // ignore
  }
  return false;
}

export default function BlurViewSafe(props: ViewProps & { intensity?: number; tint?: 'light' | 'dark' | 'default' }) {
  if (!hasNativeBlur()) {
    return <View {...props} />;
  }

  // @ts-ignore - type may be missing in some environments
  return <ExpoBlur {...props} />;
}
