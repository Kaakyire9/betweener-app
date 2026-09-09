import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export type LiveQuickConnectStageProps = {
  hostSurface: ReactNode;
  layout: 'stacked' | 'side-by-side';
  poolSurface: ReactNode;
};

/**
 * One bounded stage shared equally by the public host and the Quick Connect
 * pool. Keeping both surfaces in the same layout container prevents either
 * surface from covering Room Pulse or floating independently over the room.
 */
export const LiveQuickConnectStage = memo(function LiveQuickConnectStage({
  hostSurface,
  layout,
  poolSurface,
}: LiveQuickConnectStageProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const sideBySide = layout === 'side-by-side';

  return (
    <View
      accessibilityLabel="Quick Connect host and guest pool stage"
      style={styles.shell}
    >
      <View style={[styles.composition, sideBySide ? styles.horizontal : styles.vertical]}>
        <View style={styles.hostPane}>{hostSurface}</View>
        <View
          pointerEvents="none"
          style={sideBySide ? styles.verticalDivider : styles.horizontalDivider}
        />
        <View style={styles.poolPane}>{poolSurface}</View>
      </View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 10,
    marginTop: 7,
    marginBottom: 7,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    backgroundColor: visual.color.surface,
    overflow: 'hidden',
    shadowColor: visual.isDark ? '#000000' : visual.color.teal,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 10,
  },
  composition: { flex: 1, minHeight: 0 },
  vertical: { flexDirection: 'column' },
  horizontal: { flexDirection: 'row' },
  hostPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: visual.color.videoChrome,
  },
  poolPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: visual.color.surface,
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: visual.color.borderStrong,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: visual.color.borderStrong,
  },
});
