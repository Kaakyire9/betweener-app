import OfflineImage from '@/components/media/OfflineImage';
import ProfileInlineVideoSurface from '@/components/profile/ProfileInlineVideoSurface';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { type PreviewMode, type StudioTheme } from './model';
import { type ProfileMediaDraft } from '@/lib/profile/media-studio';

type Props = {
  theme: StudioTheme;
  draft: ProfileMediaDraft;
  previewVideoUrl?: string | null;
  profileInitials: string;
  isDark: boolean;
  mode: PreviewMode;
};

function StudioHeroPreview({
  theme,
  draft,
  previewVideoUrl,
  profileInitials,
  isDark,
}: Omit<Props, 'mode'>) {
  const hasHeroImage = !!draft.heroImageUrl;
  const hasIntroVideo = !!draft.profileVideoUrl;
  const previewPosterUri = draft.heroImageUrl || draft.gallery[0] || draft.avatarUrl || null;

  return (
    <View style={[styles.previewHero, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
      <LinearGradient
        colors={isDark ? ['#102A2F', '#151D2C'] : ['#D8F4F3', '#EFE5FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {hasIntroVideo ? (
        <ProfileInlineVideoSurface
          videoUrl={previewVideoUrl || draft.profileVideoUrl}
          posterUri={previewPosterUri}
          shouldPlay
          muted
        />
      ) : hasHeroImage ? (
        <OfflineImage
          uri={draft.heroImageUrl}
          style={StyleSheet.absoluteFillObject}
          containerStyle={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.previewHeroGlowA} pointerEvents="none" />
      <View style={styles.previewHeroGlowB} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(4,12,16,0.08)', 'rgba(4,12,16,0.48)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.previewHeroTopBar}>
        <View style={[styles.previewPill, { backgroundColor: 'rgba(7,20,26,0.56)', borderColor: 'rgba(255,255,255,0.18)' }]}>
          <MaterialCommunityIcons
            name={hasIntroVideo ? 'play-circle-outline' : hasHeroImage ? 'image-outline' : 'plus-circle-outline'}
            size={12}
            color="#FFFFFF"
          />
          <Text style={styles.previewPillText}>{hasIntroVideo || hasHeroImage ? 'Preview' : 'Add opening'}</Text>
        </View>
      </View>
      <View style={styles.previewHeroBottom}>
        <View style={styles.previewAvatarWrap}>
          <View style={[styles.previewAvatarRing, { borderColor: theme.tint }]}>
            {draft.avatarUrl ? (
              <OfflineImage uri={draft.avatarUrl} style={styles.previewAvatar} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={isDark ? ['#184552', '#1E2E43'] : ['#C8F2ED', '#E9DDFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.previewAvatar, styles.previewAvatarFallback]}
              >
                <Text style={styles.previewAvatarInitials}>{profileInitials}</Text>
              </LinearGradient>
            )}
          </View>
        </View>
        <View style={styles.previewHeroCopy}>
          <Text style={styles.previewHeroTitle}>Opening scene</Text>
          <Text style={styles.previewHeroSubtitle} numberOfLines={2}>
            {hasIntroVideo ? 'Motion adds presence.' : hasHeroImage ? 'A calmer first impression.' : 'Choose your opening scene.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ProfileStudioPreview({
  theme,
  draft,
  previewVideoUrl,
  profileInitials,
  isDark,
  mode,
}: Props) {
  const previewPosterUri = draft.heroImageUrl || draft.gallery[0] || draft.avatarUrl || null;

  if (mode === 'card' || mode === 'full') {
    return (
      <View style={[styles.previewSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
        <StudioHeroPreview
          theme={theme}
          draft={draft}
          previewVideoUrl={previewVideoUrl}
          profileInitials={profileInitials}
          isDark={isDark}
        />
        <View style={styles.previewCopy}>
          <Text style={[styles.previewTitle, { color: theme.text }]}>{mode === 'card' ? 'Card view' : 'Full view'}</Text>
          <Text style={[styles.previewSubtitle, { color: theme.textMuted }]}>
            {mode === 'card' ? 'A composed first look.' : draft.profileVideoUrl ? 'Your opening feels alive.' : 'Your opening stays clean.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.previewSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailRail}>
        {(draft.gallery.length ? draft.gallery : [draft.avatarUrl]).filter(Boolean).slice(0, 4).map((uri, index) => (
          <View key={`${uri}-${index}`} style={[styles.detailThumbWrap, { borderColor: theme.outline }]}>
            <OfflineImage uri={uri} style={styles.detailThumb} contentFit="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(4,12,16,0.36)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {index === 0 ? (
              <View style={[styles.detailHeroBadge, { backgroundColor: theme.tint }]}>
                <Text style={styles.detailHeroBadgeText}>Hero</Text>
              </View>
            ) : null}
          </View>
        ))}
        {draft.profileVideoUrl ? (
          <View style={[styles.detailThumbWrap, { borderColor: theme.outline, backgroundColor: '#09131A' }]}>
            {previewPosterUri ? <OfflineImage uri={previewPosterUri} style={styles.detailThumb} contentFit="cover" /> : null}
            <LinearGradient
              colors={['transparent', 'rgba(4,12,16,0.44)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.detailVideoBadge, { backgroundColor: 'rgba(7,20,26,0.76)' }]}>
              <MaterialCommunityIcons name="play-circle-outline" size={12} color="#FFFFFF" />
              <Text style={styles.detailVideoBadgeText}>Intro</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.previewCopy}>
        <Text style={[styles.previewTitle, { color: theme.text }]}>Detail rail</Text>
        <Text style={[styles.previewSubtitle, { color: theme.textMuted }]}>The still scenes stay easy to scan.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewSurface: {
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0C1418',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  previewHero: {
    height: 224,
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    margin: 12,
    marginBottom: 0,
  },
  previewHeroGlowA: {
    position: 'absolute',
    right: -16,
    top: -8,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  previewHeroGlowB: {
    position: 'absolute',
    left: -20,
    bottom: -22,
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(0,160,160,0.16)',
  },
  previewHeroTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  previewPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewPillText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
  },
  previewHeroBottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  previewAvatarWrap: {
    alignSelf: 'flex-end',
  },
  previewAvatarRing: {
    borderWidth: 3,
    borderRadius: 38,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  previewAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  previewAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarInitials: {
    fontSize: 22,
    color: '#fff',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  previewHeroCopy: {
    flex: 1,
    gap: 2,
    paddingBottom: 4,
  },
  previewHeroTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    lineHeight: 22,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  previewHeroSubtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_600SemiBold',
  },
  previewCopy: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 4,
  },
  previewTitle: {
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
  },
  previewSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
  detailRail: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingBottom: 4,
  },
  detailThumbWrap: {
    width: 82,
    height: 96,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailThumb: {
    width: '100%',
    height: '100%',
  },
  detailHeroBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  detailHeroBadgeText: {
    fontSize: 10,
    color: '#07141A',
    fontFamily: 'Manrope_700Bold',
  },
  detailVideoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailVideoBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
  },
});
