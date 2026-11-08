import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = PropsWithChildren<{
  accentBorderColor?: string;
  style?: StyleProp<ViewStyle>;
  privateMode?: boolean;
}>;

/** A single calm control surface shared by public Live and Private Spark. */
export function LiveControlDock({ accentBorderColor, children, privateMode = false, style }: Props) {
  const visual = useLiveVisualTheme();
  const privateBackground = visual.isDark ? '#081A17C4' : '#FFFDFCD8';
  const publicBackground = visual.isDark ? '#081A1791' : '#FFFDFCB8';
  return (
    <LiveGlassSurface
      intensity={privateMode ? 52 : 48}
      style={[
        styles.dock,
        {
          borderRadius: visual.radius.dock,
          backgroundColor: privateMode ? privateBackground : publicBackground,
          borderColor: privateMode
            ? accentBorderColor ?? visual.color.borderStrong
            : visual.color.border,
        },
        !privateMode && styles.publicDock,
        privateMode && styles.privateDock,
        style,
      ]}
    >
      {children}
    </LiveGlassSurface>
  );
}

const styles = StyleSheet.create({
  dock: {
    minHeight: 56,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  publicDock: {
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  privateDock: {
    padding: 8,
    gap: 9,
    shadowOpacity: 0.24,
    shadowRadius: 24,
  },
});
