import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useResponsiveMetrics } from '@/lib/responsive';
import type { CirclePulseItem, CirclePulseItemType } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  items: CirclePulseItem[];
  loading?: boolean;
  error?: string | null;
  isMember: boolean;
  canManage: boolean;
  joinLabel?: string;
  onJoin?: () => void;
  onAddToPulse?: () => void;
  onAnswerPrompt?: (promptId: string) => void;
  onOpenGathering?: (gatheringId: string) => void;
  onOpenMedia?: (item: CirclePulseItem) => void;
  onOpenComments?: (item: CirclePulseItem) => void;
  onOpenFeaturedProfile?: (profileId: string) => void;
  onSendSignal?: (profileId: string, name?: string | null) => void;
  onEndLoveSeat?: (item: CirclePulseItem) => void;
  viewerProfileId?: string | null;
};

const FILTERS: { key: string; types: CirclePulseItemType[]; label: string; icon: string }[] = [
  { key: 'prompt', types: ['prompt'], label: 'Prompt', icon: 'comment-question-outline' },
  { key: 'gathering', types: ['gathering'], label: 'Gathering', icon: 'calendar-heart' },
  { key: 'seat', types: ['welcome', 'love_seat'], label: 'Seats', icon: 'heart-outline' },
  { key: 'media', types: ['media'], label: 'Media', icon: 'image-outline' },
  { key: 'host_note', types: ['host_note'], label: 'Host Note', icon: 'message-text-outline' },
];

const TYPE_ORDER: Record<CirclePulseItemType, number> = {
  prompt: 1,
  gathering: 2,
  welcome: 3,
  love_seat: 4,
  media: 5,
  host_note: 6,
};

const AUTO_ADVANCE_MS = 7200;

const formatDate = (value?: string | null) => {
  if (!value) return 'Coming soon';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Coming soon';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getLabel = (type: CirclePulseItemType) => {
  if (type === 'prompt') return 'Circle Prompt';
  if (type === 'gathering') return 'Gathering';
  if (type === 'welcome') return 'Welcome Seat';
  if (type === 'love_seat') return 'Love Seat';
  if (type === 'host_note') return 'Host Note';
  return 'Circle Media';
};

const getFirstName = (name: string) => name.trim().split(/\s+/)[0] || 'member';

function InlineCircleVideo({ uri, style }: { uri: string; style: ReturnType<typeof createStyles>['mediaImage'] }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    try { instance.play(); } catch {}
  });

  useEffect(() => {
    player.loop = true;
    player.muted = true;
    try { player.play(); } catch {}
    return () => {
      try { player.pause(); } catch {}
    };
  }, [player]);

  return <VideoView accessibilityLabel="Circle video preview" player={player} style={style} contentFit="cover" nativeControls={false} />;
}

const MEDIA_WAVEFORM = [16, 28, 21, 36, 25, 42, 31, 38, 22, 32, 18];

const getMediaLabel = (item: CirclePulseItem) => {
  if (item.momentId) {
    if (item.mediaType === 'video') return 'Video Moment';
    if (item.mediaType === 'audio') return 'Audio Moment';
    return 'Photo Moment';
  }
  if (item.mediaType === 'video') return 'Circle Video';
  if (item.mediaType === 'audio') return 'Circle Audio';
  return 'Circle Image';
};

const getMediaActionLabel = (item: CirclePulseItem) => {
  if (item.mediaType === 'video') return item.momentId ? 'Watch moment' : 'Watch video';
  if (item.mediaType === 'audio') return 'Listen now';
  return item.momentId ? 'View photo' : 'View image';
};

const getMediaIcon = (mediaType?: CirclePulseItem['mediaType']) => {
  if (mediaType === 'video') return 'play';
  if (mediaType === 'audio') return 'headphones';
  return 'image-outline';
};

export default function CirclePulseBoard({
  items,
  loading = false,
  error = null,
  isMember,
  canManage,
  joinLabel = 'Join Circle',
  onJoin,
  onAddToPulse,
  onAnswerPrompt,
  onOpenGathering,
  onOpenMedia,
  onOpenComments,
  onOpenFeaturedProfile,
  onSendSignal,
  onEndLoveSeat,
  viewerProfileId,
}: Props) {
  const responsive = useResponsiveMetrics();
  const palette = useCirclePulsePalette();
  const styles = useMemo(
    () => createStyles(responsive.compactWidth, responsive.compactHeight, palette),
    [palette, responsive.compactHeight, responsive.compactWidth],
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [welcomeProfileIndex, setWelcomeProfileIndex] = useState(0);
  const transitionProgress = useRef(new Animated.Value(1)).current;
  const transitioningRef = useRef(false);
  const orderedItems = useMemo(
    () => [...items].sort((left, right) => {
      const typeDifference = TYPE_ORDER[left.type] - TYPE_ORDER[right.type];
      if (typeDifference !== 0) return typeDifference;
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.id.localeCompare(right.id);
    }),
    [items],
  );
  const selectedItem = useMemo(
    () => orderedItems.find((item) => item.id === selectedItemId) ?? orderedItems[0] ?? null,
    [orderedItems, selectedItemId],
  );
  const activeType = selectedItem?.type ?? null;
  const selectedItemIndex = selectedItem ? orderedItems.findIndex((item) => item.id === selectedItem.id) : -1;
  const welcomeProfiles = selectedItem?.type === 'welcome' ? selectedItem.welcomeProfiles.slice(0, 3) : [];
  const welcomeProfile = welcomeProfiles[welcomeProfileIndex] ?? welcomeProfiles[0] ?? null;
  const imageUri = selectedItem?.imageUrl || (selectedItem?.mediaType === 'image' ? selectedItem.mediaUrl : null);
  const isLoveSeatOwner = !!selectedItem?.featuredProfileId && selectedItem.featuredProfileId === viewerProfileId;
  const selectItem = useCallback((itemId: string) => {
    if (itemId === selectedItem?.id || transitioningRef.current) return;
    transitioningRef.current = true;
    Animated.timing(transitionProgress, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setWelcomeProfileIndex(0);
      setSelectedItemId(itemId);
      Animated.timing(transitionProgress, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        transitioningRef.current = false;
      });
    });
  }, [selectedItem?.id, transitionProgress]);
  const showAdjacentItem = useCallback((direction: -1 | 1) => {
    if (orderedItems.length < 2 || selectedItemIndex < 0) return;
    const nextIndex = (selectedItemIndex + direction + orderedItems.length) % orderedItems.length;
    selectItem(orderedItems[nextIndex].id);
  }, [orderedItems, selectItem, selectedItemIndex]);
  const openWelcomeDiscussion = () => {
    if (!selectedItem || selectedItem.type !== 'welcome' || !welcomeProfile) return;
    onOpenComments?.({
      ...selectedItem,
      welcomeProfiles: [welcomeProfile, ...welcomeProfiles.filter((profile) => profile.profileId !== welcomeProfile.profileId)],
    });
  };
  const showAdjacentWelcomeProfile = (direction: -1 | 1) => {
    if (welcomeProfiles.length < 2) return;
    setWelcomeProfileIndex((current) => (current + direction + welcomeProfiles.length) % welcomeProfiles.length);
  };

  useEffect(() => {
    setWelcomeProfileIndex(0);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!isMember || orderedItems.length < 2) return;
    const timer = setInterval(() => showAdjacentItem(1), AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [isMember, orderedItems.length, selectedItem?.id, showAdjacentItem]);

  const animatedFeatureStyle = useMemo(
    () => ({
      opacity: transitionProgress,
      transform: [
        {
          translateY: transitionProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
        {
          scale: transitionProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.985, 1],
          }),
        },
      ],
    }) as any,
    [transitionProgress],
  );

  const renderAction = () => {
    if (!selectedItem) return null;
    if (selectedItem.type === 'prompt' && selectedItem.promptId) {
      return (
        <TouchableOpacity style={styles.primaryButton} onPress={() => onAnswerPrompt?.(selectedItem.promptId!)}>
          <Text style={styles.primaryButtonText}>Answer</Text>
        </TouchableOpacity>
      );
    }
    if (selectedItem.type === 'gathering' && selectedItem.gatheringId) {
      return (
        <TouchableOpacity style={styles.primaryButton} onPress={() => onOpenGathering?.(selectedItem.gatheringId!)}>
          <Text style={styles.primaryButtonText}>RSVP</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <LinearGradient
      colors={palette.gradient}
      style={styles.board}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Circle Pulse</Text>
          <Text style={styles.headerCopy}>What&apos;s alive in this Circle right now.</Text>
        </View>
        <View style={styles.pulseIcon}>
          <MaterialCommunityIcons name="pulse" size={21} color={palette.teal} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTrack} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((filter) => {
          const active = !!activeType && filter.types.includes(activeType);
          const available = orderedItems.some((item) => filter.types.includes(item.type));
          return (
            <Pressable
              key={filter.key}
              style={[styles.filterChip, active && styles.filterChipActive, !available && styles.filterChipUnavailable]}
              disabled={!available}
              onPress={() => {
                const item = orderedItems.find((candidate) => filter.types.includes(candidate.type));
                if (item) selectItem(item.id);
              }}
            >
              <MaterialCommunityIcons name={filter.icon as any} size={15} color={active ? palette.text : palette.textMuted} />
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!isMember ? (
        <View style={styles.emptyBody}>
          <MaterialCommunityIcons name="account-lock-outline" size={30} color={palette.purple} />
          <Text style={styles.title}>Step inside the Circle</Text>
          <Text style={styles.body}>Join this trusted space to see its current Prompt, Gathering, and host spotlights.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onJoin}>
            <Text style={styles.primaryButtonText}>{joinLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : loading && items.length === 0 ? (
        <View style={styles.emptyBody}>
          <View style={styles.loadingLineWide} />
          <View style={styles.loadingLine} />
          <View style={styles.loadingLineShort} />
        </View>
      ) : selectedItem ? (
        <Animated.View style={[styles.featureBody, animatedFeatureStyle]}>
          {selectedItem.type === 'welcome' && welcomeProfile ? (
            <View style={styles.loveSeatHero}>
              <Pressable
                accessibilityLabel={`View ${welcomeProfile.name} profile`}
                style={styles.loveSeatAvatarRing}
                onPress={() => onOpenFeaturedProfile?.(welcomeProfile.profileId)}
              >
                {welcomeProfile.avatarUrl ? (
                  <Image source={{ uri: welcomeProfile.avatarUrl }} style={styles.loveSeatAvatar} contentFit="cover" transition={160} />
                ) : (
                  <View style={styles.loveSeatAvatarFallback}>
                    <MaterialCommunityIcons name="account-heart-outline" size={34} color={palette.purple} />
                  </View>
                )}
                <View style={styles.welcomeSpark}>
                  <MaterialCommunityIcons name="hand-wave" size={14} color="#F4E8D0" />
                </View>
              </Pressable>
              <View style={styles.loveSeatCopy}>
                <View style={styles.welcomeLabelRow}>
                  <Text style={styles.label}>Welcome Seat</Text>
                  <Text style={styles.newPill}>New</Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>{welcomeProfile.name}</Text>
                {welcomeProfile.location ? <Text style={styles.meta}>{welcomeProfile.location}</Text> : null}
                <Text style={styles.loveSeatQuote} numberOfLines={4}>
                  Say hello and help {getFirstName(welcomeProfile.name)} feel at home in this Circle.
                </Text>
                {welcomeProfiles.length > 1 ? (
                  <View style={styles.welcomePager}>
                    <Pressable accessibilityLabel="Previous new member" style={styles.welcomePagerButton} onPress={() => showAdjacentWelcomeProfile(-1)}>
                      <MaterialCommunityIcons name="chevron-left" size={15} color={palette.textMuted} />
                    </Pressable>
                    <Text style={styles.welcomePagerText}>{welcomeProfileIndex + 1} of {welcomeProfiles.length}</Text>
                    <Pressable accessibilityLabel="Next new member" style={styles.welcomePagerButton} onPress={() => showAdjacentWelcomeProfile(1)}>
                      <MaterialCommunityIcons name="chevron-right" size={15} color={palette.textMuted} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ) : selectedItem.type === 'love_seat' ? (
            <View style={styles.loveSeatHero}>
              <View style={styles.loveSeatAvatarRing}>
                {selectedItem.featuredProfileAvatarUrl ? (
                  <Image source={{ uri: selectedItem.featuredProfileAvatarUrl }} style={styles.loveSeatAvatar} contentFit="cover" transition={160} />
                ) : (
                  <View style={styles.loveSeatAvatarFallback}>
                    <MaterialCommunityIcons name="account-heart-outline" size={34} color={palette.purple} />
                  </View>
                )}
                <View style={styles.loveSeatHeart}>
                  <MaterialCommunityIcons name="heart" size={14} color="#F4E8D0" />
                </View>
              </View>
              <View style={styles.loveSeatCopy}>
                <Text style={styles.label}>Love Seat</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {selectedItem.featuredProfileName || 'Circle member'}
                  {selectedItem.featuredProfileAge ? `, ${selectedItem.featuredProfileAge}` : ''}
                </Text>
                {selectedItem.featuredProfileLocation ? <Text style={styles.meta}>{selectedItem.featuredProfileLocation}</Text> : null}
                {selectedItem.featuredProfileBadge ? <Text style={styles.loveSeatBadge}>{selectedItem.featuredProfileBadge}</Text> : null}
                {selectedItem.loveSeatQuote ? <Text style={styles.loveSeatQuote} numberOfLines={4}>&quot;{selectedItem.loveSeatQuote}&quot;</Text> : null}
              </View>
            </View>
          ) : selectedItem.type === 'media' ? (
            <Pressable accessibilityLabel="Open Circle media" style={[styles.mediaShell, styles.mediaSpotlight]} onPress={() => onOpenMedia?.(selectedItem)}>
              {selectedItem.mediaType === 'video' && selectedItem.mediaUrl ? (
                <InlineCircleVideo uri={selectedItem.mediaUrl} style={styles.mediaImage} />
              ) : imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.mediaImage} contentFit="cover" transition={160} />
              ) : selectedItem.mediaType === 'audio' ? (
                <View style={styles.audioPreview}>
                  <View style={styles.audioIcon}>
                    <MaterialCommunityIcons name="headphones" size={22} color="#F4E8D0" />
                  </View>
                  <View style={styles.audioWaveform}>
                    {MEDIA_WAVEFORM.map((height, index) => (
                      <View key={`${height}-${index}`} style={[styles.audioBar, { height }]} />
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.mediaFallback}>
                  <MaterialCommunityIcons name={getMediaIcon(selectedItem.mediaType) as any} size={26} color={palette.purple} />
                </View>
              )}
              <LinearGradient colors={['rgba(7,30,34,0.06)', 'rgba(7,30,34,0.9)']} style={styles.mediaOverlay} />
              <View style={styles.mediaTypeBadge}>
                <MaterialCommunityIcons name={getMediaIcon(selectedItem.mediaType) as any} size={13} color="#F4E8D0" />
                <Text style={styles.mediaTypeText}>{getMediaLabel(selectedItem)}</Text>
              </View>
              <View style={styles.mediaOpenIcon}>
                <MaterialCommunityIcons name={selectedItem.mediaType === 'video' ? 'play' : 'arrow-top-right'} size={17} color="#F4E8D0" />
              </View>
            </Pressable>
          ) : imageUri ? (
            <View style={styles.mediaShell}>
              <Image source={{ uri: imageUri }} style={styles.mediaImage} contentFit="cover" transition={160} />
              <LinearGradient colors={['transparent', 'rgba(7,30,34,0.82)']} style={styles.mediaOverlay} />
              {selectedItem.mediaType === 'video' ? (
                <View style={styles.playIcon}>
                  <MaterialCommunityIcons name="play" size={18} color="#F4E8D0" />
                </View>
              ) : null}
            </View>
          ) : null}
          {selectedItem.type !== 'love_seat' && selectedItem.type !== 'welcome' ? (
            <View style={styles.copyBlock}>
              <Text style={styles.label}>{getLabel(selectedItem.type)}</Text>
              <Text style={styles.title} numberOfLines={2}>{selectedItem.title || 'A thoughtful spotlight'}</Text>
              {selectedItem.type === 'gathering' ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {formatDate(selectedItem.gatheringStartsAt || selectedItem.startsAt)}
                  {selectedItem.gatheringCity ? ` - ${selectedItem.gatheringCity}` : ''}
                </Text>
              ) : null}
              {selectedItem.type === 'media' && selectedItem.subtitle && selectedItem.subtitle !== selectedItem.body ? (
                <Text style={styles.mediaSubtitle} numberOfLines={1}>{selectedItem.subtitle}</Text>
              ) : null}
              {selectedItem.body ? <Text style={styles.body} numberOfLines={imageUri ? 3 : 5}>{selectedItem.body}</Text> : null}
              {selectedItem.type === 'gathering' ? (
                <View style={styles.badgeRow}>
                  {selectedItem.gatheringIsPartnerVenue ? <Text style={styles.badge}>Partner venue</Text> : null}
                  {selectedItem.gatheringSafeFirstDateSpace ? <Text style={styles.badge}>Safe first-date space</Text> : null}
                  {selectedItem.gatheringAttendeeCount > 0 ? <Text style={styles.badge}>{selectedItem.gatheringAttendeeCount} attending</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {selectedItem.type === 'welcome' && welcomeProfile ? (
            <>
              <View style={styles.loveSeatActions}>
                <TouchableOpacity style={[styles.loveSeatButton, styles.loveSeatPrimaryButton]} onPress={() => onOpenFeaturedProfile?.(welcomeProfile.profileId)}>
                  <MaterialCommunityIcons name="account-outline" size={15} color={palette.tealInk} />
                  <Text style={styles.loveSeatPrimaryText}>View profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.loveSeatButton} onPress={openWelcomeDiscussion}>
                  <MaterialCommunityIcons name="hand-wave-outline" size={15} color={palette.purple} />
                  <Text style={styles.secondaryLoveSeatText}>Welcome {getFirstName(welcomeProfile.name)}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.loveSeatFooter}>
                <Pressable accessibilityLabel="Open discussion" style={styles.footerMeta} onPress={openWelcomeDiscussion}>
                  <MaterialCommunityIcons name="message-outline" size={15} color={palette.textMuted} />
                  <Text style={styles.footerText}>{selectedItem.commentCount > 0 ? `${selectedItem.commentCount} comments` : 'Start discussion'}</Text>
                </Pressable>
              </View>
            </>
          ) : selectedItem.type === 'media' ? (
            <>
              <View style={styles.mediaActions}>
                <TouchableOpacity accessibilityLabel="Open Circle media" style={[styles.mediaActionButton, styles.mediaPrimaryAction]} onPress={() => onOpenMedia?.(selectedItem)}>
                  <MaterialCommunityIcons name={getMediaIcon(selectedItem.mediaType) as any} size={15} color={palette.tealInk} />
                  <Text style={styles.mediaPrimaryActionText}>{getMediaActionLabel(selectedItem)}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityLabel="Open media discussion" style={styles.mediaActionButton} onPress={() => onOpenComments?.(selectedItem)}>
                  <MaterialCommunityIcons name="message-outline" size={15} color={palette.purple} />
                  <Text style={styles.mediaSecondaryActionText}>{selectedItem.commentCount > 0 ? `${selectedItem.commentCount} comments` : 'Discuss'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : selectedItem.type === 'love_seat' && selectedItem.featuredProfileId ? (
            <>
              <View style={styles.loveSeatActions}>
                <TouchableOpacity style={[styles.loveSeatButton, styles.loveSeatPrimaryButton]} onPress={() => onOpenFeaturedProfile?.(selectedItem.featuredProfileId!)}>
                  <MaterialCommunityIcons name="account-outline" size={15} color={palette.tealInk} />
                  <Text style={styles.loveSeatPrimaryText}>View profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.loveSeatButton} onPress={() => onOpenComments?.(selectedItem)}>
                  <MaterialCommunityIcons name="comment-question-outline" size={15} color={palette.purple} />
                  <Text style={styles.secondaryLoveSeatText}>Ask a question</Text>
                </TouchableOpacity>
                {!isLoveSeatOwner ? (
                  <TouchableOpacity style={styles.loveSeatButton} onPress={() => onSendSignal?.(selectedItem.featuredProfileId!, selectedItem.featuredProfileName)}>
                    <MaterialCommunityIcons name="heart" size={15} color={palette.purpleStrong} />
                    <Text style={styles.secondaryLoveSeatText}>Send Signal</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.loveSeatFooter}>
                <Pressable accessibilityLabel="Open discussion" style={styles.footerMeta} onPress={() => onOpenComments?.(selectedItem)}>
                  <MaterialCommunityIcons name="message-outline" size={15} color={palette.textMuted} />
                  <Text style={styles.footerText}>{selectedItem.commentCount > 0 ? `${selectedItem.commentCount} comments` : 'Start discussion'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.footer}>
              <Pressable accessibilityLabel="Open discussion" style={styles.footerMeta} onPress={() => onOpenComments?.(selectedItem)}>
                <MaterialCommunityIcons name="message-outline" size={15} color={palette.textMuted} />
                <Text style={styles.footerText}>{selectedItem.commentCount > 0 ? `${selectedItem.commentCount} comments` : 'Start discussion'}</Text>
              </Pressable>
              {renderAction()}
            </View>
          )}
          {(isLoveSeatOwner || canManage) && selectedItem.type === 'love_seat' ? (
            <Pressable style={styles.leaveLoveSeat} onPress={() => onEndLoveSeat?.(selectedItem)}>
              <Text style={styles.leaveLoveSeatText}>{isLoveSeatOwner ? 'Leave Love Seat' : 'End feature'}</Text>
            </Pressable>
          ) : null}
          {orderedItems.length > 1 ? (
            <View style={styles.mediaPager}>
              <Pressable accessibilityLabel="Previous Circle spotlight" style={styles.mediaPagerButton} onPress={() => showAdjacentItem(-1)}>
                <MaterialCommunityIcons name="chevron-left" size={17} color={palette.textMuted} />
              </Pressable>
              <View accessibilityLabel="Circle spotlight position" style={styles.carouselDashes}>
                {orderedItems.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityLabel={`Show ${getLabel(item.type)} spotlight ${index + 1}`}
                    accessibilityState={{ selected: item.id === selectedItem.id }}
                    style={[styles.carouselDash, item.id === selectedItem.id && styles.carouselDashActive]}
                    onPress={() => selectItem(item.id)}
                  />
                ))}
              </View>
              <Pressable accessibilityLabel="Next Circle spotlight" style={styles.mediaPagerButton} onPress={() => showAdjacentItem(1)}>
                <MaterialCommunityIcons name="chevron-right" size={17} color={palette.textMuted} />
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <View style={styles.emptyBody}>
          <MaterialCommunityIcons name="pulse" size={30} color={palette.teal} />
          <Text style={styles.title}>Nothing featured yet</Text>
          <Text style={styles.body}>Hosts can spotlight a Prompt, Gathering, host note, or a thoughtful piece of media.</Text>
          {canManage ? (
            <TouchableOpacity style={styles.primaryButton} onPress={onAddToPulse}>
              <Text style={styles.primaryButtonText}>Add to Pulse</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.emptyHint}>Check back soon.</Text>
          )}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {canManage && items.length > 0 ? (
        <Pressable style={styles.manageLink} onPress={onAddToPulse}>
          <MaterialCommunityIcons name="plus-circle-outline" size={15} color={palette.teal} />
          <Text style={styles.manageLinkText}>Add spotlight</Text>
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}

const createStyles = (compactWidth: boolean, compactHeight: boolean, palette: CirclePulsePalette) =>
  StyleSheet.create({
    board: {
      minHeight: compactHeight ? 300 : 334,
      padding: compactWidth ? 14 : 17,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
      gap: compactWidth ? 12 : 14,
      overflow: 'hidden',
      shadowColor: palette.tealStrong,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    eyebrow: { color: palette.teal, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.6 },
    headerCopy: { marginTop: 3, color: palette.textMuted, fontSize: 11 },
    pulseIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealSoft,
      borderWidth: 1,
      borderColor: palette.tealBorder,
    },
    filterTrack: {
      flexGrow: 0,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    filterRow: { gap: 4, padding: 4, paddingRight: 8 },
    filterChip: {
      height: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    filterChipActive: { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft },
    filterChipUnavailable: { opacity: 0.64 },
    filterText: { color: palette.textMuted, fontSize: 11, fontWeight: '800' },
    filterTextActive: { color: palette.text },
    featureBody: { flex: 1, gap: 10 },
    loveSeatHero: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 5 },
    loveSeatAvatarRing: {
      width: compactWidth ? 100 : 122,
      height: compactWidth ? 100 : 122,
      padding: 3,
      borderRadius: compactWidth ? 50 : 61,
      borderWidth: 1,
      borderColor: palette.purpleStrong,
      backgroundColor: palette.tealSoft,
    },
    loveSeatAvatar: { width: '100%', height: '100%', borderRadius: compactWidth ? 47 : 58 },
    loveSeatAvatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: compactWidth ? 47 : 58, backgroundColor: palette.purpleSoft },
    loveSeatHeart: {
      position: 'absolute',
      right: -3,
      bottom: 3,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.purpleStrong,
    },
    welcomeSpark: {
      position: 'absolute',
      right: -3,
      bottom: 3,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealStrong,
    },
    loveSeatCopy: { flex: 1, gap: 5 },
    welcomeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    newPill: {
      overflow: 'hidden',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 9,
      color: palette.teal,
      backgroundColor: palette.tealSoft,
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    welcomePager: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 2 },
    welcomePagerButton: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline },
    welcomePagerText: { minWidth: 34, color: palette.textMuted, fontSize: 10, fontWeight: '900', textAlign: 'center' },
    loveSeatBadge: { alignSelf: 'flex-start', color: palette.purple, fontSize: 10, fontWeight: '900' },
    loveSeatQuote: { color: palette.textSoft, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
    mediaShell: { height: compactHeight ? 108 : 124, overflow: 'hidden', borderRadius: 18, backgroundColor: palette.surfaceMuted },
    mediaSpotlight: { borderWidth: 1, borderColor: palette.tealBorder },
    mediaImage: { width: '100%', height: '100%' },
    mediaOverlay: { ...StyleSheet.absoluteFillObject },
    mediaFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.purpleSoft },
    audioPreview: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, backgroundColor: palette.tealSoft },
    audioIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,255,0.44)', borderWidth: 1, borderColor: 'rgba(217,204,255,0.54)' },
    audioWaveform: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
    audioBar: { width: 3, borderRadius: 2, backgroundColor: palette.teal },
    mediaTypeBadge: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(7,30,34,0.76)', borderWidth: 1, borderColor: 'rgba(244,232,208,0.16)' },
    mediaTypeText: { color: '#F4E8D0', fontSize: 10, fontWeight: '900' },
    mediaOpenIcon: { position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,255,0.72)', borderWidth: 1, borderColor: 'rgba(217,204,255,0.68)' },
    playIcon: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(7,30,34,0.72)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.18)',
    },
    copyBlock: { flex: 1, gap: 6 },
    label: { color: palette.purple, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
    title: { color: palette.text, fontSize: compactWidth ? 19 : 21, lineHeight: compactWidth ? 24 : 27, fontFamily: 'PlayfairDisplay_700Bold' },
    body: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
    meta: { color: palette.teal, fontSize: 12, lineHeight: 18, fontWeight: '700' },
    mediaSubtitle: { color: palette.teal, fontSize: 11, lineHeight: 16, fontWeight: '800' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    badge: {
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      color: palette.teal,
      backgroundColor: palette.tealSoft,
      fontSize: 10,
      fontWeight: '800',
    },
    footer: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    footerText: { color: palette.textMuted, fontSize: 11, fontWeight: '700' },
    loveSeatActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    loveSeatButton: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
    loveSeatPrimaryButton: { borderColor: palette.tealBorder, backgroundColor: palette.tealStrong },
    loveSeatPrimaryText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
    secondaryLoveSeatText: { color: palette.purple, fontSize: 11, fontWeight: '900' },
    loveSeatFooter: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    carouselDots: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3 },
    carouselDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.outline },
    carouselDotActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.purpleStrong },
    leaveLoveSeat: { alignSelf: 'flex-end', paddingVertical: 3 },
    leaveLoveSeatText: { color: palette.purple, fontSize: 10, fontWeight: '800' },
    mediaActions: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
    mediaPager: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
    mediaPagerButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
    carouselDashes: { minWidth: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    carouselDash: { width: 7, height: 3, borderRadius: 2, backgroundColor: palette.outline },
    carouselDashActive: { width: 22, backgroundColor: palette.purpleStrong },
    mediaActionButton: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: palette.purpleBorder, backgroundColor: palette.surfaceMuted },
    mediaPrimaryAction: { borderColor: palette.tealBorder, backgroundColor: palette.teal },
    mediaPrimaryActionText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
    mediaSecondaryActionText: { color: palette.purple, fontSize: 11, fontWeight: '900' },
    primaryButton: {
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
      paddingHorizontal: 16,
      borderRadius: 19,
      backgroundColor: palette.tealStrong,
    },
    primaryButtonText: { color: palette.tealInk, fontSize: 12, fontWeight: '900' },
    emptyBody: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 9, paddingVertical: 6 },
    emptyHint: { color: palette.textMuted, fontSize: 12, fontWeight: '700' },
    loadingLineWide: { width: '78%', height: 18, borderRadius: 9, backgroundColor: palette.outline },
    loadingLine: { width: '92%', height: 12, borderRadius: 6, backgroundColor: palette.outlineSoft },
    loadingLineShort: { width: '62%', height: 12, borderRadius: 6, backgroundColor: palette.outlineSoft },
    errorText: { color: palette.warning, fontSize: 11, lineHeight: 16 },
    manageLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
    manageLinkText: { color: palette.teal, fontSize: 11, fontWeight: '800' },
  });
