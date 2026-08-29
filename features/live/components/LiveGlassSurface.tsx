import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe.tsx';

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
  return (
    <BlurViewSafe intensity={intensity} tint="dark" style={[styles.surface, style]}>
      {children}
    </BlurViewSafe>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
    backgroundColor: '#071512B8',
    borderWidth: 1,
    borderColor: '#FFFFFF1F',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
});
