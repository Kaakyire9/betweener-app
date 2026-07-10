import OfflineImage from '@/components/media/OfflineImage';
import { type ProfileMediaDraft } from '@/lib/profile/media-studio';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { type StudioTheme, withAlpha } from './model';

type Props = {
  theme: StudioTheme;
  draft: ProfileMediaDraft;
  emptyGallerySlots: number;
  onPickGallery: () => void;
  onSetHero: (index: number) => void;
  onMakeAvatar: (index: number) => void;
  onMoveGallery: (from: number, to: number) => void;
  onRemovePhoto: (index: number) => void;
};

export default function ProfileStudioGallery({
  theme,
  draft,
  emptyGallerySlots,
  onPickGallery,
  onSetHero,
  onMakeAvatar,
  onMoveGallery,
  onRemovePhoto,
}: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRail}>
      {draft.gallery.map((uri, index) => {
        const isHero = draft.heroImageUrl === uri;
        return (
          <View
            key={`${uri}-${index}`}
            style={[
              styles.galleryCard,
              {
                backgroundColor: theme.backgroundSubtle,
                borderColor: isHero ? withAlpha(theme.tint, '4A') : theme.outline,
              },
            ]}
            >
              <View style={styles.galleryImageWrap}>
                <OfflineImage uri={uri} style={styles.galleryImage} contentFit="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(4,12,16,0.28)']}
                  start={{ x: 0.5, y: 0.1 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              <View style={styles.galleryCardTop}>
                {index === 0 ? (
                  <View style={[styles.heroChip, { backgroundColor: theme.tint }]}>
                    <Text style={styles.heroChipText}>{isHero ? 'Hero' : 'Scene 1'}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.miniAction, styles.miniActionGhost, { borderColor: 'rgba(255,255,255,0.18)' }]}
                    onPress={() => onSetHero(index)}
                    accessibilityLabel="Set as hero"
                  >
                    <MaterialCommunityIcons name="star-four-points-outline" size={14} color="#FFFFFF" />
                      <Text style={[styles.miniActionText, { color: '#FFFFFF' }]}>Set hero</Text>
                    </TouchableOpacity>
                  )}
                <View style={[styles.sceneCountPill, { backgroundColor: 'rgba(7,20,26,0.40)' }]}>
                  <Text style={styles.sceneCountPillText}>Scene {index + 1}</Text>
                </View>
              </View>
            </View>
            <View style={styles.galleryBody}>
              <TouchableOpacity
                style={[styles.miniAction, styles.galleryPrimaryAction, { borderColor: theme.outline, backgroundColor: theme.background }]}
                onPress={() => onMakeAvatar(index)}
              >
                <MaterialCommunityIcons name="account-check-outline" size={14} color={theme.text} />
                <Text style={[styles.miniActionText, { color: theme.text }]}>Make avatar</Text>
              </TouchableOpacity>
              <View style={styles.galleryUtilityRow}>
                <TouchableOpacity
                  style={[styles.iconAction, { borderColor: theme.outline, backgroundColor: theme.background }]}
                  disabled={index === 0}
                  onPress={() => onMoveGallery(index, index - 1)}
                  accessibilityLabel="Move image left"
                >
                  <MaterialCommunityIcons name="chevron-left" size={16} color={index === 0 ? theme.textMuted : theme.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconAction, { borderColor: theme.outline, backgroundColor: theme.background }]}
                  disabled={index === draft.gallery.length - 1}
                  onPress={() => onMoveGallery(index, index + 1)}
                  accessibilityLabel="Move image right"
                >
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={16}
                    color={index === draft.gallery.length - 1 ? theme.textMuted : theme.text}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconAction, { borderColor: theme.outline, backgroundColor: theme.background }]}
                  onPress={() => onRemovePhoto(index)}
                  accessibilityLabel="Delete image"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
      {Array.from({ length: emptyGallerySlots }).map((_, index) => (
        <TouchableOpacity
          key={`empty-slot-${index}`}
          style={[styles.emptyGalleryCard, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
          onPress={onPickGallery}
        >
          <View style={[styles.emptyGalleryIconWrap, { backgroundColor: withAlpha(theme.tint, '16') }]}>
            <MaterialCommunityIcons name="image-plus" size={22} color={theme.tint} />
          </View>
          <Text style={[styles.emptyGalleryTitle, { color: theme.text }]}>Open slot {draft.gallery.length + index + 1}</Text>
          <Text style={[styles.emptyGalleryBody, { color: theme.textMuted }]}>
            Add one more scene.
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  galleryRail: {
    gap: 12,
    paddingRight: 10,
  },
  galleryCard: {
    width: 150,
    borderWidth: 1,
    borderRadius: 17,
    overflow: 'hidden',
    shadowColor: '#0C1418',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  galleryImageWrap: {
    height: 136,
    padding: 7,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  galleryCardTop: {
    position: 'absolute',
    top: 9,
    left: 9,
    right: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  heroChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroChipText: {
    fontSize: 9.5,
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  sceneCountPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sceneCountPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'Manrope_700Bold',
  },
  galleryBody: {
    padding: 7,
    paddingTop: 0,
    gap: 7,
  },
  galleryPrimaryAction: {
    flex: 1,
    justifyContent: 'center',
  },
  galleryUtilityRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  miniAction: {
    minHeight: 30,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniActionGhost: {
    backgroundColor: 'rgba(7,20,26,0.18)',
  },
  miniActionText: {
    fontSize: 9.5,
    fontFamily: 'Manrope_700Bold',
  },
  iconAction: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGalleryCard: {
    width: 154,
    minHeight: 204,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyGalleryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGalleryTitle: {
    fontSize: 13.5,
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  emptyGalleryBody: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    fontFamily: 'Manrope_500Medium',
  },
});
