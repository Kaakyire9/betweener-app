import { WifiOff } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LiveSessionControllerState } from '../hooks/use-live-session-controller.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export const LiveConnectionBanner = memo(function LiveConnectionBanner({
  state,
}: { state: LiveSessionControllerState }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  if (!['offline', 'reconnecting'].includes(state)) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      {state === 'reconnecting' ? (
        <ActivityIndicator size="small" color={visual.color.warning} />
      ) : (
        <WifiOff size={16} color={visual.color.warning} />
      )}
      <Text style={styles.text}>
        {state === 'reconnecting' ? 'Rejoining the room…' : 'Connection paused. Your place is safe.'}
      </Text>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  banner: {
    minHeight: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: visual.color.warningSoft,
  },
  text: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
});
