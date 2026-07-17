import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { Colors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, type ComponentProps } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Theme = typeof Colors.light;

export type ProfileViewGiftOption = {
  id: string;
  label: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  note: string;
};

type ActionDockProps = {
  theme: Theme;
  isDark: boolean;
  isOwnProfile: boolean;
  bottomInset: number;
  saved: boolean;
  liked: boolean;
  onToggleSaved: () => void;
  onLike: () => void;
  onOpenBoostComposer: () => void;
  onOpenGift: () => void;
};

type GiftModalProps = {
  visible: boolean;
  theme: Theme;
  isDark: boolean;
  selectedGift: string | null;
  giftSending: boolean;
  canSendSignatureGifts: boolean;
  giftOptions: ProfileViewGiftOption[];
  onClose: () => void;
  onOpenRingUpsell: () => void;
  onSelectGift: (giftId: string) => void;
  onSubmit: () => void;
};

export function ProfileViewActionDock({
  theme,
  isDark,
  isOwnProfile,
  bottomInset,
  saved,
  liked,
  onToggleSaved,
  onLike,
  onOpenBoostComposer,
  onOpenGift,
}: ActionDockProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      style={[
        styles.fabStack,
        { bottom: 4 + Math.max(0, bottomInset) },
      ]}
      pointerEvents="box-none"
    >
      <LinearGradient
        colors={[
          isDark ? 'rgba(9,16,18,0.88)' : 'rgba(250,243,237,0.84)',
          isDark ? 'rgba(9,16,18,0.72)' : 'rgba(250,243,237,0.68)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.fabDock,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,42,42,0.08)',
          },
        ]}
      >
        {!isOwnProfile ? (
          <Fab
            icon={saved ? 'bookmark' : 'bookmark-outline'}
            colors={saved ? ['#F1C75B', '#A87812'] : ['#748E91', '#3D5D61']}
            onPress={onToggleSaved}
          />
        ) : null}
        {!isOwnProfile ? (
          <Fab
            icon={liked ? 'heart' : 'heart-outline'}
            colors={['#C7B3FF', '#7D7CF3']}
            onPress={onLike}
          />
        ) : null}
        {isOwnProfile ? (
          <Fab
            icon="rocket-launch-outline"
            colors={['#F6C453', '#C68B1E']}
            onPress={onOpenBoostComposer}
          />
        ) : (
          <Fab
            icon="gift-outline"
            colors={['#F3A0B4', '#C6607E']}
            onPress={onOpenGift}
          />
        )}
      </LinearGradient>
    </View>
  );
}

export function ProfileViewGiftModal({
  visible,
  theme,
  isDark,
  selectedGift,
  giftSending,
  canSendSignatureGifts,
  giftOptions,
  onClose,
  onOpenRingUpsell,
  onSelectGift,
  onSubmit,
}: GiftModalProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.giftBackdrop} onPress={onClose} />
      <BlurViewSafe
        intensity={30}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.giftSheet,
          {
            backgroundColor: isDark ? 'rgba(8,18,28,0.82)' : 'rgba(248,251,252,0.84)',
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,61,62,0.10)',
          },
        ]}
      >
        <View style={styles.giftHandle} />
        <Text style={[styles.giftTitle, { color: theme.text }]}>Send a Gift</Text>
        <Text style={[styles.giftSubtitle, { color: theme.textMuted }]}>
          Pick a gesture to stand out.
        </Text>
        <View style={styles.giftGrid}>
          {giftOptions.map((gift) => {
            const isSelected = selectedGift === gift.id;
            const locked = gift.id === 'ring' && !canSendSignatureGifts;

            return (
              <Pressable
                key={gift.id}
                onPress={() => {
                  if (locked) {
                    onOpenRingUpsell();
                    return;
                  }
                  onSelectGift(gift.id);
                }}
                style={[
                  styles.giftCard,
                  {
                    borderColor: isSelected ? theme.tint : theme.outline,
                    backgroundColor: theme.backgroundSubtle,
                    opacity: locked ? 0.58 : 1,
                  },
                ]}
              >
                <View style={isSelected ? styles.giftIconGlow : undefined}>
                  <MaterialCommunityIcons
                    name={gift.icon}
                    size={26}
                    color={isSelected ? theme.tint : theme.textMuted}
                  />
                </View>
                <Text style={[styles.giftLabel, { color: theme.text }]}>{gift.label}</Text>
                <Text style={[styles.giftNote, { color: theme.textMuted }]}>{gift.note}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onSubmit}
          disabled={!selectedGift || giftSending}
          style={[
            styles.giftSendButton,
            {
              backgroundColor: selectedGift ? theme.tint : theme.outline,
              opacity: selectedGift ? 1 : 0.6,
            },
          ]}
        >
          <Text style={[styles.giftSendText, { color: Colors.light.background }]}>
            {giftSending ? 'Sending...' : 'Send Gift'}
          </Text>
        </Pressable>
      </BlurViewSafe>
    </Modal>
  );
}

function Fab({
  icon,
  colors,
  onPress,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  colors: readonly [string, string, ...string[]] | readonly [string, string];
  onPress: () => void;
}) {
  const styles = baseStyles;

  return (
    <Pressable onPress={onPress} style={styles.fabWrap}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
        <MaterialCommunityIcons name={icon} size={18} color={Colors.light.background} />
      </LinearGradient>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  fabWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 5,
  },
  fab: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
});

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    fabStack: {
      position: 'absolute',
      left: 14,
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabDock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      elevation: 8,
    },
    giftBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    giftSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 18,
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.2,
      shadowRadius: 18,
      elevation: 12,
      overflow: 'hidden',
    },
    giftHandle: {
      alignSelf: 'center',
      width: 48,
      height: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.18)',
      marginBottom: 10,
    },
    giftTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    giftSubtitle: {
      marginTop: 4,
      fontSize: 12,
    },
    giftGrid: {
      marginTop: 14,
      flexDirection: 'row',
      gap: 10,
    },
    giftCard: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderWidth: 1,
      gap: 4,
      alignItems: 'flex-start',
    },
    giftLabel: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '700',
    },
    giftIconGlow: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      padding: 6,
      backgroundColor: 'rgba(186,155,255,0.22)',
      shadowColor: '#9b7bff',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    giftNote: {
      fontSize: 11,
    },
    giftSendButton: {
      marginTop: 16,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
    },
    giftSendText: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
  });
}
