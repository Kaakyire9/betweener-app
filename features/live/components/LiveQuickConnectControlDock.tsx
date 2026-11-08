import * as Haptics from 'expo-haptics';
import { Camera, CameraOff, LogOut, Mic, MicOff, ShieldAlert } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveControlDock } from './LiveControlDock.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

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
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <LiveControlDock accentBorderColor={`${visual.color.teal}3D`} privateMode style={styles.dock}>
      <Pressable
        accessibilityLabel={audioEnabled ? 'Mute microphone' : 'Turn on microphone'}
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onToggleAudio)}
        style={({ pressed }) => [styles.control, !audioEnabled && styles.controlOff, busy && styles.disabled, pressed && styles.pressed]}
      >
        {audioEnabled ? <Mic color={visual.color.accentContrast} size={20} /> : <MicOff color={visual.color.dangerText} size={20} />}
      </Pressable>
      <Pressable
        accessibilityLabel={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onToggleVideo)}
        style={({ pressed }) => [styles.control, !videoEnabled && styles.controlOff, busy && styles.disabled, pressed && styles.pressed]}
      >
        {videoEnabled ? <Camera color={visual.color.accentContrast} size={20} /> : <CameraOff color={visual.color.dangerText} size={20} />}
      </Pressable>
      <View style={styles.divider} />
      <Pressable
        accessibilityLabel="End and report this Quick Connect"
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onReport)}
        style={({ pressed }) => [styles.reportButton, busy && styles.disabled, pressed && styles.pressed]}
      >
        <ShieldAlert color={visual.color.dangerText} size={17} />
      </Pressable>
      <Pressable
        accessibilityLabel="Leave Quick Connect"
        accessibilityRole="button"
        disabled={busy}
        onPress={() => runWithHaptic(onLeave)}
        style={({ pressed }) => [styles.leaveButton, busy && styles.disabled, pressed && styles.pressed]}
      >
        <LogOut color={visual.color.dangerText} size={17} />
        <Text style={styles.leaveText}>Leave round</Text>
      </Pressable>
    </LiveControlDock>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  dock: { alignSelf: 'center', marginTop: 10 },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.teal,
    borderWidth: 0.75,
    borderColor: visual.color.teal,
  },
  controlOff: { backgroundColor: visual.color.dangerSoft, borderColor: `${visual.color.danger}66` },
  divider: { width: 1, height: 30, backgroundColor: visual.color.border, marginHorizontal: 1 },
  leaveButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: visual.color.dangerSoft,
    borderWidth: 0.75,
    borderColor: `${visual.color.danger}52`,
  },
  reportButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.75,
    borderColor: `${visual.color.danger}52`,
    backgroundColor: visual.color.dangerSoft,
  },
  leaveText: { color: visual.color.dangerText, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
});
