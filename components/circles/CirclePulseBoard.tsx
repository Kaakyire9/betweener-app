import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import CircleLoveSeatPortrait from '@/components/circles/CircleLoveSeatPortrait';
import CircleLoveSeatRequestCard from '@/components/circles/CircleLoveSeatRequestCard';
import CircleMediaHubSection from '@/components/circles/CircleMediaHubSection';
import CircleMediaConsentRequests from '@/components/circles/CircleMediaConsentRequests';
import CirclePulseReveal from '@/components/circles/CirclePulseReveal';
import CirclePulseWelcomeConstellation, {
  type CirclePulseWelcomeEntry,
} from '@/components/circles/CirclePulseWelcomeConstellation';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import type { CircleLoveSeatRequest, CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import {
  getCirclePulseHeroEyebrow,
  resolveCirclePulsePresentation,
} from '@/lib/circles/pulse/circle-pulse-presentation';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { useCirclePulseWelcomeState } from '@/lib/circles/pulse/use-circle-pulse-welcome-state';
import { useResponsiveMetrics } from '@/lib/responsive';

type LiveGathering = {
  sessionId: string;
  attendanceCount: number;
  minimumAttendance: number;
  quorumStatus: 'almost_ready' | 'confirmed';
  viewerRsvpStatus: string;
};

type GatheringPosterMember = {
  profileId: string;
  fullName: string;
  avatarUrl: string;
  seatContext?: 'welcome' | 'love' | 'featured_member';
};

type Props = {
  items: CirclePulseItem[];
  discussionUnreadByItemId?: Record<string, number>;
  gatheringPosterMembersByUrl?: Record<string, GatheringPosterMember>;
  liveGatheringsById?: Record<string, LiveGathering>;
  welcomeProfileLocationsById?: Readonly<Record<string, string | null | undefined>>;
  loading?: boolean;
  error?: string | null;
  isMember: boolean;
  canManage: boolean;
  joinLabel?: string;
  onJoin?: () => void;
  onAddToPulse?: () => void;
  onSubmitMedia?: () => void;
  onAnswerPrompt?: (promptId: string) => void;
  onOpenGathering?: (gatheringId: string) => void;
  onOpenMedia?: (item: CirclePulseItem) => void;
  onOpenComments?: (item: CirclePulseItem) => void;
  onOpenFeaturedProfile?: (profileId: string) => void;
  onSendSignal?: (profileId: string, name?: string | null) => void;
  onEndLoveSeat?: (item: CirclePulseItem) => void;
  onReportItem?: (item: CirclePulseItem) => void;
  loveSeatRequest?: CircleLoveSeatRequest | null;
  loveSeatRequestLoading?: boolean;
  onRequestLoveSeat?: (note?: string | null) => Promise<void>;
  onCancelLoveSeatRequest?: () => void;
  viewerProfileId?: string | null;
};

const getFirstName = (name?: string | null) => String(name ?? '').trim().split(/\s+/)[0] || 'member';

const withSelectionHaptic = <T extends unknown[]>(callback?: (...args: T) => unknown) => (...args: T) => {
  if (process.env.NODE_ENV !== 'test') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
  return callback?.(...args);
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getGatheringStateLabel = (value?: string | null, isLive = false) => {
  if (isLive) return 'LIVE';
  if (!value) return null;
  const startsAt = new Date(value);
  if (Number.isNaN(startsAt.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const gatheringDay = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate()).getTime();
  const dayDifference = Math.round((gatheringDay - today) / 86_400_000);
  if (dayDifference < 0) return 'ENDED';
  if (dayDifference === 0) return 'TODAY';
  if (dayDifference === 1) return 'TOMORROW';
  return null;
};

const getCardAccent = (item: CirclePulseItem, palette: CirclePulsePalette) => {
  if (item.type === 'host_note' || item.type === 'love_seat') return palette.purple;
  return palette.teal;
};

const getItemLabel = (item: CirclePulseItem) => {
  if (item.type === 'prompt') return 'Circle Prompt';
  if (item.type === 'gathering') return item.gatheringType === 'live' ? 'Gathering with Live' : 'Gathering';
  if (item.type === 'love_seat') return 'Love Seat';
  if (item.type === 'host_note') return 'From the host';
  if (item.mediaType === 'video') return item.momentId ? 'Video Moment' : 'Circle Video';
  if (item.mediaType === 'audio') return item.momentId ? 'Audio Moment' : 'Circle Audio';
  return item.momentId ? 'Photo Moment' : 'Circle Image';
};

const getItemIcon = (item: CirclePulseItem) => {
  if (item.type === 'prompt') return 'comment-question-outline';
  if (item.type === 'gathering') return item.gatheringType === 'live' ? 'broadcast' : 'calendar-heart';
  if (item.type === 'love_seat') return 'heart-outline';
  if (item.type === 'host_note') return 'message-text-outline';
  if (item.mediaType === 'video') return 'play';
  if (item.mediaType === 'audio') return 'headphones';
  return 'image-outline';
};

const getDiscussionLabel = (item: CirclePulseItem) => {
  if (item.discussionCta) return item.discussionCta;
  if (item.commentCount > 0) {
    if (item.type === 'love_seat') return 'Open conversation';
    return 'Open discussion';
  }
  if (item.type === 'love_seat') return `Ask ${getFirstName(item.featuredProfileName)}`;
  return 'Start discussion';
};

const getMediaAction = (item: CirclePulseItem) => {
  if (item.mediaType === 'video') return item.momentId ? 'Watch moment' : 'Watch video';
  if (item.mediaType === 'audio') return 'Listen now';
  return item.momentId ? 'View photo' : 'View image';
};

const buildWelcomeEntries = (
  items: CirclePulseItem[],
  welcomeProfileLocationsById?: Readonly<Record<string, string | null | undefined>>,
) => {
  const seen = new Set<string>();
  const entries: CirclePulseWelcomeEntry[] = [];
  for (const item of items) {
    if (item.type !== 'welcome') continue;
    for (const profile of item.welcomeProfiles) {
      if (seen.has(profile.profileId)) continue;
      seen.add(profile.profileId);
      const enrichedLocation = welcomeProfileLocationsById?.[profile.profileId]?.trim();
      entries.push({
        item,
        profile: enrichedLocation ? { ...profile, location: enrichedLocation } : profile,
      });
    }
  }
  return entries.sort((left, right) => (
    new Date(right.profile.joinedAt).getTime() - new Date(left.profile.joinedAt).getTime()
  ));
};

function PulseItemCard({
  item,
  hero,
  compactHostNote,
  unreadCount,
  liveGathering,
  gatheringPosterMember,
  palette,
  compactWidth,
  onAnswerPrompt,
  onOpenGathering,
  onOpenMedia,
  onOpenComments,
  onOpenFeaturedProfile,
  onSendSignal,
  onEndLoveSeat,
  onReportItem,
  viewerProfileId,
  canManage,
}: {
  item: CirclePulseItem;
  hero?: boolean;
  compactHostNote?: boolean;
  unreadCount: number;
  liveGathering?: LiveGathering | null;
  gatheringPosterMember?: GatheringPosterMember | null;
  palette: CirclePulsePalette;
  compactWidth: boolean;
  onAnswerPrompt?: Props['onAnswerPrompt'];
  onOpenGathering?: Props['onOpenGathering'];
  onOpenMedia?: Props['onOpenMedia'];
  onOpenComments?: Props['onOpenComments'];
  onOpenFeaturedProfile?: Props['onOpenFeaturedProfile'];
  onSendSignal?: Props['onSendSignal'];
  onEndLoveSeat?: Props['onEndLoveSeat'];
  onReportItem?: Props['onReportItem'];
  viewerProfileId?: string | null;
  canManage: boolean;
}) {
  const selectedLiveGathering = liveGathering;
  const featuredGatheringMember = item.type === 'gathering' && item.gatheringPresentationMode === 'seat_linked'
    ? item.featuredProfileId
      ? {
          profileId: item.featuredProfileId,
          fullName: item.featuredProfileName || 'Circle member',
          avatarUrl: item.featuredProfileAvatarUrl || '',
          seatContext: item.gatheringSeatContext || 'featured_member' as const,
        }
      : gatheringPosterMember
    : null;
  const imageSource = normalizeProfilePhotoUri(item.imageUrl || item.featuredProfileAvatarUrl || '') || item.imageUrl || item.featuredProfileAvatarUrl;
  const dateLabel = item.type === 'gathering' ? formatDate(item.gatheringStartsAt || item.startsAt) : null;
  const gatheringStateLabel = item.type === 'gathering'
    ? getGatheringStateLabel(item.gatheringStartsAt || item.startsAt, Boolean(selectedLiveGathering))
    : null;
  const isLoveSeatOwner = item.type === 'love_seat' && item.featuredProfileId === viewerProfileId;
  const sourceUnavailable = !item.sourceAvailable;
  const hasPoster = Boolean(imageSource && !featuredGatheringMember && (item.type === 'media' || item.type === 'gathering'));
  const title = item.type === 'love_seat'
    ? `${item.featuredProfileName || 'Circle member'}${item.featuredProfileAge ? `, ${item.featuredProfileAge}` : ''}`
    : item.title || (item.type === 'host_note' ? 'A note from your host' : 'A thoughtful Circle spotlight');
  const body = item.type === 'love_seat' ? item.loveSeatQuote || item.body : item.body;
  const itemLabel = selectedLiveGathering ? 'Upcoming Gathering with Live' : getItemLabel(item);
  const attendanceCopy = selectedLiveGathering
    ? selectedLiveGathering.quorumStatus === 'confirmed'
      ? `Confirmed · ${selectedLiveGathering.attendanceCount} places saved`
      : `${selectedLiveGathering.attendanceCount} of ${selectedLiveGathering.minimumAttendance} places saved`
    : item.type === 'gathering'
      ? item.gatheringAttendeeCount === 1
        ? '1 person attending'
        : `${item.gatheringAttendeeCount} people attending`
      : null;

  const primaryAction = () => {
    if (sourceUnavailable) return null;
    if (item.type === 'prompt' && item.promptId) {
      return { label: 'Answer', icon: 'arrow-right', onPress: () => onAnswerPrompt?.(item.promptId!) };
    }
    if (item.type === 'gathering' && item.gatheringId) {
      return {
        label: selectedLiveGathering
          ? selectedLiveGathering.viewerRsvpStatus === 'going' ? 'Open Live' : 'Save a place'
          : 'View gathering',
        icon: selectedLiveGathering ? 'broadcast' : 'calendar-arrow-right',
        onPress: () => onOpenGathering?.(item.gatheringId!),
      };
    }
    if (item.type === 'media') {
      return { label: getMediaAction(item), icon: getItemIcon(item), onPress: () => onOpenMedia?.(item) };
    }
    if (item.type === 'love_seat' && item.featuredProfileId) {
      return { label: 'View profile', icon: 'account-outline', onPress: () => onOpenFeaturedProfile?.(item.featuredProfileId!) };
    }
    return null;
  };
  const action = primaryAction();
  const cardGradient = item.type === 'prompt'
    ? palette.promptGradient
    : item.type === 'host_note'
      ? palette.gistGradient
      : item.type === 'gathering'
        ? palette.gatheringGradient
        : item.type === 'love_seat'
          ? palette.warmIntroGradient
          : palette.gradient;
  const loveSeatName = getFirstName(item.featuredProfileName);
  const openMoreActions = () => {
    if (!onReportItem) return;
    Alert.alert('Spotlight options', 'Choose an action for this Circle spotlight.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => onReportItem(item) },
    ]);
  };

  return (
    <LinearGradient colors={cardGradient} style={[
      styles.itemCard,
      item.type === 'prompt' && styles.promptCard,
      item.type === 'host_note' && styles.hostNoteCard,
      item.type === 'love_seat' && styles.loveSeatCard,
      item.type === 'media' && styles.mediaCard,
      hero && styles.heroCard,
      { borderColor: hero ? palette.purpleBorder : palette.outline },
    ]}>
      <View pointerEvents="none" style={[styles.cardAccent, { backgroundColor: getCardAccent(item, palette) }]} />
      {item.type === 'love_seat' ? (
        <CircleLoveSeatPortrait
          avatarUrl={item.featuredProfileAvatarUrl}
          name={item.featuredProfileName || 'Circle member'}
          palette={palette}
          onOpenProfile={item.featuredProfileId
            ? withSelectionHaptic(() => onOpenFeaturedProfile?.(item.featuredProfileId!))
            : undefined}
        />
      ) : null}
      {item.type === 'love_seat' && item.expiresAt ? (
        <LoveSeatRemainingTime expiresAt={item.expiresAt} palette={palette} />
      ) : null}
      {hasPoster ? (
        <Pressable
          accessibilityLabel={item.type === 'media' ? 'Open Circle media' : `Open ${title}`}
          style={[styles.poster, hero && styles.heroPoster]}
          disabled={sourceUnavailable}
          onPress={item.type === 'media' ? () => onOpenMedia?.(item) : () => item.gatheringId && onOpenGathering?.(item.gatheringId)}
        >
          <Image
            source={{ uri: imageSource! }}
            style={[StyleSheet.absoluteFill, item.type === 'media' && !item.momentId && styles.editorialMediaImage]}
            contentFit={item.type === 'media' && !item.momentId ? 'contain' : 'cover'}
            transition={160}
          />
          <LinearGradient colors={['rgba(5,21,24,0.02)', 'rgba(5,21,24,0.78)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.posterBadge, { borderColor: 'rgba(255,255,255,0.22)' }]}>
            <MaterialCommunityIcons name={getItemIcon(item) as any} size={14} color="#FFF9F1" />
            <Text style={styles.posterBadgeText}>{itemLabel}</Text>
          </View>
          <View style={styles.posterCopy}>
            <Text style={[styles.posterTitle, hero && styles.heroPosterTitle]} numberOfLines={2}>{title}</Text>
            {dateLabel ? <Text style={styles.posterMeta}>{dateLabel}</Text> : null}
          </View>
        </Pressable>
      ) : (
        <View style={styles.itemLead}>
          {featuredGatheringMember ? (
            <Pressable
              accessibilityLabel={`View ${featuredGatheringMember?.fullName || item.featuredProfileName || 'featured member'} profile`}
              style={[styles.featuredAvatarRing, { borderColor: palette.purpleStrong, backgroundColor: palette.purpleSoft }]}
              onPress={withSelectionHaptic(() => {
                const profileId = featuredGatheringMember?.profileId || item.featuredProfileId;
                if (profileId) onOpenFeaturedProfile?.(profileId);
              })}
            >
              {featuredGatheringMember?.avatarUrl || item.featuredProfileAvatarUrl ? (
                <Image source={{ uri: featuredGatheringMember?.avatarUrl || item.featuredProfileAvatarUrl! }} style={styles.featuredAvatar} contentFit="cover" transition={140} />
              ) : (
                <MaterialCommunityIcons name="account-heart-outline" size={31} color={palette.purple} />
              )}
            </Pressable>
          ) : item.type !== 'love_seat' ? (
            <View style={[
              styles.itemIcon,
              {
                borderColor: item.type === 'host_note' ? palette.purpleBorder : palette.tealBorder,
                backgroundColor: item.type === 'host_note' ? palette.purpleSoft : palette.tealSoft,
              },
            ]}>
              <MaterialCommunityIcons
                name={getItemIcon(item) as any}
                size={21}
                color={item.type === 'host_note' ? palette.purple : palette.teal}
              />
            </View>
          ) : null}
          <View style={styles.itemLeadCopy}>
            <Text style={[styles.itemLabel, { color: item.type === 'love_seat' || item.type === 'host_note' ? palette.purple : palette.teal }]}>{itemLabel}</Text>
            {!compactHostNote ? <Text style={[styles.itemTitle, hero && styles.heroTitle, { color: palette.text }]} numberOfLines={hero ? 3 : 2}>{title}</Text> : null}
            {item.type === 'love_seat' && item.featuredProfileLocation ? (
              <Text style={[styles.itemMeta, { color: palette.textMuted }]}>{item.featuredProfileLocation}</Text>
            ) : featuredGatheringMember ? (
              <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Hosted around {featuredGatheringMember.fullName}</Text>
            ) : null}
          </View>
          {(isLoveSeatOwner || canManage) && item.type === 'love_seat' ? (
            <Pressable
              accessibilityLabel={isLoveSeatOwner ? 'Leave Love Seat options' : 'Manage Love Seat'}
              style={[styles.cardManageButton, { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft }]}
              onPress={withSelectionHaptic(() => onEndLoveSeat?.(item))}
            >
              <MaterialCommunityIcons name="dots-horizontal" size={19} color={palette.purple} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.itemCopy}>
        {gatheringStateLabel ? (
          <View style={[styles.statusPill, { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft }]}>
            <Text style={[styles.statusPillText, { color: palette.teal }]}>{gatheringStateLabel}</Text>
          </View>
        ) : null}
        {dateLabel && !hasPoster ? <Text style={[styles.itemMetaStrong, { color: palette.teal }]}>{dateLabel}</Text> : null}
        {item.type === 'gathering' && item.gatheringCity ? <Text style={[styles.itemMeta, { color: palette.textMuted }]}>{item.gatheringCity}</Text> : null}
        {body && item.type === 'prompt' ? (
          <View style={[styles.editorialQuote, { borderColor: palette.tealBorder }]}>
            <Text style={[styles.quoteMark, { color: palette.teal }]}>“</Text>
            <Text style={[styles.promptQuestion, { color: palette.text }]} numberOfLines={hero ? 5 : 4}>{body}</Text>
          </View>
        ) : body && item.type === 'host_note' ? (
          <View style={styles.hostNoteCopy}>
            <MaterialCommunityIcons name="format-quote-open" size={20} color={palette.purple} />
            <Text style={[styles.hostNoteBody, { color: palette.textSoft }]} numberOfLines={hero ? 5 : 4}>{body}</Text>
          </View>
        ) : body ? (
          <Text style={[styles.itemBody, { color: palette.textSoft }]} numberOfLines={hero ? 4 : 3}>{body}</Text>
        ) : null}
        {attendanceCopy ? <Text style={[styles.itemMetaStrong, { color: palette.teal }]}>{attendanceCopy}</Text> : null}
        {sourceUnavailable ? (
          <View style={[styles.unavailableNotice, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}>
            <MaterialCommunityIcons name="link-off" size={15} color={palette.warning} />
            <Text style={[styles.unavailableText, { color: palette.textMuted }]}>This spotlight is no longer available.</Text>
          </View>
        ) : null}
      </View>

      {item.type === 'love_seat' && item.featuredProfileId ? (
        <>
          <TouchableOpacity
            accessibilityLabel={`Open ${itemLabel} discussion`}
            style={[styles.loveSeatConversationPrimary, { backgroundColor: palette.tealStrong }]}
            onPress={withSelectionHaptic(() => onOpenComments?.(item))}
          >
            <MaterialCommunityIcons name="message-outline" size={16} color={palette.tealInk} />
            <Text style={[styles.loveSeatConversationPrimaryText, { color: palette.tealInk }]}>{getDiscussionLabel(item)}</Text>
            {unreadCount > 0 ? (
              <View style={[styles.unreadPill, { backgroundColor: palette.purpleStrong }]}><Text style={styles.unreadPillText}>{unreadCount}</Text></View>
            ) : item.commentCount > 0 ? (
              <Text style={[styles.commentCount, { color: palette.tealInk }]}>{item.commentCount}</Text>
            ) : null}
          </TouchableOpacity>
          <View style={[styles.loveSeatPrimaryRow, compactWidth && styles.itemActionsCompact]}>
            <TouchableOpacity
              accessibilityLabel={isLoveSeatOwner ? 'View my Love Seat profile' : `Meet ${loveSeatName}`}
              style={[styles.loveSeatMeetAction, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}
              onPress={withSelectionHaptic(action?.onPress)}
            >
              <MaterialCommunityIcons name="account-heart-outline" size={17} color={palette.purple} />
              <Text style={[styles.loveSeatMeetText, { color: palette.textSoft }]}>
                {isLoveSeatOwner ? 'View my profile' : `Meet ${loveSeatName}`}
              </Text>
            </TouchableOpacity>
            {!isLoveSeatOwner ? (
              <TouchableOpacity
                accessibilityLabel={`Send Signal to ${loveSeatName}`}
                style={[styles.loveSeatSignalAction, { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft }]}
                onPress={withSelectionHaptic(() => onSendSignal?.(item.featuredProfileId!, item.featuredProfileName))}
              >
                <MaterialCommunityIcons name="heart" size={16} color={palette.purple} />
                <Text style={[styles.loveSeatSignalText, { color: palette.purple }]}>Send Signal</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : (
      <View style={[styles.itemActions, compactWidth && styles.itemActionsCompact]}>
        {action ? (
          <TouchableOpacity accessibilityLabel={action.label} style={[styles.primaryAction, { backgroundColor: palette.tealStrong }]} onPress={withSelectionHaptic(action.onPress)}>
            <MaterialCommunityIcons name={action.icon as any} size={15} color={palette.tealInk} />
            <Text style={[styles.primaryActionText, { color: palette.tealInk }]}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityLabel={item.type === 'media' ? 'Open media discussion' : `Open ${itemLabel} discussion`}
          style={[styles.discussionAction, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}
          onPress={withSelectionHaptic(() => onOpenComments?.(item))}
        >
          <MaterialCommunityIcons name="message-outline" size={15} color={palette.purple} />
          <Text style={[styles.discussionActionText, { color: palette.textSoft }]}>{getDiscussionLabel(item)}</Text>
          {unreadCount > 0 ? (
            <View style={[styles.unreadPill, { backgroundColor: palette.purpleStrong }]}><Text style={styles.unreadPillText}>{unreadCount}</Text></View>
          ) : item.commentCount > 0 ? (
            <Text style={[styles.commentCount, { color: palette.textMuted }]}>{item.commentCount}</Text>
          ) : null}
        </TouchableOpacity>
        {onReportItem ? <TouchableOpacity
          accessibilityLabel={`More options for ${itemLabel}`}
          style={[styles.reportAction, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}
          onPress={withSelectionHaptic(openMoreActions)}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={17} color={palette.textMuted} />
        </TouchableOpacity> : null}
      </View>
      )}
    </LinearGradient>
  );
}

function LoveSeatRemainingTime({ expiresAt, palette }: { expiresAt: string; palette: CirclePulsePalette }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.ceil(remainingMs / 60_000);
  const label = remainingMs <= 0 ? 'Ending now' : minutes < 60 ? `${minutes}m remaining` : `${Math.ceil(minutes / 60)}h remaining`;
  return (
    <View style={[styles.loveSeatTimePill, { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft }]}>
      <MaterialCommunityIcons name="clock-outline" size={13} color={palette.purple} />
      <Text style={[styles.loveSeatTimeText, { color: palette.purple }]}>{label}</Text>
    </View>
  );
}

export default function CirclePulseBoard({
  items,
  discussionUnreadByItemId,
  gatheringPosterMembersByUrl,
  liveGatheringsById,
  welcomeProfileLocationsById,
  loading = false,
  error = null,
  isMember,
  canManage,
  joinLabel = 'Join Circle',
  onJoin,
  onAddToPulse,
  onSubmitMedia,
  onAnswerPrompt,
  onOpenGathering,
  onOpenMedia,
  onOpenComments,
  onOpenFeaturedProfile,
  onSendSignal,
  onEndLoveSeat,
  onReportItem,
  loveSeatRequest = null,
  loveSeatRequestLoading = false,
  onRequestLoveSeat,
  onCancelLoveSeatRequest,
  viewerProfileId,
}: Props) {
  const palette = useCirclePulsePalette();
  const responsive = useResponsiveMetrics();
  const liveGatheringIds = useMemo(
    () => new Set(Object.keys(liveGatheringsById ?? {})),
    [liveGatheringsById],
  );
  const presentation = useMemo(
    () => resolveCirclePulsePresentation(items, liveGatheringIds),
    [items, liveGatheringIds],
  );
  const { orderedItems, welcomeItems, hostNoteItems, heroItem, groups } = presentation;
  const mediaHubItems = useMemo(() => orderedItems.filter((item) => item.type === 'media'), [orderedItems]);
  const welcomeEntries = useMemo(
    () => buildWelcomeEntries(welcomeItems, welcomeProfileLocationsById),
    [welcomeItems, welcomeProfileLocationsById],
  );
  const heroIsLiveGathering = Boolean(heroItem?.gatheringId && liveGatheringIds.has(heroItem.gatheringId));
  const heroEyebrow = heroItem ? getCirclePulseHeroEyebrow(heroItem, heroIsLiveGathering) : null;
  const heroContext = heroItem?.gatheringId && liveGatheringsById?.[heroItem.gatheringId]
    ? 'Gathering with Live'
    : heroItem?.type === 'gathering'
      ? 'Next gathering'
      : heroItem?.type === 'love_seat'
        ? 'Featured introduction'
        : heroItem?.type === 'prompt'
          ? 'Question of the moment'
          : heroItem?.type === 'host_note'
            ? 'From your host'
            : 'Worth opening';
  const circleId = orderedItems[0]?.circleId ?? '';
  const welcomeProfileIds = useMemo(() => welcomeEntries.map((entry) => entry.profile.profileId), [welcomeEntries]);
  const { seenProfileIds, recordEvent } = useCirclePulseWelcomeState({
    circleId,
    viewerProfileId,
    profileIds: welcomeProfileIds,
    enabled: isMember && welcomeProfileIds.length > 0,
  });
  const openWelcomeProfile = (entry: CirclePulseWelcomeEntry) => {
    void recordEvent([entry.profile.profileId], 'profile_opened');
    onOpenFeaturedProfile?.(entry.profile.profileId);
  };
  const openWelcomeDiscussion = (entry: CirclePulseWelcomeEntry) => {
    void recordEvent([entry.profile.profileId], 'welcome_started');
    onOpenComments?.({
      ...entry.item,
      welcomeProfiles: [entry.profile, ...entry.item.welcomeProfiles.filter((profile) => profile.profileId !== entry.profile.profileId)],
    });
  };
  const viewerIsOnLoveSeat = Boolean(
    viewerProfileId
      && orderedItems.some((item) => item.type === 'love_seat' && item.featuredProfileId === viewerProfileId),
  );

  return (
    <View style={styles.journal}>
      {!isMember ? (
        <CirclePulseReveal>
          <LinearGradient colors={palette.gistGradient} style={[styles.emptyCard, { borderColor: palette.purpleBorder }]}>
            <MaterialCommunityIcons name="account-lock-outline" size={30} color={palette.purple} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Step inside the Circle</Text>
            <Text style={[styles.emptyBody, { color: palette.textMuted }]}>Join this trusted space to see its conversations, new arrivals and gatherings.</Text>
            <TouchableOpacity style={[styles.emptyAction, { backgroundColor: palette.tealStrong }]} onPress={withSelectionHaptic(onJoin)}><Text style={[styles.emptyActionText, { color: palette.tealInk }]}>{joinLabel}</Text></TouchableOpacity>
          </LinearGradient>
        </CirclePulseReveal>
      ) : loading && items.length === 0 ? (
        <CirclePulseReveal>
          <LinearGradient colors={palette.gradient} style={[styles.emptyCard, { borderColor: palette.outline }]}>
            <View style={[styles.loadingEmblem, { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft }]}>
              <MaterialCommunityIcons name="creation-outline" size={22} color={palette.teal} />
            </View>
            <View style={[styles.loadingWide, { backgroundColor: palette.outline }]} />
            <View style={[styles.loadingLine, { backgroundColor: palette.outlineSoft }]} />
            <View style={[styles.loadingShort, { backgroundColor: palette.outlineSoft }]} />
          </LinearGradient>
        </CirclePulseReveal>
      ) : items.length === 0 ? (
        <CirclePulseReveal>
          <LinearGradient colors={palette.gradient} style={[styles.emptyCard, { borderColor: palette.outline }]}>
            <MaterialCommunityIcons name="creation-outline" size={30} color={palette.purple} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>The Pulse is waiting</Text>
            <Text style={[styles.emptyBody, { color: palette.textMuted }]}>The first Prompt, Gathering, welcome or story will take this place when it arrives.</Text>
            {canManage ? <TouchableOpacity style={[styles.emptyAction, { backgroundColor: palette.tealStrong }]} onPress={withSelectionHaptic(onAddToPulse)}><Text style={[styles.emptyActionText, { color: palette.tealInk }]}>Add to Pulse</Text></TouchableOpacity> : null}
          </LinearGradient>
        </CirclePulseReveal>
      ) : (
        <>
          {viewerProfileId ? <CircleMediaConsentRequests circleId={circleId} actorProfileId={viewerProfileId} /> : null}
          {hostNoteItems.slice(0, 1).map((item) => (
            <CirclePulseReveal key={`host-note:${item.id}`} style={styles.hostNotePrelude}>
              <PulseItemCard
                item={item}
                compactHostNote
                unreadCount={Math.max(0, discussionUnreadByItemId?.[item.id] ?? 0)}
                palette={palette}
                compactWidth={responsive.compactWidth}
                onOpenComments={onOpenComments}
                onReportItem={onReportItem}
                viewerProfileId={viewerProfileId}
                canManage={canManage}
              />
            </CirclePulseReveal>
          ))}

          {heroItem && heroItem.type !== 'media' ? (
            <CirclePulseReveal key={`hero:${heroItem.id}`} style={styles.heroSection}>
              <View style={styles.heroHeading}>
                <View style={[styles.liveDot, { backgroundColor: palette.tealStrong }]} />
                <Text style={[styles.sectionEyebrow, { color: palette.teal }]}>{heroEyebrow}</Text>
                <View style={[styles.heroHeadingRule, { backgroundColor: palette.outline }]} />
                <Text style={[styles.heroContext, { color: palette.textMuted }]}>{heroContext}</Text>
              </View>
              <PulseItemCard
                item={heroItem}
                hero
                unreadCount={Math.max(0, discussionUnreadByItemId?.[heroItem.id] ?? 0)}
                liveGathering={heroItem.gatheringId ? liveGatheringsById?.[heroItem.gatheringId] : null}
                gatheringPosterMember={heroItem.imageUrl ? gatheringPosterMembersByUrl?.[heroItem.imageUrl.trim()] : null}
                palette={palette}
                compactWidth={responsive.compactWidth}
                onAnswerPrompt={onAnswerPrompt}
                onOpenGathering={onOpenGathering}
                onOpenMedia={onOpenMedia}
                onOpenComments={onOpenComments}
                onOpenFeaturedProfile={onOpenFeaturedProfile}
                onSendSignal={onSendSignal}
                onEndLoveSeat={onEndLoveSeat}
                onReportItem={onReportItem}
                viewerProfileId={viewerProfileId}
                canManage={canManage}
              />
            </CirclePulseReveal>
          ) : null}

          <CirclePulseWelcomeConstellation
            entries={welcomeEntries}
            viewerProfileId={viewerProfileId}
            seenProfileIds={seenProfileIds}
            onOpenProfile={openWelcomeProfile}
            onOpenWelcome={openWelcomeDiscussion}
            onGalleryOpened={(entries) => void recordEvent(entries.map((entry) => entry.profile.profileId), 'gallery_opened')}
          />

          {mediaHubItems.length > 0 ? (
            <CirclePulseReveal delay={95} style={styles.groupSection}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={[styles.sectionEyebrow, { color: palette.teal }]}>CIRCLE MEDIA</Text>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>Watch, save and talk about it</Text>
                  <Text style={[styles.sectionDescription, { color: palette.textMuted }]}>Photos, short films and stories shared safely with this Circle.</Text>
                </View>
                <Text style={[styles.groupCount, { color: palette.textMuted }]}>{mediaHubItems.length}</Text>
              </View>
              <CircleMediaHubSection
                circleId={circleId}
                viewerProfileId={viewerProfileId}
                items={mediaHubItems}
                onSubmitMedia={onSubmitMedia}
                renderItem={(item) => (
                  <PulseItemCard
                    item={item}
                    hero={item.id === heroItem?.id}
                    unreadCount={Math.max(0, discussionUnreadByItemId?.[item.id] ?? 0)}
                    palette={palette}
                    compactWidth={responsive.compactWidth}
                    onOpenMedia={onOpenMedia}
                    onOpenComments={onOpenComments}
                    onReportItem={onReportItem}
                    viewerProfileId={viewerProfileId}
                    canManage={canManage}
                  />
                )}
              />
            </CirclePulseReveal>
          ) : null}

          {groups.filter((group) => group.key !== 'media').map((group, groupIndex) => (
            <CirclePulseReveal key={group.key} delay={Math.min(240, 70 + (groupIndex * 45))} style={styles.groupSection}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={[styles.sectionEyebrow, { color: group.key === 'love_seat' ? palette.purple : palette.teal }]}>{group.eyebrow}</Text>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>{group.title}</Text>
                  {group.items.length > 1 ? <Text style={[styles.sectionDescription, { color: palette.textMuted }]}>{group.description}</Text> : null}
                </View>
                {group.items.length > 1 ? <Text style={[styles.groupCount, { color: palette.textMuted }]}>{group.items.length}</Text> : null}
              </View>
              <View style={styles.groupStack}>
                {group.items.map((item) => (
                  <PulseItemCard
                    key={item.id}
                    item={item}
                    unreadCount={Math.max(0, discussionUnreadByItemId?.[item.id] ?? 0)}
                    liveGathering={item.gatheringId ? liveGatheringsById?.[item.gatheringId] : null}
                    gatheringPosterMember={item.imageUrl ? gatheringPosterMembersByUrl?.[item.imageUrl.trim()] : null}
                    palette={palette}
                    compactWidth={responsive.compactWidth}
                    onAnswerPrompt={onAnswerPrompt}
                    onOpenGathering={onOpenGathering}
                    onOpenMedia={onOpenMedia}
                    onOpenComments={onOpenComments}
                    onOpenFeaturedProfile={onOpenFeaturedProfile}
                    onSendSignal={onSendSignal}
                    onEndLoveSeat={onEndLoveSeat}
                    onReportItem={onReportItem}
                    viewerProfileId={viewerProfileId}
                    canManage={canManage}
                  />
                ))}
              </View>
            </CirclePulseReveal>
          ))}

          {canManage ? (
            <Pressable
              accessibilityLabel="Curate Circle Pulse"
              style={[styles.manageAction, { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft }]}
              onPress={withSelectionHaptic(onAddToPulse)}
            >
              <MaterialCommunityIcons name="creation-outline" size={17} color={palette.teal} />
              <Text style={[styles.manageActionText, { color: palette.teal }]}>Curate Pulse</Text>
            </Pressable>
          ) : null}
        </>
      )}

      {isMember && !loading && !viewerIsOnLoveSeat && onRequestLoveSeat && onCancelLoveSeatRequest ? (
        <CirclePulseReveal delay={160}>
          <CircleLoveSeatRequestCard
            request={loveSeatRequest}
            loading={loveSeatRequestLoading}
            onJoinQueue={(note) => {
              if (process.env.NODE_ENV !== 'test') void Haptics.selectionAsync().catch(() => undefined);
              return onRequestLoveSeat(note);
            }}
            onLeaveQueue={withSelectionHaptic(onCancelLoveSeatRequest)}
          />
        </CirclePulseReveal>
      ) : null}

      {error ? <Text style={[styles.errorText, { color: palette.warning }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  journal: { gap: 24 },
  loveSeatTimePill: { alignSelf: 'flex-start', minHeight: 27, paddingHorizontal: 10, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5 },
  loveSeatTimeText: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  hostNotePrelude: { gap: 8 },
  heroSection: { gap: 11 },
  groupSection: { gap: 11 },
  heroHeading: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  heroHeadingRule: { flex: 1, height: StyleSheet.hairlineWidth },
  heroContext: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 3 },
  sectionHeadingCopy: { flex: 1, gap: 3 },
  sectionEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.5 },
  sectionTitle: { fontSize: 21, lineHeight: 27, fontFamily: 'PlayfairDisplay_700Bold' },
  sectionDescription: { fontSize: 11, lineHeight: 16 },
  groupCount: { minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', fontSize: 11, fontWeight: '900' },
  groupStack: { gap: 10 },
  itemCard: { position: 'relative', borderWidth: 1, borderRadius: 24, padding: 14, gap: 12, overflow: 'hidden' },
  cardAccent: { position: 'absolute', top: 18, bottom: 18, left: 0, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, opacity: 0.78 },
  promptCard: { paddingVertical: 17 },
  hostNoteCard: { paddingVertical: 15 },
  loveSeatCard: { padding: 16 },
  mediaCard: { padding: 12, gap: 13 },
  heroCard: { borderRadius: 28, padding: 16, shadowColor: '#00A6A6', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  poster: { height: 164, borderRadius: 19, overflow: 'hidden' },
  heroPoster: { height: 220, borderRadius: 22 },
  editorialMediaImage: { backgroundColor: 'rgba(3,18,20,0.68)' },
  posterBadge: { position: 'absolute', top: 11, left: 11, minHeight: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(6,26,29,0.62)' },
  posterBadgeText: { color: '#FFF9F1', fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  posterCopy: { position: 'absolute', left: 14, right: 14, bottom: 13, gap: 4 },
  posterTitle: { color: '#FFF9F1', fontSize: 22, lineHeight: 27, fontFamily: 'PlayfairDisplay_700Bold' },
  heroPosterTitle: { fontSize: 28, lineHeight: 33 },
  posterMeta: { color: 'rgba(255,249,241,0.78)', fontSize: 11, lineHeight: 16, fontWeight: '800' },
  itemLead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemLeadCopy: { flex: 1, minWidth: 0, gap: 3 },
  itemLabel: { fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  itemTitle: { fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  heroTitle: { fontSize: 27, lineHeight: 33 },
  featuredAvatarRing: { width: 66, height: 66, padding: 3, borderRadius: 33, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featuredAvatar: { width: 58, height: 58, borderRadius: 29 },
  cardManageButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { gap: 5 },
  itemBody: { fontSize: 12, lineHeight: 18 },
  editorialQuote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  quoteMark: { marginTop: -8, fontSize: 34, lineHeight: 36, fontFamily: 'PlayfairDisplay_700Bold' },
  promptQuestion: { flex: 1, fontSize: 17, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
  hostNoteCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hostNoteBody: { flex: 1, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  itemMeta: { fontSize: 11, lineHeight: 16 },
  itemMetaStrong: { fontSize: 11, lineHeight: 16, fontWeight: '800' },
  statusPill: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  statusPillText: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.1 },
  unavailableNotice: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1 },
  unavailableText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  itemActions: { minHeight: 40, flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  itemActionsCompact: { flexWrap: 'wrap' },
  primaryAction: { minHeight: 40, paddingHorizontal: 13, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryActionText: { fontSize: 11, fontWeight: '900' },
  discussionAction: { minHeight: 40, flex: 1, minWidth: 142, paddingHorizontal: 11, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reportAction: { width: 40, minHeight: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  discussionActionText: { flexShrink: 1, fontSize: 10, fontWeight: '900' },
  commentCount: { fontSize: 10, fontWeight: '900' },
  unreadPill: { minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadPillText: { color: '#FFF9F1', fontSize: 9, fontWeight: '900' },
  loveSeatPrimaryRow: { minHeight: 44, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  loveSeatMeetAction: { minHeight: 44, flex: 1, minWidth: 132, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  loveSeatMeetText: { flexShrink: 1, fontSize: 11, fontWeight: '900' },
  loveSeatSignalAction: { minHeight: 44, paddingHorizontal: 13, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  loveSeatSignalText: { fontSize: 10, fontWeight: '900' },
  loveSeatConversationPrimary: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  loveSeatConversationPrimaryText: { flexShrink: 1, fontSize: 11, fontWeight: '900' },
  emptyCard: { minHeight: 230, padding: 20, borderRadius: 28, borderWidth: 1, alignItems: 'flex-start', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 25, lineHeight: 31, fontFamily: 'PlayfairDisplay_700Bold' },
  emptyBody: { maxWidth: 390, fontSize: 12, lineHeight: 18 },
  emptyAction: { minHeight: 42, paddingHorizontal: 17, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { fontSize: 12, fontWeight: '900' },
  loadingEmblem: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  loadingWide: { width: '74%', height: 22, borderRadius: 11 },
  loadingLine: { width: '92%', height: 13, borderRadius: 7 },
  loadingShort: { width: '56%', height: 13, borderRadius: 7 },
  manageAction: { minHeight: 42, alignSelf: 'center', paddingHorizontal: 17, borderRadius: 21, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  manageActionText: { fontSize: 11, fontWeight: '900' },
  errorText: { fontSize: 11, lineHeight: 16 },
});
