import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Camera, CameraOff, ChevronLeft, Clock3, LockKeyhole, Mic, MicOff, MoreHorizontal, Sparkles } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatLivePrivateSparkRemainingTime } from '../hooks/use-live-private-spark-countdown.ts';
import { LiveControlDock } from './LiveControlDock.tsx';
import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const initialsFor = (name: string) => name
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() ?? '')
  .join('') || 'B';

const selectionHaptic = () => void Haptics.selectionAsync().catch(() => undefined);

export const LivePrivateSparkHeader = memo(function LivePrivateSparkHeader({
  avatarUrl,
  name,
  onLeave,
  onOptions,
  remainingSeconds,
}: {
  avatarUrl: string | null;
  name: string;
  onLeave: () => void;
  onOptions: () => void;
  remainingSeconds: number | null;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <LiveGlassSurface intensity={46} style={styles.headerSurface}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Leave Private Spark"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onLeave}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <ChevronLeft color={visual.color.text} size={20} />
        </Pressable>
        <View style={styles.avatarShell}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} contentFit="cover" style={styles.avatar} transition={120} />
          ) : (
            <Text style={styles.initials}>{initialsFor(name)}</Text>
          )}
          <View style={styles.privateBadge}><LockKeyhole color={visual.color.purple} size={8} /></View>
        </View>
        <View style={styles.headerCopy}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>PRIVATE SPARK</Text>
            <Text style={styles.privateCopy}>Only you two</Text>
          </View>
          <Text numberOfLines={1} style={styles.title}>You + {name}</Text>
        </View>
        <View accessibilityLabel={`${remainingSeconds ?? 0} seconds remaining`} style={styles.timerPill}>
          <Clock3 color={visual.color.purple} size={12} />
          <Text style={styles.timer}>{formatLivePrivateSparkRemainingTime(remainingSeconds)}</Text>
        </View>
        <Pressable
          accessibilityLabel="Private Spark options"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOptions}
          style={({ pressed }) => [styles.optionsButton, pressed && styles.pressed]}
        >
          <MoreHorizontal color={visual.color.textMuted} size={19} />
        </Pressable>
      </View>
    </LiveGlassSurface>
  );
});

export const LivePrivateSparkControlDock = memo(function LivePrivateSparkControlDock({
  audioEnabled,
  onEnd,
  onConversationSpark,
  onToggleAudio,
  onToggleVideo,
  videoEnabled,
}: {
  audioEnabled: boolean;
  onEnd: () => void;
  onConversationSpark: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  videoEnabled: boolean;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const run = (action: () => void) => {
    selectionHaptic();
    action();
  };
  return (
    <LiveControlDock accentBorderColor={`${visual.color.purple}40`} privateMode style={styles.dock}>
      <Pressable
        accessibilityLabel="Open a Conversation Spark"
        accessibilityRole="button"
        onPress={() => run(onConversationSpark)}
        style={({ pressed }) => [styles.sparkControl, pressed && styles.pressed]}
      >
        <Sparkles color={visual.color.purple} size={19} />
      </Pressable>
      <Pressable
        accessibilityLabel={audioEnabled ? 'Mute microphone' : 'Turn on microphone'}
        accessibilityRole="button"
        onPress={() => run(onToggleAudio)}
        style={({ pressed }) => [styles.control, !audioEnabled && styles.controlOff, pressed && styles.pressed]}
      >
        {audioEnabled ? <Mic color={visual.color.accentContrast} size={21} /> : <MicOff color={visual.color.dangerText} size={21} />}
      </Pressable>
      <Pressable
        accessibilityLabel={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        accessibilityRole="button"
        onPress={() => run(onToggleVideo)}
        style={({ pressed }) => [styles.control, !videoEnabled && styles.controlOff, pressed && styles.pressed]}
      >
        {videoEnabled ? <Camera color={visual.color.accentContrast} size={21} /> : <CameraOff color={visual.color.dangerText} size={21} />}
      </Pressable>
      <View style={styles.dockDivider} />
      <Pressable
        accessibilityLabel="End Private Spark"
        accessibilityRole="button"
        onPress={() => run(onEnd)}
        style={({ pressed }) => [styles.endButton, pressed && styles.pressed]}
      >
        <Text style={styles.endText}>End Spark</Text>
      </Pressable>
    </LiveControlDock>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  headerSurface: { marginHorizontal: 12, marginTop: 5, borderRadius: 24, backgroundColor: visual.isDark ? '#061411E8' : '#FFFDFCEB', borderColor: `${visual.color.purple}33` },
  header: { minHeight: 58, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 0.75, borderColor: visual.color.border },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  avatarShell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft, borderWidth: 0.75, borderColor: `${visual.color.purple}52` },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  initials: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  privateBadge: { position: 'absolute', right: -2, bottom: -1, width: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.surface },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: visual.color.purple, fontSize: 8, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  privateCopy: { color: visual.color.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
  title: { color: visual.color.text, fontSize: 15, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 1 },
  timerPill: { minHeight: 30, paddingHorizontal: 9, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: visual.color.purpleSoft, borderWidth: 0.75, borderColor: `${visual.color.purple}45` },
  timer: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  optionsButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 0.75, borderColor: visual.color.border },
  dock: { alignSelf: 'center', marginHorizontal: 18, marginBottom: 8 },
  control: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal, borderWidth: 0.75, borderColor: visual.color.teal },
  controlOff: { backgroundColor: visual.color.dangerSoft, borderColor: `${visual.color.danger}66` },
  sparkControl: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft, borderWidth: 0.75, borderColor: `${visual.color.purple}42` },
  dockDivider: { width: 1, height: 28, marginHorizontal: 1, backgroundColor: visual.color.border },
  endButton: { minHeight: 48, paddingHorizontal: 17, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.dangerSoft, borderWidth: 0.75, borderColor: `${visual.color.danger}52` },
  endText: { color: visual.color.dangerText, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
});
