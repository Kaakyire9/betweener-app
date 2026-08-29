import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  privateMode?: boolean;
}>;

/** A single calm control surface shared by public Live and Private Spark. */
export function LiveControlDock({ children, privateMode = false, style }: Props) {
  return (
    <LiveGlassSurface
      intensity={privateMode ? 52 : 42}
      style={[styles.dock, privateMode && styles.privateDock, style]}
    >
      {children}
    </LiveGlassSurface>
  );
}

const styles = StyleSheet.create({
  dock: {
    minHeight: 58,
    borderRadius: LIVE_VISUAL.radius.dock,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#061411D9',
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  privateDock: {
    padding: 8,
    gap: 9,
    backgroundColor: '#061411EE',
    shadowOpacity: 0.34,
    shadowRadius: 28,
  },
});
