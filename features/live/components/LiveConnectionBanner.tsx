import { WifiOff } from 'lucide-react-native';
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LiveSessionControllerState } from '../hooks/use-live-session-controller.ts';

export const LiveConnectionBanner = memo(function LiveConnectionBanner({
  state,
}: { state: LiveSessionControllerState }) {
  if (!['offline', 'reconnecting'].includes(state)) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      {state === 'reconnecting' ? (
        <ActivityIndicator size="small" color="#F2D69B" />
      ) : (
        <WifiOff size={16} color="#F2D69B" />
      )}
      <Text style={styles.text}>
        {state === 'reconnecting' ? 'Rejoining the room…' : 'Connection paused. Your place is safe.'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    minHeight: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#4A351B',
  },
  text: { color: '#FFF6E5', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
});

