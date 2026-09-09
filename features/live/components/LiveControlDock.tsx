import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  privateMode?: boolean;
}>;

/** A single calm control surface shared by public Live and Private Spark. */
export function LiveControlDock({ children, privateMode = false, style }: Props) {
  const visual = useLiveVisualTheme();
  return (
    <LiveGlassSurface
      intensity={privateMode ? 52 : 42}
      style={[
        styles.dock,
        {
          borderRadius: visual.radius.dock,
          backgroundColor: visual.color.surfaceTranslucent,
          borderColor: visual.color.borderStrong,
        },
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
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  privateDock: {
    padding: 8,
    gap: 9,
    shadowOpacity: 0.34,
    shadowRadius: 28,
  },
});
