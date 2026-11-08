import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CircleLoveSeatCeremony from '@/components/circles/CircleLoveSeatCeremony';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  item: CirclePulseItem | null;
  onDismiss: () => void;
  onOpenLoveSeat: () => void;
  onOpenProfile?: (profileId: string) => void;
};

export default function CircleLoveSeatArrivalPrompt({
  visible,
  item,
  onDismiss,
  onOpenLoveSeat,
  onOpenProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(insets.bottom, palette), [insets.bottom, palette]);

  if (!visible || !item || item.type !== 'love_seat') return null;

  const name = item.featuredProfileName?.trim() || 'A Circle member';
  const firstName = name.split(/\s+/)[0] || 'Someone';
  const loveSeatCopy = item.loveSeatQuote?.trim()
    || 'Meet them, ask something thoughtful, and make this moment feel special.';

  const openProfile = () => {
    if (!item.featuredProfileId || !onOpenProfile) return;
    onDismiss();
    onOpenProfile(item.featuredProfileId);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable accessibilityLabel="Close Love Seat introduction" style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <LinearGradient colors={palette.warmIntroGradient} style={StyleSheet.absoluteFill} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{firstName.toUpperCase()} TAKES THE LOVE SEAT</Text>
              <Text style={styles.kicker}>A one-time ceremonial welcome</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Dismiss Love Seat introduction" style={styles.closeButton} onPress={onDismiss}>
              <MaterialCommunityIcons name="close" size={19} color={palette.textSoft} />
            </TouchableOpacity>
          </View>

          <CircleLoveSeatCeremony
            avatarUrl={item.featuredProfileAvatarUrl}
            name={name}
            palette={palette}
            onOpenProfile={item.featuredProfileId && onOpenProfile ? openProfile : undefined}
          />

          <View style={styles.copy}>
            <Text style={styles.title}>{firstName} has taken the Love Seat</Text>
            {item.featuredProfileLocation ? <Text style={styles.location}>{item.featuredProfileLocation}</Text> : null}
            <Text style={styles.body}>{loveSeatCopy}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                onDismiss();
                onOpenLoveSeat();
              }}
            >
              <MaterialCommunityIcons name="heart-outline" size={17} color={palette.tealInk} />
              <Text style={styles.primaryText}>See the Love Seat</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (bottomInset: number, palette: CirclePulsePalette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: Math.max(bottomInset, 12),
    backgroundColor: palette.overlay,
  },
  sheet: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    borderRadius: 28,
    padding: 16,
    gap: 14,
    backgroundColor: palette.surface,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: palette.purple, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.5 },
  kicker: { marginTop: 3, color: palette.textMuted, fontSize: 11, lineHeight: 16 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceMuted,
  },
  copy: { gap: 3 },
  title: { color: palette.text, fontSize: 25, lineHeight: 31, fontFamily: 'PlayfairDisplay_700Bold' },
  location: { color: palette.purple, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  body: { marginTop: 4, color: palette.textSoft, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 9 },
  secondaryButton: {
    minHeight: 46,
    paddingHorizontal: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceMuted,
  },
  secondaryText: { color: palette.textSoft, fontSize: 12, fontWeight: '800' },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 23,
    backgroundColor: palette.tealStrong,
  },
  primaryText: { color: palette.tealInk, fontSize: 12, fontWeight: '900' },
});
