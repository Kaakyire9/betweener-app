import { logger } from '@/lib/telemetry/logger';
import {
  MAX_PROFILE_GALLERY_ITEMS,
  type ProfileMediaDraft,
} from '@/lib/profile/media-studio';
import ProfileStudioGallery from '@/components/profile/media-studio/ProfileStudioGallery';
import ProfileStudioActionTile from '@/components/profile/media-studio/ProfileStudioActionTile';
import ProfileStudioSheets from '@/components/profile/media-studio/ProfileStudioSheets';
import ProfileStoryLayerChip from '@/components/profile/media-studio/ProfileStoryLayerChip';
import ProfileStudioNotesCard from '@/components/profile/media-studio/ProfileStudioNotesCard';
import ProfileStudioPreview from '@/components/profile/media-studio/ProfileStudioPreview';
import {
  buildStoryLayers,
  buildStudioNotes,
  layerStateLabel,
  PREVIEW_MODES,
  type LayerKey,
  type PreviewMode,
  type ProfileStoryLayer,
  type StudioTheme as Theme,
  withAlpha,
} from '@/components/profile/media-studio/model';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  theme: Theme;
  isDark: boolean;
  draft: ProfileMediaDraft;
  previewVideoUrl?: string | null;
  profileInitials: string;
  uploading: boolean;
  videoUploading: boolean;
  onPickAvatar: () => void;
  onPickGallery: () => void;
  onPickVideo: () => void;
  onRemoveVideo: () => void;
  onRefineHero: (index: number) => void;
  onRefineAvatar: (index: number) => void;
  onMoveLeft: (index: number) => void;
  onMoveRight: (index: number) => void;
  onRemovePhoto: (index: number) => void;
};


export default function ProfileMediaStudioSection({
  theme,
  isDark,
  draft,
  previewVideoUrl,
  profileInitials,
  uploading,
  videoUploading,
  onPickAvatar,
  onPickGallery,
  onPickVideo,
  onRemoveVideo,
  onRefineHero,
  onRefineAvatar,
  onMoveLeft,
  onMoveRight,
  onRemovePhoto,
}: Props) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('card');
  const hasLoggedViewRef = useRef(false);
  const hasLoggedInitialPreviewRef = useRef(false);
  const notes = useMemo(() => buildStudioNotes(draft), [draft]);
  const storyLayers = useMemo(() => buildStoryLayers(draft), [draft]);
  const emptyGallerySlots = Math.max(0, MAX_PROFILE_GALLERY_ITEMS - draft.gallery.length);
  const slotSummary = `${draft.gallery.length}/${MAX_PROFILE_GALLERY_ITEMS} story layers`;
  const [selectedLayerKey, setSelectedLayerKey] = useState<LayerKey | null>(null);
  const [notesSheetVisible, setNotesSheetVisible] = useState(false);
  const selectedLayer = storyLayers.find((layer) => layer.key === selectedLayerKey) ?? null;
  const headerStatusLine = storyLayers
    .map((layer) => `${layer.label} ${layerStateLabel(layer)}`)
    .join('   ');

  useEffect(() => {
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    logger.info('[profile-studio] profile_studio_viewed', {
      hasAvatar: Boolean(draft.avatarUrl),
      hasHero: Boolean(draft.heroImageUrl),
      hasVideo: Boolean(draft.profileVideoUrl),
      galleryCount: draft.gallery.length,
    });
  }, [draft.avatarUrl, draft.gallery.length, draft.heroImageUrl, draft.profileVideoUrl]);

  useEffect(() => {
    if (!hasLoggedInitialPreviewRef.current) {
      hasLoggedInitialPreviewRef.current = true;
      return;
    }
    logger.info('[profile-studio] profile_studio_preview_tab_changed', { mode: previewMode });
  }, [previewMode]);

  const handleLayerAction = (layer: ProfileStoryLayer) => {
    logger.info('[profile-studio] profile_studio_layer_action', {
      layer: layer.key,
      state: layer.state,
      actionLabel: layer.actionLabel,
    });
    switch (layer.key) {
      case 'avatar':
        onPickAvatar();
        break;
      case 'hero':
      case 'gallery':
        onPickGallery();
        break;
      case 'video':
        if (draft.profileVideoUrl) {
          onRemoveVideo();
        } else {
          onPickVideo();
        }
        break;
    }
  };

  const handlePreviewModeChange = (mode: PreviewMode) => {
    setPreviewMode(mode);
  };

  const handleLayerOpen = (layer: ProfileStoryLayer) => {
    logger.info('[profile-studio] profile_studio_layer_tapped', {
      layer: layer.key,
      state: layer.state,
      value: layer.value ?? null,
    });
    setSelectedLayerKey(layer.key);
  };

  const handleNotesOpen = () => {
    logger.info('[profile-studio] profile_studio_note_opened', {
      noteCount: notes.length,
    });
    setNotesSheetVisible(true);
  };

  const handlePickGallery = () => {
    logger.info('[profile-studio] profile_studio_gallery_import', {
      galleryCount: draft.gallery.length,
    });
    onPickGallery();
  };

  const handlePickAvatar = () => {
    logger.info('[profile-studio] profile_studio_avatar_changed', {
      hasAvatar: Boolean(draft.avatarUrl),
    });
    onPickAvatar();
  };

  const handlePickVideo = () => {
    logger.info('[profile-studio] profile_studio_video_added', {
      hasVideo: Boolean(draft.profileVideoUrl),
    });
    onPickVideo();
  };

  const handleMoveGallery = (from: number, to: number) => {
    logger.info('[profile-studio] profile_studio_gallery_reordered', {
      from,
      to,
    });
    if (to < from) {
      onMoveLeft(from);
      return;
    }
    onMoveRight(from);
  };

  const handleSetHero = (index: number) => {
    logger.info('[profile-studio] profile_studio_hero_set', { index });
    onRefineHero(index);
  };

  return (
    <View style={styles.section}>
      <LinearGradient
        colors={isDark ? ['#0C2328', '#111A27', '#16131F'] : ['#FBF5ED', '#F3FBF8', '#F6EFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.sectionHeader,
          styles.headerCard,
          {
            borderColor: withAlpha(theme.tint, isDark ? '2C' : '24'),
            shadowColor: isDark ? '#000000' : theme.accent,
          },
        ]}
      >
        <View style={styles.headerGlowA} pointerEvents="none" />
        <View style={styles.headerGlowB} pointerEvents="none" />
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionBadge, { backgroundColor: withAlpha(theme.tint, '14'), borderColor: withAlpha(theme.tint, '32') }]}>
            <Text style={[styles.sectionEyebrow, { color: theme.tint }]}>Profile Studio</Text>
          </View>
          <View style={styles.headerPillRail}>
            <View style={[styles.sectionHeaderPill, { backgroundColor: withAlpha('#07141A', isDark ? '46' : '06'), borderColor: withAlpha(theme.textMuted, '22') }]}>
              <MaterialCommunityIcons name="movie-open-star-outline" size={13} color={theme.accent} />
              <Text style={[styles.sectionHeaderPillText, { color: theme.textMuted }]}>{slotSummary}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Shape your first impression</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>Choose what people see first.</Text>
        <Text style={[styles.headerStatusLine, { color: theme.textMuted }]}>{headerStatusLine}</Text>
      </LinearGradient>

      <View style={styles.previewBlock}>
        <View style={styles.previewHeader}>
          <View style={styles.previewHeaderCopy}>
            <Text style={[styles.previewHeaderText, { color: theme.text }]}>Preview</Text>
            <Text style={[styles.previewHeaderSubtext, { color: theme.textMuted }]}>
              {draft.profileVideoUrl ? 'A warmer first impression.' : 'Choose what opens first.'}
            </Text>
          </View>
          <View style={[styles.previewTabs, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
            {PREVIEW_MODES.map((mode) => {
              const active = previewMode === mode.key;
              return (
                <Pressable
                  key={mode.key}
                  onPress={() => handlePreviewModeChange(mode.key)}
                  style={[styles.previewTab, active ? styles.previewTabActive : null, active ? { backgroundColor: theme.tint } : null]}
                >
                  <Text style={[styles.previewTabText, { color: active ? '#07141A' : theme.textMuted }]}>
                    {mode.key === 'full' ? 'Full' : mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ProfileStudioPreview
          theme={theme}
          draft={draft}
          previewVideoUrl={previewVideoUrl}
          profileInitials={profileInitials}
          isDark={isDark}
          mode={previewMode}
        />
      </View>

      <View style={styles.storyLayersHeader}>
        <Text style={[styles.storyLayersTitle, { color: theme.text }]}>Story layers</Text>
      </View>
      <View style={styles.storyLayerGrid}>
        {storyLayers.map((layer) => (
          <ProfileStoryLayerChip key={layer.key} theme={theme} layer={layer} onPress={() => handleLayerOpen(layer)} />
        ))}
      </View>

      <View style={[styles.actionRail, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
        <View style={styles.actionRailHeader}>
          <Text style={[styles.actionRailTitle, { color: theme.text }]}>Studio tools</Text>
          <Text style={[styles.actionRailHint, { color: theme.textMuted }]}>Quick actions</Text>
        </View>
        <ProfileStudioActionTile
          theme={theme}
          title="Import media"
          subtitle="Bring in more scenes at once."
          icon="image-multiple-outline"
          meta={draft.gallery.length >= MAX_PROFILE_GALLERY_ITEMS ? 'Full' : `${draft.gallery.length}/${MAX_PROFILE_GALLERY_ITEMS}`}
          featured
          disabled={uploading || draft.gallery.length >= MAX_PROFILE_GALLERY_ITEMS}
          onPress={handlePickGallery}
        />
        <View style={styles.actionSplitRow}>
          <View style={styles.actionSplitItem}>
            <ProfileStudioActionTile
              theme={theme}
              title="Change avatar"
              subtitle="Lead face"
              icon="account-circle-outline"
              disabled={uploading}
              onPress={handlePickAvatar}
            />
          </View>
          <View style={styles.actionSplitItem}>
            <ProfileStudioActionTile
              theme={theme}
              title={draft.profileVideoUrl ? 'Edit video' : 'Add video'}
              subtitle={draft.profileVideoUrl ? 'Motion layer' : 'Add motion'}
              icon={draft.profileVideoUrl ? 'video-outline' : 'video-plus'}
              disabled={videoUploading}
              onPress={handlePickVideo}
            />
          </View>
        </View>
        <View style={styles.actionSplitRow}>
          <View style={styles.actionSplitItem}>
            <ProfileStudioActionTile
              theme={theme}
              title="Remove video"
              subtitle="Clear motion"
              icon="video-minus-outline"
              disabled={videoUploading || !draft.profileVideoUrl}
              onPress={onRemoveVideo}
            />
          </View>
          <View style={styles.actionSplitItem}>
            <ProfileStudioActionTile
              theme={theme}
              title="Reorder"
              subtitle="Shuffle scenes"
              icon="swap-horizontal"
              disabled={uploading || draft.gallery.length < 2}
              onPress={handlePickGallery}
            />
          </View>
        </View>
      </View>

      <View style={styles.galleryHeader}>
        <Text style={[styles.galleryTitle, { color: theme.text }]}>Gallery story</Text>
        <Text style={[styles.galleryHint, { color: theme.textMuted }]}>
          Arrange the scenes people see.
        </Text>
      </View>

      <ProfileStudioGallery
        theme={theme}
        draft={draft}
        emptyGallerySlots={emptyGallerySlots}
        onPickGallery={handlePickGallery}
        onSetHero={handleSetHero}
        onMakeAvatar={onRefineAvatar}
        onMoveGallery={handleMoveGallery}
        onRemovePhoto={onRemovePhoto}
      />

      <ProfileStudioNotesCard theme={theme} notes={notes} onPress={handleNotesOpen} />

      <ProfileStudioSheets
        theme={theme}
        selectedLayer={selectedLayer}
        notes={notes}
        notesSheetVisible={notesSheetVisible}
        onCloseLayer={() => setSelectedLayerKey(null)}
        onCloseNotes={() => setNotesSheetVisible(false)}
        onPrimaryLayerAction={(layer) => {
          setSelectedLayerKey(null);
          handleLayerAction(layer);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    gap: 7,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  headerGlowA: {
    position: 'absolute',
    right: -24,
    top: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(0,160,160,0.10)',
  },
  headerGlowB: {
    position: 'absolute',
    left: -18,
    bottom: -44,
    width: 154,
    height: 154,
    borderRadius: 77,
    backgroundColor: 'rgba(153,122,255,0.08)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerPillRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.45,
    textTransform: 'uppercase',
  },
  sectionHeaderPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionHeaderPillText: {
    fontSize: 10.5,
    fontFamily: 'Manrope_700Bold',
  },
  sectionTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -0.4,
    maxWidth: '88%',
  },
  sectionSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
    maxWidth: '88%',
  },
  headerStatusLine: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'Manrope_600SemiBold',
  },
  previewBlock: {
    gap: 10,
  },
  storyLayersHeader: {
    paddingTop: 0,
  },
  storyLayersTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  storyLayerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionRail: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
    gap: 8,
    shadowColor: '#0C1418',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  actionRailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  actionRailTitle: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
  },
  actionRailHint: {
    fontSize: 9.5,
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionSplitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionSplitItem: {
    flex: 1,
  },
  previewHeader: {
    gap: 10,
  },
  previewHeaderCopy: {
    gap: 3,
  },
  previewHeaderText: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
  previewHeaderSubtext: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Manrope_500Medium',
  },
  previewTabs: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    padding: 3,
    gap: 4,
  },
  previewTab: {
    minWidth: 72,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
  },
  previewTabActive: {
    shadowColor: '#008080',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  previewTabText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
  },
  galleryHeader: {
    gap: 3,
  },
  galleryTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  galleryHint: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Manrope_500Medium',
  },
});
