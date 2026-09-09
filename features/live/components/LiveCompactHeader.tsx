import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type LiveCompactHeaderProps = {
  attendeeCount: number;
  hostAvatarUrl: string | null;
  hostName: string | null;
  onLeave: () => void;
  roomTitle: string;
};

const initials = (name: string | null) => {
  const value = name?.trim();
  if (!value) return 'H';
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
};

/** Compact room identity chrome that leaves the stage as the visual focus. */
export const LiveCompactHeader = memo(function LiveCompactHeader({
  attendeeCount,
  hostAvatarUrl,
  hostName,
  onLeave,
  roomTitle,
}: LiveCompactHeaderProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const displayName = hostName?.trim() || 'Host';

  return (
    <LiveGlassSurface intensity={48} style={styles.glass}>
      <View style={styles.header}>
        <View accessibilityLabel={`Hosted by ${displayName}`} style={styles.hostAvatarShell}>
          {hostAvatarUrl ? (
            <Image contentFit="cover" source={{ uri: hostAvatarUrl }} style={styles.hostAvatar} transition={120} />
          ) : (
            <Text style={styles.hostInitials}>{initials(displayName)}</Text>
          )}
          <View style={styles.liveBadge} />
        </View>

        <View style={styles.copy}>
          <View style={styles.hostRow}>
            <Text numberOfLines={1} style={styles.hostName}>{displayName}</Text>
            <Text style={styles.hostLabel}>HOST</Text>
          </View>
          <View style={styles.roomRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
            <Text numberOfLines={1} style={styles.roomTitle}>{roomTitle}</Text>
            <Text style={styles.viewerText}>· {attendeeCount} here</Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel="Leave live room"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onLeave}
          style={styles.iconButton}
        >
          <X size={20} color={visual.color.text} />
        </Pressable>
      </View>
    </LiveGlassSurface>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  glass: { marginHorizontal: 10, marginTop: 4, borderRadius: 26 },
  header: {
    minHeight: 56,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'transparent',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.surfaceTranslucent,
    borderWidth: 1,
    borderColor: visual.color.border,
  },
  hostAvatarShell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.tealSoft,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  hostAvatar: { width: 42, height: 42, borderRadius: 21 },
  hostInitials: { color: visual.color.text, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  liveBadge: {
    position: 'absolute',
    right: -1,
    bottom: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E75C69',
    borderWidth: 1.5,
    borderColor: visual.color.surface,
  },
  copy: { flex: 1, minWidth: 0 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hostName: { maxWidth: '72%', color: visual.color.text, fontSize: 13, fontFamily: 'Archivo_700Bold' },
  hostLabel: { color: visual.color.teal, fontSize: 7, letterSpacing: 0.9, fontFamily: 'Manrope_800ExtraBold' },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#E75C69' },
  liveText: { color: '#FF818C', fontSize: 8, letterSpacing: 0.9, fontFamily: 'Manrope_800ExtraBold' },
  roomTitle: { flexShrink: 1, color: visual.color.text, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  viewerText: { color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
});
