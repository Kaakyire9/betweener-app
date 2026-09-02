import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

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

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 10,
    marginTop: 7,
    marginBottom: 7,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#D7B56D52',
    backgroundColor: '#061310',
    overflow: 'hidden',
    shadowColor: '#000000',
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
    backgroundColor: '#091413',
  },
  poolPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: '#071714',
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: '#D7B56D52',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#D7B56D52',
  },
});
