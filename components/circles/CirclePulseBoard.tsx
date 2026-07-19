import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useResponsiveMetrics } from '@/lib/responsive';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import type { CirclePulseItem, CirclePulseItemType, CirclePulseWelcomeProfile } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  items: CirclePulseItem[];
  discussionUnreadByItemId?: Record<string, number>;
  gatheringPosterMembersByUrl?: Record<string, { profileId: string; fullName: string; avatarUrl: string; seatContext?: 'welcome' | 'love' | 'featured_member' }>;
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

const combineWelcomeProfiles = (welcomeItems: CirclePulseItem[]): CirclePulseWelcomeProfile[] => {
  const seenProfileIds = new Set<string>();
  const combinedProfiles: CirclePulseWelcomeProfile[] = [];
  for (const item of welcomeItems) {
    for (const profile of item.welcomeProfiles) {
      if (seenProfileIds.has(profile.profileId)) continue;
      seenProfileIds.add(profile.profileId);
      combinedProfiles.push(profile);
    }
  }
  return combinedProfiles;
};

const getGatheringDateParts = (value?: string | null) => {
  if (!value) return { month: 'SOON', day: '--', time: 'TBA' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { month: 'SOON', day: '--', time: 'TBA' };
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
};

const formatGatheringCountdown = (value?: string | null) => {
  if (!value) return 'Starting soon';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Starting soon';
  const deltaMs = date.getTime() - Date.now();
  if (deltaMs <= 0) return 'Starting soon';
  const minutes = Math.floor(deltaMs / (1000 * 60));
  const hours = Math.floor(deltaMs / (1000 * 60 * 60));
  const days = Math.floor(deltaMs / (1000 * 60 * 60 * 24));
  if (minutes < 60) return `${Math.max(minutes, 1)}m to go`;
  if (hours < 24) return `${hours}h to go`;
  if (days >= 56) return `Coming in ${date.toLocaleDateString(undefined, { month: 'long' })}`;
  if (days >= 14) return `In ${Math.ceil(days / 7)} weeks`;
  return `${days}d to go`;
};

const formatGatheringAttendance = (count: number) => {
  if (count <= 0) return 'Be the first to RSVP';
  return count === 1 ? '1 person is planning to attend' : `${count} people are planning to attend`;
};

const formatGatheringAttendanceBadge = (count: number) => {
  if (count <= 0) return '0 attending';
  return count === 1 ? '1 attending' : `${count} attending`;
};

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) => {
  if (count <= 0) return `0 ${plural}`;
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
};

const getDiscussionCallToAction = (item: CirclePulseItem) => {
  if (item.commentCount > 0) {
    if (item.type === 'welcome') return 'Open welcome';
    if (item.type === 'love_seat') return 'Open conversation';
    if (item.type === 'gathering') {
      if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'welcome') return 'Open welcome';
      if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'love') return 'Open conversation';
    }
    return 'Open discussion';
  }
  if (item.type === 'welcome') return 'Start the welcome';
  if (item.type === 'love_seat') return 'Start conversation';
  if (item.type === 'gathering') {
    if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'welcome') return 'Start welcome';
    if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'love') return 'Start conversation';
    return 'Start discussion';
  }
  if (item.type === 'media') return 'Start discussion';
  return 'Start discussion';
};

const getDiscussionAccessibilityLabel = (
  item: CirclePulseItem,
  welcomeName?: string | null,
  isViewingOwnWelcomeProfile = false,
) => {
  if (item.type === 'gathering') {
    return `Open gathering discussion, ${item.commentCount > 0 ? formatCountLabel(item.commentCount, 'comment') : getDiscussionCallToAction(item).toLowerCase()}`;
  }
  if (item.type === 'welcome') {
    if (isViewingOwnWelcomeProfile) {
      return item.commentCount > 0
        ? `Open welcome discussion for you, ${formatCountLabel(item.commentCount, 'comment')}`
        : 'Open welcome discussion for you';
    }
    const firstName = getFirstName(welcomeName ?? item.welcomeProfiles[0]?.name ?? 'member');
    return item.commentCount > 0
      ? `Open welcome discussion for ${firstName}, ${formatCountLabel(item.commentCount, 'comment')}`
      : `Open welcome discussion for ${firstName}`;
  }
  if (item.type === 'love_seat') {
    return item.commentCount > 0
      ? `Open Love Seat discussion, ${formatCountLabel(item.commentCount, 'comment')}`
      : 'Open Love Seat discussion';
  }
  return 'Open discussion';
};

const getDiscussionSummary = (
  item: CirclePulseItem,
  welcomeName?: string | null,
) => {
  if (item.commentCount <= 0) return null;
  if (item.type === 'welcome') {
    const firstName = getFirstName(welcomeName ?? item.welcomeProfiles[0]?.name ?? 'this member');
    return `${formatCountLabel(item.commentCount, 'welcome note')} for ${firstName}.`;
  }
  if (item.type === 'love_seat') {
    const firstName = getFirstName(item.featuredProfileName ?? 'this member');
    return `${formatCountLabel(item.commentCount, 'thoughtful note')} for ${firstName}.`;
  }
  if (item.type === 'gathering') {
    if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'welcome') {
      const firstName = getFirstName(item.featuredProfileName ?? 'this member');
      return `${formatCountLabel(item.commentCount, 'comment')} already welcoming ${firstName}.`;
    }
    if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'love') {
      const firstName = getFirstName(item.featuredProfileName ?? 'this member');
      return `${formatCountLabel(item.commentCount, 'comment')} around ${firstName}'s gathering.`;
    }
    return `${formatCountLabel(item.commentCount, 'comment')} on this gathering.`;
  }
  if (item.type === 'prompt') return `${formatCountLabel(item.commentCount, 'comment')} shaping this prompt.`;
  if (item.type === 'media') return `${formatCountLabel(item.commentCount, 'comment')} on this moment.`;
  return `${formatCountLabel(item.commentCount, 'comment')} on this note.`;
};

const getWelcomeActionLabel = (profileName: string, isSelf: boolean) =>
  isSelf ? 'Open welcome' : `Welcome ${getFirstName(profileName)}`;

const getWelcomeHeroCopy = (profileName: string, isSelf: boolean) =>
  isSelf
    ? 'See how your Circle is welcoming you in, then answer in your own voice.'
    : `Say hello and help ${getFirstName(profileName)} feel at home in this Circle.`;

const formatGatheringExactDate = (value?: string | null) => {
  if (!value) return 'Date to be confirmed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date to be confirmed';
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

const formatGatheringTypeLabel = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'partner_venue') return 'Partner venue';
  return normalized.replace(/_/g, ' ');
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
const normalizePosterKey = (value?: string | null) => String(value ?? '').trim();
const getGatheringSeatContextLabel = (value?: 'welcome' | 'love' | 'featured_member') => {
  if (value === 'welcome') return 'Welcome Seat';
  if (value === 'love') return 'Love Seat';
  return 'Featured member';
};
const getGatheringSeatContextCopy = (value: 'welcome' | 'love' | 'featured_member' | undefined, fullName: string) => {
  const firstName = getFirstName(fullName);
  if (value === 'welcome') return `A host-created gathering to help members welcome ${firstName} in a warmer setting.`;
  if (value === 'love') return `A Circle gathering created around ${firstName}'s Love Seat for warmer, intentional conversation.`;
  return `A host-led gathering built around ${firstName}'s Circle context before members RSVP.`;
};

function InlineCircleVideo({ uri, style }: { uri: string; style: ReturnType<typeof createStyles>['mediaImage'] }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.keepScreenOnWhilePlaying = false;
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
  discussionUnreadByItemId,
  gatheringPosterMembersByUrl,
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
  const welcomeItems = useMemo(
    () => orderedItems.filter((item) => item.type === 'welcome'),
    [orderedItems],
  );
  const displayItems = useMemo(() => {
    if (welcomeItems.length === 0) return orderedItems;
    const combinedWelcomeProfiles = combineWelcomeProfiles(welcomeItems);
    let welcomeInserted = false;
    return orderedItems.flatMap((item) => {
      if (item.type !== 'welcome') return [item];
      if (welcomeInserted) return [];
      welcomeInserted = true;
      return [{ ...item, welcomeProfiles: combinedWelcomeProfiles }];
    });
  }, [orderedItems, welcomeItems]);
  const selectedDisplayItem = useMemo(() => {
    if (displayItems.length === 0) return null;
    const directMatch = displayItems.find((item) => item.id === selectedItemId);
    if (directMatch) return directMatch;
    if (selectedItemId && welcomeItems.some((item) => item.id === selectedItemId)) {
      return displayItems.find((item) => item.type === 'welcome') ?? displayItems[0];
    }
    return displayItems[0];
  }, [displayItems, selectedItemId, welcomeItems]);
  const activeWelcomeItems = selectedDisplayItem?.type === 'welcome' ? welcomeItems : [];
  const welcomeProfiles = selectedDisplayItem?.type === 'welcome'
    ? (activeWelcomeItems.length > 0 ? combineWelcomeProfiles(activeWelcomeItems) : selectedDisplayItem.welcomeProfiles)
    : [];
  const welcomeProfile = welcomeProfiles[welcomeProfileIndex] ?? welcomeProfiles[0] ?? null;
  const selectedItem = selectedDisplayItem?.type === 'welcome'
    ? activeWelcomeItems[welcomeProfileIndex] ?? activeWelcomeItems[0] ?? selectedDisplayItem
    : selectedDisplayItem;
  const activeType = selectedDisplayItem?.type ?? null;
  const selectedItemIndex = selectedDisplayItem ? displayItems.findIndex((item) => item.id === selectedDisplayItem.id) : -1;
  const isViewingOwnWelcomeProfile = !!welcomeProfile && !!viewerProfileId && welcomeProfile.profileId === viewerProfileId;
  const imageUri = selectedItem?.imageUrl || (selectedItem?.mediaType === 'image' ? selectedItem.mediaUrl : null);
  const resolvedImageUri = imageUri ? normalizeProfilePhotoUri(imageUri) || imageUri : null;
  const selectedGatheringPosterMember = selectedItem?.type === 'gathering' && selectedItem.gatheringPresentationMode === 'seat_linked'
    ? (
        selectedItem.featuredProfileId && selectedItem.featuredProfileAvatarUrl
          ? {
              profileId: selectedItem.featuredProfileId,
              fullName: selectedItem.featuredProfileName ?? 'Circle member',
              avatarUrl: selectedItem.featuredProfileAvatarUrl,
              seatContext: selectedItem.gatheringSeatContext ?? undefined,
            }
          : imageUri
            ? gatheringPosterMembersByUrl?.[normalizePosterKey(imageUri)] ?? null
            : null
      )
    : null;
  const isLoveSeatOwner = !!selectedItem?.featuredProfileId && selectedItem.featuredProfileId === viewerProfileId;
  const selectedGatheringDate = selectedItem?.type === 'gathering' ? selectedItem.gatheringStartsAt || selectedItem.startsAt : null;
  const selectedGatheringDateParts = useMemo(() => getGatheringDateParts(selectedGatheringDate), [selectedGatheringDate]);
  const selectedGatheringCountdown = useMemo(() => formatGatheringCountdown(selectedGatheringDate), [selectedGatheringDate]);
  const selectedGatheringExactDate = useMemo(() => formatGatheringExactDate(selectedGatheringDate), [selectedGatheringDate]);
  const selectedGatheringAttendance = useMemo(
    () => formatGatheringAttendance(selectedItem?.type === 'gathering' ? selectedItem.gatheringAttendeeCount : 0),
    [selectedItem],
  );
  const selectedGatheringAttendanceBadge = useMemo(
    () => formatGatheringAttendanceBadge(selectedItem?.type === 'gathering' ? selectedItem.gatheringAttendeeCount : 0),
    [selectedItem],
  );
  const selectedDiscussionCallToAction = useMemo(
    () => {
      if (!selectedItem) return '';
      if (selectedItem.type === 'welcome' && isViewingOwnWelcomeProfile) return 'Open welcome';
      return selectedItem.discussionCta ?? getDiscussionCallToAction(selectedItem);
    },
    [isViewingOwnWelcomeProfile, selectedItem],
  );
  const selectedDiscussionAccessibilityLabel = useMemo(
    () => (selectedItem ? getDiscussionAccessibilityLabel(selectedItem, welcomeProfile?.name, isViewingOwnWelcomeProfile) : ''),
    [isViewingOwnWelcomeProfile, selectedItem, welcomeProfile?.name],
  );
  const selectedDiscussionSummary = useMemo(
    () => {
      if (!selectedItem) return null;
      if (selectedItem.type === 'welcome' && isViewingOwnWelcomeProfile && selectedItem.commentCount > 0) {
        return `${formatCountLabel(selectedItem.commentCount, 'welcome note')} for you.`;
      }
      return selectedItem.discussionSummary ?? getDiscussionSummary(selectedItem, welcomeProfile?.name);
    },
    [isViewingOwnWelcomeProfile, selectedItem, welcomeProfile?.name],
  );
  const selectedDiscussionUnreadCount = selectedItem
    ? Math.max(0, discussionUnreadByItemId?.[selectedItem.id] ?? 0)
    : 0;
  const selectItem = useCallback((itemId: string) => {
    if (itemId === selectedDisplayItem?.id || transitioningRef.current) return;
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
  }, [selectedDisplayItem?.id, transitionProgress]);
  const showAdjacentItem = useCallback((direction: -1 | 1) => {
    if (displayItems.length < 2 || selectedItemIndex < 0) return;
    const nextIndex = (selectedItemIndex + direction + displayItems.length) % displayItems.length;
    selectItem(displayItems[nextIndex].id);
  }, [displayItems, selectItem, selectedItemIndex]);
  const openWelcomeDiscussion = () => {
    if (!selectedItem || selectedItem.type !== 'welcome' || !welcomeProfile) return;
    const prioritizedWelcomeProfiles = selectedItem.welcomeProfiles.length > 1
      ? [welcomeProfile, ...selectedItem.welcomeProfiles.filter((profile) => profile.profileId !== welcomeProfile.profileId)]
      : [welcomeProfile];
    onOpenComments?.({
      ...selectedItem,
      welcomeProfiles: prioritizedWelcomeProfiles,
    });
  };
  const showAdjacentWelcomeProfile = (direction: -1 | 1) => {
    if (welcomeProfiles.length < 2) return;
    setWelcomeProfileIndex((current) => (current + direction + welcomeProfiles.length) % welcomeProfiles.length);
  };

  useEffect(() => {
    setWelcomeProfileIndex(0);
  }, [selectedDisplayItem?.id]);

  useEffect(() => {
    if (!isMember || displayItems.length < 2) return;
    const timer = setInterval(() => showAdjacentItem(1), AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [displayItems.length, isMember, selectedDisplayItem?.id, showAdjacentItem]);

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
          const available = displayItems.some((item) => filter.types.includes(item.type));
          return (
            <Pressable
              key={filter.key}
              style={[styles.filterChip, active && styles.filterChipActive, !available && styles.filterChipUnavailable]}
              disabled={!available}
              onPress={() => {
                const item = displayItems.find((candidate) => filter.types.includes(candidate.type));
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
                  <MaterialCommunityIcons name="hand-wave" size={14} color={palette.overlayText} />
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
                  {getWelcomeHeroCopy(welcomeProfile.name, isViewingOwnWelcomeProfile)}
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
                  <MaterialCommunityIcons name="heart" size={14} color={palette.overlayText} />
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
            <View style={[styles.mediaShell, styles.mediaSpotlight, styles.mediaPoster]}>
              {selectedItem.mediaType === 'video' && selectedItem.mediaUrl ? (
                <InlineCircleVideo uri={selectedItem.mediaUrl} style={styles.mediaImage} />
              ) : imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.mediaImage} contentFit="cover" transition={160} />
              ) : selectedItem.mediaType === 'audio' ? (
                <View style={styles.audioPreview}>
                  <View style={styles.audioIcon}>
                    <MaterialCommunityIcons name="headphones" size={22} color={palette.overlayText} />
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
              <Pressable
                accessibilityLabel="Open Circle media"
                style={StyleSheet.absoluteFill}
                onPress={() => onOpenMedia?.(selectedItem)}
              />
              <LinearGradient
                pointerEvents="none"
                colors={
                  palette.dark
                    ? ['rgba(7,30,34,0.08)', 'rgba(7,30,34,0.28)', 'rgba(7,30,34,0.96)']
                    : ['rgba(255,249,243,0.06)', 'rgba(31,42,42,0.18)', 'rgba(31,42,42,0.82)']
                }
                locations={[0, 0.42, 1]}
                style={styles.mediaOverlay}
              />
              <View style={styles.mediaTypeBadge}>
                <MaterialCommunityIcons name={getMediaIcon(selectedItem.mediaType) as any} size={13} color={palette.overlayText} />
                <Text style={styles.mediaTypeText}>{getMediaLabel(selectedItem)}</Text>
              </View>
              <View style={styles.mediaOpenIcon}>
                <MaterialCommunityIcons name={selectedItem.mediaType === 'video' ? 'play' : 'arrow-top-right'} size={17} color={palette.overlayText} />
              </View>
              <View style={styles.mediaPosterContent}>
                <Text style={styles.mediaPosterLabel}>{getLabel(selectedItem.type)}</Text>
                <Text style={styles.mediaPosterTitle} numberOfLines={2}>
                  {selectedItem.title || 'A thoughtful spotlight'}
                </Text>
                {selectedItem.subtitle && selectedItem.subtitle !== selectedItem.body ? (
                  <Text style={styles.mediaPosterSubtitle} numberOfLines={1}>{selectedItem.subtitle}</Text>
                ) : null}
                {selectedItem.body ? (
                  <Text style={styles.mediaPosterBody} numberOfLines={2}>{selectedItem.body}</Text>
                ) : null}
                <View style={styles.mediaActions}>
                  <TouchableOpacity
                    accessibilityLabel="Open Circle media"
                    style={[styles.mediaActionButton, styles.mediaPrimaryAction]}
                    onPress={() => onOpenMedia?.(selectedItem)}
                  >
                    <MaterialCommunityIcons name={getMediaIcon(selectedItem.mediaType) as any} size={15} color={palette.tealInk} />
                    <Text style={styles.mediaPrimaryActionText}>{getMediaActionLabel(selectedItem)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel="Open media discussion"
                    style={[styles.mediaActionButton, styles.mediaPosterSecondaryAction]}
                    onPress={() => onOpenComments?.(selectedItem)}
                  >
                    <MaterialCommunityIcons name="message-outline" size={15} color={palette.purple} />
                    <Text style={styles.mediaPosterSecondaryActionText}>{selectedDiscussionCallToAction}</Text>
                    {selectedDiscussionUnreadCount > 0 ? (
                      <View style={styles.unreadPill}>
                        <Text style={styles.unreadPillText}>{selectedDiscussionUnreadCount} new</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : imageUri && selectedItem.type !== 'gathering' ? (
            <View style={styles.mediaShell}>
              <Image source={{ uri: imageUri }} style={styles.mediaImage} contentFit="cover" transition={160} />
              <LinearGradient
                colors={palette.dark ? ['transparent', 'rgba(7,30,34,0.82)'] : ['transparent', 'rgba(31,42,42,0.72)']}
                style={styles.mediaOverlay}
              />
              {selectedItem.mediaType === 'video' ? (
                <View style={styles.playIcon}>
                  <MaterialCommunityIcons name="play" size={18} color={palette.overlayText} />
                </View>
              ) : null}
            </View>
          ) : null}
          {selectedItem.type === 'gathering' ? (
            <View style={styles.gatheringFeature}>
              {selectedGatheringPosterMember ? (
                <LinearGradient colors={palette.gatheringGradient} style={styles.gatheringAvatarHero}>
                  <View style={styles.gatheringAvatarHeroTop}>
                    <Text style={styles.label}>Host-led invitation</Text>
                    <Text style={styles.gatheringPosterTypePill}>{getGatheringSeatContextLabel(selectedGatheringPosterMember.seatContext)}</Text>
                  </View>
                  <View style={styles.gatheringAvatarHeroBody}>
                    {onOpenFeaturedProfile ? (
                      <Pressable
                        accessibilityLabel={`View ${selectedGatheringPosterMember.fullName}'s profile`}
                        style={styles.gatheringAvatarHeroRing}
                        onPress={() => onOpenFeaturedProfile(selectedGatheringPosterMember.profileId)}
                      >
                        <Image source={{ uri: selectedGatheringPosterMember.avatarUrl }} style={styles.gatheringAvatarHeroImage} contentFit="cover" transition={160} />
                      </Pressable>
                    ) : (
                      <View style={styles.gatheringAvatarHeroRing}>
                        <Image source={{ uri: selectedGatheringPosterMember.avatarUrl }} style={styles.gatheringAvatarHeroImage} contentFit="cover" transition={160} />
                      </View>
                    )}
                    <View style={styles.gatheringAvatarHeroCopy}>
                      {onOpenFeaturedProfile ? (
                        <Pressable accessibilityLabel={`View ${selectedGatheringPosterMember.fullName}'s profile`} onPress={() => onOpenFeaturedProfile(selectedGatheringPosterMember.profileId)}>
                          <Text style={styles.gatheringAvatarHeroName} numberOfLines={1}>{selectedGatheringPosterMember.fullName}</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.gatheringAvatarHeroName} numberOfLines={1}>{selectedGatheringPosterMember.fullName}</Text>
                      )}
                      <Text style={styles.gatheringAvatarHeroMeta} numberOfLines={2}>
                        {selectedItem.title || 'A thoughtful gathering'}
                      </Text>
                      <Text style={styles.gatheringAvatarHeroSupport} numberOfLines={2}>
                        {getGatheringSeatContextCopy(selectedGatheringPosterMember.seatContext, selectedGatheringPosterMember.fullName)}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              ) : resolvedImageUri ? (
                <View style={styles.gatheringPosterHeroShell}>
                  <Image accessibilityLabel={`${selectedItem.title || 'Gathering'} poster`} source={{ uri: resolvedImageUri }} style={styles.gatheringPosterImage} contentFit="cover" transition={160} />
                  <LinearGradient
                    colors={
                      palette.dark
                        ? ['rgba(7,30,34,0.02)', 'rgba(7,30,34,0.18)', 'rgba(7,30,34,0.72)']
                        : ['rgba(255,249,243,0.04)', 'rgba(31,42,42,0.14)', 'rgba(31,42,42,0.48)']
                    }
                    style={styles.gatheringPosterImageOverlay}
                  />
                  <View style={styles.gatheringPosterDateBadge}>
                    <Text style={styles.gatheringPosterMonth}>{selectedGatheringDateParts.month}</Text>
                    <Text style={styles.gatheringPosterDay}>{selectedGatheringDateParts.day}</Text>
                    <View style={styles.gatheringPosterDivider} />
                    <Text style={styles.gatheringPosterTime}>{selectedGatheringDateParts.time}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.gatheringPosterCard}>
                  <Text style={styles.gatheringPosterMonth}>{selectedGatheringDateParts.month}</Text>
                  <Text style={styles.gatheringPosterDay}>{selectedGatheringDateParts.day}</Text>
                  <View style={styles.gatheringPosterDivider} />
                  <Text style={styles.gatheringPosterTime}>{selectedGatheringDateParts.time}</Text>
                </View>
              )}
              <View style={styles.gatheringCopy}>
                <Text style={styles.label}>Upcoming gathering</Text>
                <Text style={styles.title} numberOfLines={2}>{selectedItem.title || 'A thoughtful gathering'}</Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {selectedItem.gatheringCity || 'Circle space'}
                  {formatGatheringTypeLabel(selectedItem.gatheringType) ? ` - ${formatGatheringTypeLabel(selectedItem.gatheringType)}` : ''}
                </Text>
                <View style={styles.gatheringUtilityRow}>
                  <View style={styles.gatheringDatePill}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={12} color={palette.tealInk} />
                    <Text style={styles.gatheringCountdownText}>{selectedGatheringExactDate}</Text>
                  </View>
                  <View style={styles.gatheringCountdownPill}>
                    <MaterialCommunityIcons name="timer-sand" size={12} color={palette.tealInk} />
                    <Text style={styles.gatheringCountdownText}>{selectedGatheringCountdown}</Text>
                  </View>
                  <Text style={styles.badge}>{selectedGatheringAttendanceBadge}</Text>
                </View>
                {selectedItem.body ? <Text style={styles.body} numberOfLines={3}>{selectedItem.body}</Text> : null}
                <Text style={styles.gatheringAttendanceText}>{selectedGatheringAttendance}</Text>
                <View style={styles.badgeRow}>
                  {selectedItem.gatheringIsPartnerVenue ? <Text style={styles.badge}>Partner venue</Text> : null}
                  {selectedItem.gatheringSafeFirstDateSpace ? <Text style={styles.badge}>Safe first-date space</Text> : null}
                </View>
              </View>
            </View>
          ) : selectedItem.type !== 'love_seat' && selectedItem.type !== 'welcome' && selectedItem.type !== 'media' ? (
            <View style={styles.copyBlock}>
              <Text style={styles.label}>{getLabel(selectedItem.type)}</Text>
              <Text style={styles.title} numberOfLines={2}>{selectedItem.title || 'A thoughtful spotlight'}</Text>
              {selectedItem.body ? <Text style={styles.body} numberOfLines={imageUri ? 3 : 5}>{selectedItem.body}</Text> : null}
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
                  <Text style={styles.secondaryLoveSeatText}>{getWelcomeActionLabel(welcomeProfile.name, isViewingOwnWelcomeProfile)}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.loveSeatFooter}>
                <View style={styles.footerMetaStack}>
                  <Pressable accessibilityLabel={selectedDiscussionAccessibilityLabel} style={styles.footerMeta} onPress={openWelcomeDiscussion}>
                    <MaterialCommunityIcons name="message-outline" size={15} color={palette.textMuted} />
                    <Text style={styles.footerText}>{selectedDiscussionCallToAction}</Text>
                    {selectedDiscussionUnreadCount > 0 ? (
                      <View style={styles.unreadPill}>
                        <Text style={styles.unreadPillText}>{selectedDiscussionUnreadCount} new</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {selectedDiscussionSummary ? <Text style={styles.footerSummary}>{selectedDiscussionSummary}</Text> : null}
                </View>
              </View>
            </>
          ) : selectedItem.type === 'media' ? (
            selectedDiscussionSummary ? <Text style={styles.footerSummary}>{selectedDiscussionSummary}</Text> : null
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
                <View style={styles.footerMetaStack}>
                  <Pressable accessibilityLabel={selectedDiscussionAccessibilityLabel} style={styles.footerMeta} onPress={() => onOpenComments?.(selectedItem)}>
                    <MaterialCommunityIcons name="message-outline" size={15} color={palette.textMuted} />
                    <Text style={styles.footerText}>{selectedDiscussionCallToAction}</Text>
                    {selectedDiscussionUnreadCount > 0 ? (
                      <View style={styles.unreadPill}>
                        <Text style={styles.unreadPillText}>{selectedDiscussionUnreadCount} new</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {selectedDiscussionSummary ? <Text style={styles.footerSummary}>{selectedDiscussionSummary}</Text> : null}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.footer}>
              <View style={styles.footerMetaStack}>
                <Pressable
                  accessibilityLabel={selectedDiscussionAccessibilityLabel}
                  style={styles.footerMeta}
                  onPress={() => onOpenComments?.(selectedItem)}
                >
                  <MaterialCommunityIcons name="message-outline" size={15} color={palette.textMuted} />
                  <Text style={styles.footerText}>{selectedDiscussionCallToAction}</Text>
                  {selectedDiscussionUnreadCount > 0 ? (
                    <View style={styles.unreadPill}>
                      <Text style={styles.unreadPillText}>{selectedDiscussionUnreadCount} new</Text>
                    </View>
                  ) : null}
                </Pressable>
                {selectedDiscussionSummary ? <Text style={styles.footerSummary}>{selectedDiscussionSummary}</Text> : null}
              </View>
              {renderAction()}
            </View>
          )}
          {(isLoveSeatOwner || canManage) && selectedItem.type === 'love_seat' ? (
            <Pressable style={styles.leaveLoveSeat} onPress={() => onEndLoveSeat?.(selectedItem)}>
              <Text style={styles.leaveLoveSeatText}>{isLoveSeatOwner ? 'Leave Love Seat' : 'End feature'}</Text>
            </Pressable>
          ) : null}
          {displayItems.length > 1 ? (
            <View style={styles.mediaPager}>
              <Pressable accessibilityLabel="Previous Circle spotlight" style={styles.mediaPagerButton} onPress={() => showAdjacentItem(-1)}>
                <MaterialCommunityIcons name="chevron-left" size={17} color={palette.textMuted} />
              </Pressable>
              <View accessibilityLabel="Circle spotlight position" style={styles.carouselDashes}>
                {displayItems.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityLabel={`Show ${getLabel(item.type)} spotlight ${index + 1}`}
                    accessibilityState={{ selected: item.id === selectedDisplayItem.id }}
                    style={[styles.carouselDash, item.id === selectedDisplayItem.id && styles.carouselDashActive]}
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
    mediaPoster: { position: 'relative', height: compactHeight ? 220 : 252, borderRadius: 20 },
    mediaImage: { width: '100%', height: '100%' },
    mediaOverlay: { ...StyleSheet.absoluteFill },
    mediaFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.purpleSoft },
    audioPreview: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, backgroundColor: palette.tealSoft },
    audioIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.dark ? 'rgba(139,92,255,0.44)' : palette.purpleSoft,
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(217,204,255,0.54)' : palette.purpleBorder,
    },
    audioWaveform: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
    audioBar: { width: 3, borderRadius: 2, backgroundColor: palette.teal },
    mediaTypeBadge: {
      position: 'absolute',
      left: 10,
      top: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: palette.dark ? 'rgba(7,30,34,0.76)' : 'rgba(31,42,42,0.52)',
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(244,232,208,0.16)' : 'rgba(255,255,255,0.22)',
    },
    mediaTypeText: { color: palette.overlayText, fontSize: 10, fontWeight: '900' },
    mediaOpenIcon: {
      position: 'absolute',
      right: 12,
      top: 12,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.dark ? 'rgba(139,92,255,0.76)' : 'rgba(31,42,42,0.52)',
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(217,204,255,0.68)' : 'rgba(255,255,255,0.22)',
    },
    mediaPosterContent: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 4 },
    mediaPosterLabel: { color: palette.dark ? '#C9B5FF' : '#F1D7FF', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
    mediaPosterTitle: { color: palette.overlayText, fontSize: compactWidth ? 21 : 24, lineHeight: compactWidth ? 25 : 29, fontFamily: 'PlayfairDisplay_700Bold' },
    mediaPosterSubtitle: { color: palette.dark ? '#78E1DF' : '#C7FFF8', fontSize: 11, lineHeight: 15, fontWeight: '900' },
    mediaPosterBody: { color: palette.dark ? 'rgba(246,239,227,0.78)' : 'rgba(255,249,243,0.9)', fontSize: 11, lineHeight: 15 },
    playIcon: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.dark ? 'rgba(7,30,34,0.72)' : 'rgba(31,42,42,0.54)',
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(244,232,208,0.18)' : 'rgba(255,255,255,0.24)',
    },
    gatheringFeature: { gap: 12 },
    gatheringPosterCard: {
      width: compactWidth ? 78 : 86,
      minHeight: compactWidth ? 108 : 116,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gatheringPosterHeroShell: {
      width: '100%',
      height: compactHeight ? 128 : 142,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: palette.surfaceMuted,
      borderWidth: 1,
      borderColor: palette.outline,
    },
    gatheringAvatarHero: {
      padding: compactWidth ? 14 : 16,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.tealBorder,
      gap: 12,
    },
    gatheringAvatarHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    gatheringPosterTypePill: {
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      color: palette.text,
      backgroundColor: palette.dark ? 'rgba(7,30,34,0.34)' : 'rgba(31,42,42,0.18)',
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(244,232,208,0.12)' : 'rgba(255,255,255,0.22)',
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    gatheringAvatarHeroBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    gatheringAvatarHeroRing: {
      width: compactWidth ? 76 : 88,
      height: compactWidth ? 76 : 88,
      padding: 3,
      borderRadius: compactWidth ? 38 : 44,
      backgroundColor: palette.tealSoft,
      borderWidth: 1,
      borderColor: palette.purpleStrong,
    },
    gatheringAvatarHeroImage: { width: '100%', height: '100%', borderRadius: compactWidth ? 35 : 41 },
    gatheringAvatarHeroCopy: { flex: 1, gap: 4, minWidth: 0 },
    gatheringAvatarHeroName: { color: palette.text, fontSize: compactWidth ? 17 : 19, lineHeight: compactWidth ? 22 : 24, fontFamily: 'PlayfairDisplay_700Bold' },
    gatheringAvatarHeroMeta: { color: palette.teal, fontSize: 12, lineHeight: 18, fontWeight: '800' },
    gatheringAvatarHeroSupport: { color: palette.textSoft, fontSize: 11, lineHeight: 16 },
    gatheringPosterImage: { width: '100%', height: '100%' },
    gatheringPosterImageOverlay: { ...StyleSheet.absoluteFill },
    gatheringPosterDateBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: compactWidth ? 78 : 86,
      paddingHorizontal: 8,
      paddingVertical: 9,
      borderRadius: 18,
      backgroundColor: palette.dark ? 'rgba(7,30,34,0.62)' : 'rgba(31,42,42,0.44)',
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(244,232,208,0.16)' : 'rgba(255,255,255,0.24)',
      alignItems: 'center',
    },
    gatheringPosterMonth: { color: palette.teal, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
    gatheringPosterDay: { marginTop: 4, color: palette.text, fontSize: compactWidth ? 28 : 32, lineHeight: compactWidth ? 32 : 36, fontFamily: 'PlayfairDisplay_700Bold' },
    gatheringPosterDivider: { width: '100%', height: 1, marginVertical: 8, backgroundColor: palette.outline },
    gatheringPosterTime: { color: palette.textMuted, fontSize: 11, fontWeight: '800' },
    gatheringCopy: { flex: 1, gap: 7, minWidth: 0 },
    gatheringUtilityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
    gatheringDatePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: palette.dark ? 'rgba(244,232,208,0.1)' : 'rgba(31,42,42,0.08)',
      borderWidth: 1,
      borderColor: palette.dark ? 'rgba(244,232,208,0.14)' : palette.outlineSoft,
    },
    gatheringCountdownPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: palette.tealStrong,
    },
    gatheringCountdownText: { color: palette.tealInk, fontSize: 10, fontWeight: '900' },
    gatheringAttendanceText: { color: palette.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
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
    footerMetaStack: { flex: 1, gap: 3 },
    footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    footerText: { color: palette.textMuted, fontSize: 11, fontWeight: '700' },
    footerSummary: { color: palette.textFaint, fontSize: 10, lineHeight: 14 },
    unreadPill: {
      marginLeft: 'auto',
      minHeight: 20,
      paddingHorizontal: 8,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.tealBorder,
      backgroundColor: palette.tealSoft,
    },
    unreadPillText: { color: palette.teal, fontSize: 9, fontWeight: '900' },
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
    mediaPosterSecondaryAction: {
      borderColor: palette.dark ? 'rgba(217,204,255,0.46)' : palette.purpleBorder,
      backgroundColor: palette.dark ? 'rgba(7,30,34,0.64)' : 'rgba(31,42,42,0.52)',
    },
    mediaPosterSecondaryActionText: { color: palette.dark ? '#E8DFFF' : '#F1D7FF', fontSize: 11, fontWeight: '900' },
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
