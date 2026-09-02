import * as Haptics from 'expo-haptics';
import { Camera, CameraOff, LogOut, Mic, MicOff, ShieldAlert } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveControlDock } from './LiveControlDock.tsx';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type Props = {
  audioEnabled: boolean;
  busy?: boolean;
  onLeave: () => void;
  onReport: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  videoEnabled: boolean;
};

const runWithHaptic = (action: () => void) => {
  void Haptics.selectionAsync().catch(() => undefined);
  action();
};

/** Transport controls for a consent-based Quick Connect round. */
export const LiveQuickConnectControlDock = memo(function LiveQuickConnectControlDock({
  audioEnabled,
  busy = false,
  onLeave,
  onReport,
  onToggleAudio,
  onToggleVideo,
  videoEnabled,
}: Props) {
  return (
    <LiveControlDock privateMode style={styles.dock}>
      <Pressable
        accessibilityLabel={audioEnabled ? 'Mute microphone' : 'Turn on microphone'}
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onToggleAudio)}
        style={({ pressed }) => [styles.control, !audioEnabled && styles.controlOff, pressed && styles.pressed]}
      >
        {audioEnabled ? <Mic color="#0B2621" size={20} /> : <MicOff color={LIVE_VISUAL.color.dangerText} size={20} />}
      </Pressable>
      <Pressable
        accessibilityLabel={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onToggleVideo)}
        style={({ pressed }) => [styles.control, !videoEnabled && styles.controlOff, pressed && styles.pressed]}
      >
        {videoEnabled ? <Camera color="#0B2621" size={20} /> : <CameraOff color={LIVE_VISUAL.color.dangerText} size={20} />}
      </Pressable>
      <View style={styles.divider} />
      <Pressable
        accessibilityLabel="End and report this Quick Connect"
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onReport)}
        style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}
      >
        <ShieldAlert color="#F2C5C1" size={17} />
      </Pressable>
      <Pressable
        accessibilityLabel="Leave Quick Connect"
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onLeave)}
        style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]}
      >
        <LogOut color="#F8D8D5" size={17} />
        <Text style={styles.leaveText}>Leave round</Text>
      </Pressable>
    </LiveControlDock>
  );
});

const styles = StyleSheet.create({
  dock: { alignSelf: 'center', marginTop: 10 },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BFE2D7',
  },
  controlOff: { backgroundColor: LIVE_VISUAL.color.danger },
  divider: { width: 1, height: 30, backgroundColor: '#FFFFFF1A', marginHorizontal: 1 },
  leaveButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#6C3030',
  },
  reportButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7A3B3B',
    backgroundColor: '#311D1D',
  },
  leaveText: { color: '#F8D8D5', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
