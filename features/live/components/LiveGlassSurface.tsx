import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type LiveGlassSurfaceProps = PropsWithChildren<{
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Shared Live chrome surface. Blur is progressive enhancement: unsupported
 * clients retain contrast through the fallback colour, border and shadow.
 */
export function LiveGlassSurface({
  children,
  intensity = 42,
  style,
}: LiveGlassSurfaceProps) {
  const visual = useLiveVisualTheme();
  return (
    <BlurViewSafe
      intensity={intensity}
      tint={visual.isDark ? 'dark' : 'light'}
      style={[styles.surface, themedSurface(visual), style]}
    >
      {children}
    </BlurViewSafe>
  );
}

const themedSurface = (visual: LiveVisualTheme): ViewStyle => ({
  backgroundColor: visual.color.surfaceTranslucent,
  borderColor: visual.color.border,
  shadowColor: visual.isDark ? '#000000' : visual.color.teal,
});

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
});
