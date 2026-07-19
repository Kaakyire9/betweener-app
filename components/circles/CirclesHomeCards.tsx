import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Animated, type GestureResponderEvent, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { getCircleScopePresentation } from '@/lib/circles/circle-display';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import SignatureSystemBubble from '@/components/signature/SignatureSystemBubble';

type CircleCardData = {
  id: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  visibility_scope?: string | null;
  faith_tags?: string[] | null;
  diaspora_tags?: string[] | null;
  circle_type?: string | null;
  is_official?: boolean | null;
  is_partner?: boolean | null;
  requires_join_approval?: boolean | null;
  member_count?: number | null;
  active_this_week_count?: number | null;
  gathering_count?: number | null;
  location_insight?: string | null;
};

type CirclePickData = {
  profile_id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  reason: string;
  circleName: string;
};

type CircleMemberPreview = {
  profile_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

type WarmIntroData = {
  id: string;
  reason: string;
  shared_context?: string[] | null;
};

type GatheringData = {
  id: string;
  circle_id?: string | null;
  title: string;
  description?: string | null;
  poster_url?: string | null;
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  gathering_type?: string | null;
  venue_name?: string | null;
  presentation_mode?: 'general' | 'seat_linked' | null;
  featured_profile_id?: string | null;
  featured_profile?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
    region?: string | null;
  } | null;
  seat_context?: 'welcome' | 'love' | null;
  host_created_for_member?: boolean | null;
  is_partner_venue?: boolean | null;
  safe_first_date_space?: boolean | null;
  attendee_count?: number | null;
};

type PromptData = {
  id: string;
  title: string;
  prompt: string;
};

type GistData = {
  id: string;
  title: string;
  body: string;
  short_body?: string | null;
  perspective?: string | null;
};

const getCircleBadges = (circle: CircleCardData) => {
  const badges: string[] = [];
  if (circle.is_official) badges.push('Official');
  if (circle.is_partner) badges.push('Partner');
  if (!circle.is_official && !circle.is_partner && circle.circle_type === 'gold_community') badges.push('Values-led');
  if (badges.length === 0 && (circle.active_this_week_count ?? 0) > 0) badges.push('Active');
  return badges.slice(0, 2);
};

const getCircleActivityLabel = (circle: CircleCardData) => {
  if ((circle.gathering_count ?? 0) > 0) return `${circle.gathering_count} Gathering soon`;
  if ((circle.active_this_week_count ?? 0) > 0) return `${circle.active_this_week_count} active this week`;
  return 'Trusted space';
};

const getCircleMemberLineLabel = (circle: CircleCardData) =>
  (circle.member_count ?? 0) > 0 ? `${circle.member_count} members` : 'Trusted space';

const toReasonChips = (reason: string | null | undefined) =>
  String(reason ?? '')
    .replace(/\u00c2/g, '')
    .split(/\s*(?:-|\u00b7)\s*/)
    .flatMap((part) => part
    .split('Â·')
    .map((part) => part.replace(/Ã‚/g, '').trim())
    )
    .filter(Boolean)
    .slice(0, 3);

const useCircleHomeStyles = () => {
  const palette = useCirclePulsePalette();
  const styles = React.useMemo(() => createStyles(palette), [palette]);
  return { palette, styles };
};

type CircleHomePalette = ReturnType<typeof useCircleHomeStyles>['palette'];
type CircleHomeStyles = ReturnType<typeof useCircleHomeStyles>['styles'];
type ResolvedGatheringFeaturedMember = {
  profile_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
} | null;
type HomeGatheringCardMetrics = {
  monthLabel: string;
  dayLabel: string;
  timeLabel: string;
  countdownLabel: string;
  locationLabel: string;
  gatheringTypeLabel: string | null;
  exactDateLabel: string;
  attendeeCount: number;
  attendingBadge: string;
  posterUri: string | null;
  featuredMember: ResolvedGatheringFeaturedMember;
  seatPortraitUri: string | null;
  seatName: string;
  seatContextLabel: string;
  seatContextCopy: string;
  posterSynopsis: string;
  canOpenFeaturedProfile: boolean;
  shouldRenderSeatLinked: boolean;
};

const getFirstName = (name?: string | null) => String(name ?? '').trim().split(/\s+/)[0] || 'member';
const getGatheringSeatContextLabel = (value?: 'welcome' | 'love' | null) => {
  if (value === 'welcome') return 'Welcome Seat';
  if (value === 'love') return 'Love Seat';
  return 'Featured member';
};
const getGatheringSeatContextCopy = (value: 'welcome' | 'love' | null | undefined, fullName?: string | null) => {
  const firstName = getFirstName(fullName);
  if (value === 'welcome') return `Hosted to welcome ${firstName} into the Circle with warmer first context.`;
  if (value === 'love') return `${firstName}'s Love Seat sets the tone for a warmer, more intentional night.`;
  return `A host-curated invitation shaped around ${firstName}'s Circle context.`;
};
const getGatheringTypeLabel = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'online') return 'Online';
  if (normalized === 'hybrid') return 'Hybrid';
  if (normalized === 'livestream') return 'Livestream';
  if (normalized === 'partner_venue') return 'Partner venue';
  if (normalized === 'physical') return null;
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};
const formatGatheringAttendanceBadge = (count?: number | null) => {
  const total = Math.max(0, Number(count ?? 0));
  return total === 1 ? '1 attending' : `${total} attending`;
};

const resolveHomeGatheringCardMetrics = ({
  gathering,
  compactDate,
  gatheringMemberPreviews,
  onOpenFeaturedProfile,
}: {
  gathering: GatheringData;
  compactDate: (value?: string | null) => string;
  gatheringMemberPreviews?: CircleMemberPreview[];
  onOpenFeaturedProfile?: () => void;
}): HomeGatheringCardMetrics => {
  const startDate = new Date(gathering.starts_at);
  const isValidDate = !Number.isNaN(startDate.getTime());
  const monthLabel = isValidDate
    ? startDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
    : 'SOON';
  const dayLabel = isValidDate ? startDate.toLocaleDateString(undefined, { day: '2-digit' }) : '--';
  const timeLabel = isValidDate
    ? startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'TBA';
  const countdownMs = isValidDate ? startDate.getTime() - Date.now() : 0;
  const countdownDays = countdownMs > 0 ? Math.ceil(countdownMs / (24 * 60 * 60 * 1000)) : 0;
  const countdownLabel = countdownMs <= 0
    ? 'Starting soon'
    : countdownMs < 60 * 60 * 1000
      ? `${Math.max(1, Math.floor(countdownMs / (60 * 1000)))}m to go`
      : countdownMs < 24 * 60 * 60 * 1000
        ? `${Math.max(1, Math.floor(countdownMs / (60 * 60 * 1000)))}h to go`
        : countdownDays >= 45
          ? `Coming in ${startDate.toLocaleDateString(undefined, { month: 'long' })}`
          : countdownDays >= 14
            ? `In ${Math.ceil(countdownDays / 7)} weeks`
            : `${countdownDays}d to go`;
  const locationLabel = gathering.city?.trim() || gathering.venue_name?.trim() || 'Circle space';
  const gatheringTypeLabel = getGatheringTypeLabel(gathering.gathering_type);
  const exactDateLabel = compactDate(gathering.starts_at);
  const attendeeCount = Math.max(0, Number(gathering.attendee_count ?? 0));
  const attendingBadge = formatGatheringAttendanceBadge(attendeeCount);
  const posterUri = normalizeProfilePhotoUri(gathering.poster_url) || gathering.poster_url?.trim() || null;
  const featuredMember = gathering.featured_profile
    ? {
        profile_id: gathering.featured_profile.id,
        full_name: gathering.featured_profile.full_name ?? null,
        avatar_url: gathering.featured_profile.avatar_url ?? null,
      }
    : gatheringMemberPreviews?.find((member) => member.profile_id === gathering.featured_profile_id) ?? null;
  const seatPortraitUri = featuredMember?.avatar_url || posterUri;
  const seatName = featuredMember?.full_name || 'Featured member';
  const seatContextLabel = getGatheringSeatContextLabel(gathering.seat_context);
  const seatContextCopy = getGatheringSeatContextCopy(gathering.seat_context, featuredMember?.full_name);
  const posterSynopsis = gathering.description?.trim() || locationLabel || exactDateLabel;
  const canOpenFeaturedProfile = Boolean(featuredMember?.profile_id && onOpenFeaturedProfile);
  const shouldRenderSeatLinked = gathering.presentation_mode === 'seat_linked' && Boolean(featuredMember?.profile_id);

  return {
    monthLabel,
    dayLabel,
    timeLabel,
    countdownLabel,
    locationLabel,
    gatheringTypeLabel,
    exactDateLabel,
    attendeeCount,
    attendingBadge,
    posterUri,
    featuredMember,
    seatPortraitUri,
    seatName,
    seatContextLabel,
    seatContextCopy,
    posterSynopsis,
    canOpenFeaturedProfile,
    shouldRenderSeatLinked,
  };
};

function GatheringTypeBadge({
  label,
  palette,
  styles,
}: {
  label: string;
  palette: CircleHomePalette;
  styles: CircleHomeStyles;
}) {
  const isOnline = label === 'Online';
  return (
    <LinearGradient
      colors={
        isOnline
          ? (palette.dark ? ['rgba(60, 214, 124, 0.24)', 'rgba(19, 184, 113, 0.12)'] : ['rgba(60, 214, 124, 0.18)', 'rgba(60, 214, 124, 0.08)'])
          : (palette.dark ? ['rgba(49, 227, 198, 0.18)', 'rgba(49, 227, 198, 0.1)'] : ['rgba(0, 128, 128, 0.16)', 'rgba(0, 128, 128, 0.08)'])
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gatheringTypePill}
    >
      <Text style={[styles.gatheringTypePillText, isOnline && styles.gatheringTypePillTextOnline]}>{label}</Text>
    </LinearGradient>
  );
}

function GatheringFooter({
  gathering,
  metrics,
  palette,
  styles,
  showPrimaryTitle,
  gatheringMemberPreviews,
  onAttend,
  onAddToCalendar,
  onOpenGathering,
}: {
  gathering: GatheringData;
  metrics: HomeGatheringCardMetrics;
  palette: CircleHomePalette;
  styles: CircleHomeStyles;
  showPrimaryTitle: boolean;
  gatheringMemberPreviews?: CircleMemberPreview[];
  onAttend: () => void;
  onAddToCalendar?: () => void;
  onOpenGathering?: () => void;
}) {
  return (
    <>
      <View style={styles.gatheringFeatureCopy}>
        {showPrimaryTitle ? <Text style={styles.kicker}>Upcoming Gathering</Text> : <Text style={styles.gatheringMetaKicker}>Event details</Text>}
        {showPrimaryTitle ? <Text style={styles.featuredTitle}>{gathering.title}</Text> : null}
        <View style={styles.gatheringMetaRow}>
          <Text style={styles.featuredBody}>{metrics.locationLabel}</Text>
          {metrics.gatheringTypeLabel ? <GatheringTypeBadge label={metrics.gatheringTypeLabel} palette={palette} styles={styles} /> : null}
        </View>
        <View style={styles.gatheringUtilityRow}>
          <View style={styles.gatheringCountdownPill}>
            <MaterialCommunityIcons name="timer-sand" size={13} color={palette.tealInk} />
            <Text style={styles.gatheringCountdownText}>{metrics.countdownLabel}</Text>
          </View>
          <Text style={styles.gatheringAttendanceBadge}>{metrics.attendingBadge}</Text>
        </View>
      </View>
      <View style={styles.chipRow}>
        {gathering.is_partner_venue ? <Text style={styles.infoChip}>Partner venue</Text> : null}
        {gathering.safe_first_date_space ? <Text style={styles.infoChip}>Safe first-date space</Text> : null}
        <Text style={styles.infoChip}>{metrics.exactDateLabel}</Text>
      </View>
      <View style={styles.gatheringSocialRow}>
        <View style={styles.avatarStack}>
          {gatheringMemberPreviews?.length ? (
            gatheringMemberPreviews.slice(0, 3).map((member, index) => (
              <Image
                key={member.profile_id}
                source={{ uri: String(member.avatar_url) }}
                style={[styles.avatarStackImage, index > 0 && styles.avatarStackOverlap]}
                accessibilityLabel={member.full_name ? `${member.full_name} attending avatar` : 'Attending avatar'}
              />
            ))
          ) : (
            <View style={styles.avatarStackFallback}>
              <MaterialCommunityIcons name="account-group-outline" size={15} color={palette.textSoft} />
            </View>
          )}
        </View>
        <Text style={styles.gatheringSocialText}>
          {metrics.attendeeCount > 0
            ? metrics.attendeeCount === 1
              ? '1 person already set a reminder'
              : `${metrics.attendeeCount} people already set a reminder`
            : 'Be the first to set a reminder'}
        </Text>
      </View>
      <View style={styles.featuredActions}>
        <TouchableOpacity style={styles.primaryButton} onPress={onAttend}>
          <Text style={styles.primaryButtonText}>Attend</Text>
        </TouchableOpacity>
        {onAddToCalendar ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={onAddToCalendar}>
            <Text style={styles.secondaryButtonText}>Add to calendar</Text>
          </TouchableOpacity>
        ) : null}
        {onOpenGathering ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={onOpenGathering}>
            <Text style={styles.secondaryButtonText}>Open Circle</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}

function GeneralGatheringHomeCard({
  gathering,
  metrics,
  palette,
  styles,
  gatheringMemberPreviews,
  onAttend,
  onAddToCalendar,
  onOpenGathering,
}: {
  gathering: GatheringData;
  metrics: HomeGatheringCardMetrics;
  palette: CircleHomePalette;
  styles: CircleHomeStyles;
  gatheringMemberPreviews?: CircleMemberPreview[];
  onAttend: () => void;
  onAddToCalendar?: () => void;
  onOpenGathering?: () => void;
}) {
  return (
    <>
      {metrics.posterUri ? (
        <View style={styles.gatheringPosterCinemaShell}>
          <Image
            source={{ uri: metrics.posterUri }}
            style={styles.gatheringPosterCinemaImage}
            accessibilityLabel={`${gathering.title} Gathering poster`}
          />
          <LinearGradient
            colors={
              palette.dark
                ? ['rgba(4,12,14,0.04)', 'rgba(4,12,14,0.22)', 'rgba(4,12,14,0.88)']
                : ['rgba(255,249,243,0.04)', 'rgba(31,42,42,0.12)', 'rgba(31,42,42,0.58)']
            }
            style={styles.gatheringPosterCinemaOverlay}
          />
          <View style={styles.gatheringPosterCinemaTop}>
            <Text style={styles.gatheringPosterCinemaKicker}>Upcoming Gathering</Text>
            <View style={styles.gatheringPosterCinemaDateBadge}>
              <Text style={styles.gatheringPosterMonth}>{metrics.monthLabel}</Text>
              <Text style={styles.gatheringPosterDay}>{metrics.dayLabel}</Text>
              <View style={styles.gatheringPosterDivider} />
              <Text style={styles.gatheringPosterTime}>{metrics.timeLabel}</Text>
            </View>
          </View>
          <View style={styles.gatheringPosterCinemaBottom}>
            <Text style={styles.gatheringPosterCinemaTitle} numberOfLines={2}>{gathering.title}</Text>
            <Text style={styles.gatheringPosterCinemaSynopsis} numberOfLines={2}>{metrics.posterSynopsis}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.gatheringHeroRow}>
          <View style={styles.gatheringPosterCard}>
            <Text style={styles.gatheringPosterMonth}>{metrics.monthLabel}</Text>
            <Text style={styles.gatheringPosterDay}>{metrics.dayLabel}</Text>
            <View style={styles.gatheringPosterDivider} />
            <Text style={styles.gatheringPosterTime}>{metrics.timeLabel}</Text>
          </View>
          <View style={styles.gatheringHeroCopy}>
            <Text style={styles.kicker}>Upcoming Gathering</Text>
            <Text style={styles.featuredTitle}>{gathering.title}</Text>
            <Text style={styles.featuredBody}>{metrics.locationLabel || metrics.exactDateLabel}</Text>
            <View style={styles.gatheringCountdownPill}>
              <MaterialCommunityIcons name="timer-sand" size={13} color={palette.tealInk} />
              <Text style={styles.gatheringCountdownText}>{metrics.countdownLabel}</Text>
            </View>
          </View>
        </View>
      )}
      <GatheringFooter
        gathering={gathering}
        metrics={metrics}
        palette={palette}
        styles={styles}
        showPrimaryTitle={!metrics.posterUri}
        gatheringMemberPreviews={gatheringMemberPreviews}
        onAttend={onAttend}
        onAddToCalendar={onAddToCalendar}
        onOpenGathering={onOpenGathering}
      />
    </>
  );
}

function SeatLinkedGatheringHomeCard({
  gathering,
  metrics,
  palette,
  styles,
  gatheringMemberPreviews,
  onAttend,
  onAddToCalendar,
  onOpenGathering,
  onOpenFeaturedProfile,
}: {
  gathering: GatheringData;
  metrics: HomeGatheringCardMetrics;
  palette: CircleHomePalette;
  styles: CircleHomeStyles;
  gatheringMemberPreviews?: CircleMemberPreview[];
  onAttend: () => void;
  onAddToCalendar?: () => void;
  onOpenGathering?: () => void;
  onOpenFeaturedProfile?: () => void;
}) {
  return (
    <>
      <LinearGradient colors={palette.gatheringGradient} style={styles.gatheringAvatarCinemaShell}>
        <View style={styles.gatheringAvatarCinemaTop}>
          <Text style={styles.gatheringHostPill}>Host-led invitation</Text>
          <Text style={styles.gatheringSeatContextPill}>{metrics.seatContextLabel}</Text>
        </View>
        <Pressable
          disabled={!metrics.canOpenFeaturedProfile}
          onPress={onOpenFeaturedProfile}
          accessibilityRole={metrics.canOpenFeaturedProfile ? 'button' : undefined}
          accessibilityLabel={metrics.canOpenFeaturedProfile ? `View ${metrics.seatName}'s profile` : undefined}
          style={({ pressed }) => [
            styles.gatheringAvatarCinemaBody,
            metrics.canOpenFeaturedProfile && styles.gatheringAvatarCinemaBodyInteractive,
            metrics.canOpenFeaturedProfile && pressed && styles.gatheringAvatarCinemaBodyPressed,
          ]}
        >
          {metrics.seatPortraitUri ? (
            <View style={styles.gatheringAvatarCinemaRing}>
              <Image source={{ uri: metrics.seatPortraitUri }} style={styles.gatheringAvatarCinemaImage} />
            </View>
          ) : (
            <View style={styles.gatheringAvatarCinemaFallback}>
              <MaterialCommunityIcons name="account-heart-outline" size={34} color="#F4E8D0" />
            </View>
          )}
          <View style={styles.gatheringAvatarCinemaCopy}>
            <Text style={styles.gatheringAvatarCinemaName} numberOfLines={1}>{metrics.seatName}</Text>
            <Text style={styles.gatheringAvatarCinemaEyebrow} numberOfLines={1}>{metrics.seatContextLabel}</Text>
            <Text style={styles.gatheringAvatarCinemaBodyText} numberOfLines={2}>{metrics.seatContextCopy}</Text>
          </View>
        </Pressable>
      </LinearGradient>
      <GatheringFooter
        gathering={gathering}
        metrics={metrics}
        palette={palette}
        styles={styles}
        showPrimaryTitle
        gatheringMemberPreviews={gatheringMemberPreviews}
        onAttend={onAttend}
        onAddToCalendar={onAddToCalendar}
        onOpenGathering={onOpenGathering}
      />
    </>
  );
}

export function CircleHeroCard({
  circle,
  imageUrl,
  memberPreviews,
  mode,
  onOpen,
  onJoin,
}: {
  circle: CircleCardData;
  imageUrl?: string | null;
  memberPreviews?: CircleMemberPreview[];
  mode: 'joined' | 'discover';
  onOpen: () => void;
  onJoin?: () => void;
}) {
  const { palette, styles } = useCircleHomeStyles();
  const scopePresentation = getCircleScopePresentation(circle);
  const memberLineLabel = getCircleMemberLineLabel(circle);
  return (
    <Pressable style={styles.circleCard} onPress={onOpen}>
      <View style={styles.circleHero}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.circleImage} />
        ) : (
          <LinearGradient colors={palette.fallbackGradient} style={styles.circleImageFallback}>
            <MaterialCommunityIcons name="account-group-outline" size={28} color="rgba(244,232,208,0.8)" />
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(4,12,14,0.02)', 'rgba(4,12,14,0.16)', 'rgba(4,12,14,0.92)']}
          style={styles.circleHeroOverlay}
        />
        <View style={styles.circleHeroTop}>
          <View style={styles.circleBadgeRow}>
            {getCircleBadges(circle).map((badge) => (
              <Text key={`${circle.id}:${badge}`} style={styles.heroBadge}>
                {badge}
              </Text>
            ))}
          </View>
          <View style={styles.circleSeal}>
            <MaterialCommunityIcons
              name={circle.faith_tags?.length ? 'cross' : circle.diaspora_tags?.length ? 'earth' : 'star-four-points-outline'}
              size={16}
              color="#F4E8D0"
            />
          </View>
        </View>
        <View style={styles.circleHeroBottom}>
          <Text style={styles.cardTitle} numberOfLines={1}>{circle.name}</Text>
          <View style={styles.softBadgeRow}>
            <Text style={styles.softBadge}>{memberLineLabel}</Text>
            {scopePresentation ? (
              <MaterialCommunityIcons
                name={scopePresentation.icon as any}
                size={10}
                color={palette.teal}
              />
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.circleCardBody}>
        <Text style={styles.cardBody} numberOfLines={2}>
          {circle.short_description || circle.description || 'Trusted community space for intentional connection.'}
        </Text>
        <View style={styles.cardActions}>
          <View style={styles.avatarStack}>
            {memberPreviews?.length ? (
              memberPreviews.slice(0, 3).map((member, index) => (
                <Image
                  key={member.profile_id}
                  source={{ uri: String(member.avatar_url) }}
                  style={[styles.avatarStackImage, index > 0 && styles.avatarStackOverlap]}
                  accessibilityLabel={member.full_name ? `${member.full_name} profile photo` : 'Circle member profile photo'}
                />
              ))
            ) : (
              <View style={styles.avatarStackFallback}>
                <MaterialCommunityIcons name="account-group-outline" size={15} color={palette.textSoft} />
              </View>
            )}
          </View>
          <View style={styles.cardActionTrail}>
            <Text style={styles.openLabel}>{mode === 'joined' ? 'Open' : circle.requires_join_approval ? 'Request' : 'Join'}</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={palette.teal} />
          </View>
        </View>
        {mode === 'discover' && onJoin ? (
          <TouchableOpacity style={styles.joinButton} onPress={onJoin}>
            <Text style={styles.joinButtonText}>{circle.requires_join_approval ? 'Request to join' : 'Join Circle'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CircleCompactCard({
  circle,
  imageUrl,
  mode,
  onOpen,
  onJoin,
  style,
}: {
  circle: CircleCardData;
  imageUrl?: string | null;
  mode: 'joined' | 'discover';
  onOpen: () => void;
  onJoin?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, styles } = useCircleHomeStyles();
  const badges = getCircleBadges(circle);
  const scopePresentation = getCircleScopePresentation(circle);
  const activityLabel = getCircleActivityLabel(circle);
  const memberLineLabel = getCircleMemberLineLabel(circle);

  return (
    <Pressable style={[styles.compactCircleCard, style]} onPress={onOpen}>
      <View style={styles.compactCircleGlow} />
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.compactCircleImage} />
      ) : (
        <LinearGradient colors={palette.fallbackGradient} style={styles.compactCircleImageFallback}>
          <MaterialCommunityIcons name="account-group-outline" size={22} color="rgba(244,232,208,0.8)" />
        </LinearGradient>
      )}
      <View style={styles.compactCircleBody}>
        <View style={styles.compactCircleTopRow}>
          <View style={styles.compactCircleCopy}>
            <Text style={styles.compactCircleTitle} numberOfLines={1}>{circle.name}</Text>
            <View style={styles.scopeMetaRowCompact}>
              <Text style={styles.compactCircleMeta} numberOfLines={1}>{memberLineLabel}</Text>
              {scopePresentation ? (
                <MaterialCommunityIcons
                  name={scopePresentation.icon as any}
                  size={10}
                  color={palette.teal}
                />
              ) : null}
            </View>
          </View>
          {badges.length ? (
            <View style={styles.compactBadgeShell}>
              <Text style={styles.compactBadgeText}>{badges[0]}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.compactCircleBodyText} numberOfLines={2}>
          {circle.short_description || circle.description || 'Trusted community space for intentional connection.'}
        </Text>
        <View style={styles.compactCircleFooter}>
          <Text style={styles.compactCircleActivity}>{activityLabel}</Text>
          {mode === 'discover' && onJoin ? (
            <TouchableOpacity style={styles.compactJoinButton} onPress={onJoin}>
              <Text style={styles.compactJoinButtonText}>{circle.requires_join_approval ? 'Request' : 'Join'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.compactOpenTrail}>
              <Text style={styles.compactOpenLabel}>Open</Text>
              <MaterialCommunityIcons name="chevron-right" size={15} color={palette.teal} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function CirclePickCard({
  pick,
  onOpenProfile,
}: {
  pick: CirclePickData;
  onOpenProfile: () => void;
}) {
  const { styles } = useCircleHomeStyles();
  return (
    <Pressable style={styles.pickCard} onPress={onOpenProfile}>
      <View style={styles.pickHeader}>
        <View style={styles.pickIdentity}>
          {pick.avatar_url ? (
            <Image source={{ uri: pick.avatar_url }} style={styles.pickAvatar} />
          ) : (
            <View style={styles.pickAvatarFallback}>
              <MaterialCommunityIcons name="account-heart-outline" size={28} color="rgba(244,232,208,0.64)" />
            </View>
          )}
          <View style={styles.pickIdentityText}>
            <Text style={styles.pickName} numberOfLines={1}>
              {pick.full_name ?? 'Member'}{pick.age ? `, ${pick.age}` : ''}
            </Text>
            <Text style={styles.pickCircle} numberOfLines={1}>{pick.circleName}</Text>
          </View>
        </View>
        <View style={styles.pickHeartBadge}>
          <MaterialCommunityIcons name="heart" size={12} color="#F4E8D0" />
        </View>
      </View>
      <View style={styles.pickChipRow}>
        {toReasonChips(pick.reason).map((chip) => (
          <Text key={`${pick.profile_id}:${chip}`} style={styles.pickChip}>
            {chip}
          </Text>
        ))}
      </View>
      <Text style={styles.pickReason} numberOfLines={2}>{pick.reason}</Text>
    </Pressable>
  );
}

export function CircleStoryCard({
  label,
  title,
  meta,
}: {
  label: string;
  title: string;
  meta?: string | null;
}) {
  const { styles } = useCircleHomeStyles();
  return (
    <View style={styles.storyCard}>
      <Text style={styles.kicker}>{label}</Text>
      <Text style={styles.storyTitle} numberOfLines={3}>{title}</Text>
      {meta ? <Text style={styles.storyMeta}>{meta}</Text> : null}
    </View>
  );
}

export function FeaturedSlotCard({
  warmIntro,
  upcomingGathering,
  gatheringMemberPreviews,
  activePrompt,
  compactDate,
  onAcceptIntro,
  onDeclineIntro,
  onAttend,
  onAddToCalendar,
  onOpenGathering,
  onOpenFeaturedProfile,
  onAnswerPrompt,
}: {
  warmIntro?: WarmIntroData | null;
  upcomingGathering?: GatheringData | null;
  gatheringMemberPreviews?: CircleMemberPreview[];
  activePrompt?: PromptData | null;
  compactDate: (value?: string | null) => string;
  onAcceptIntro: () => void;
  onDeclineIntro: () => void;
  onAttend: () => void;
  onAddToCalendar?: () => void;
  onOpenGathering?: () => void;
  onOpenFeaturedProfile?: () => void;
  onAnswerPrompt: () => void;
}) {
  const { palette, styles } = useCircleHomeStyles();
  if (warmIntro) {
    return (
      <LinearGradient colors={palette.warmIntroGradient} style={styles.featuredPanel}>
        <Text style={styles.kicker}>Warm Introduction</Text>
        <Text style={styles.featuredTitle}>A Circle Host thinks you two may connect.</Text>
        <SignatureSystemBubble system="warm_intro" compact inverted />
        <View style={styles.warmIntroBodies}>
          <View style={styles.introProfile}>
            <View style={styles.introAvatarShell}>
              <MaterialCommunityIcons name="account" size={26} color="#F4E8D0" />
            </View>
            <Text style={styles.introProfileLabel}>You</Text>
          </View>
          <View style={styles.introConnector}>
            <View style={styles.introLine} />
            <View style={styles.introHeart}>
              <MaterialCommunityIcons name="cards-heart-outline" size={18} color="#F4E8D0" />
            </View>
            <View style={styles.introLine} />
          </View>
          <View style={styles.introProfile}>
            <View style={[styles.introAvatarShell, styles.introAvatarShellAlt]}>
              <MaterialCommunityIcons name="account-star" size={26} color="#F4E8D0" />
            </View>
            <Text style={styles.introProfileLabel}>New match</Text>
          </View>
        </View>
        <Text style={styles.featuredBody}>{warmIntro.reason}</Text>
        <View style={styles.chipRow}>
          {(warmIntro.shared_context ?? []).slice(0, 3).map((item) => (
            <Text key={`${warmIntro.id}:${item}`} style={styles.infoChip}>{item}</Text>
          ))}
        </View>
        <View style={styles.featuredActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={onAcceptIntro}>
            <Text style={styles.primaryButtonText}>Accept intro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onDeclineIntro}>
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (upcomingGathering) {
    const metrics = resolveHomeGatheringCardMetrics({
      gathering: upcomingGathering,
      compactDate,
      gatheringMemberPreviews,
      onOpenFeaturedProfile,
    });

    return (
      <LinearGradient colors={palette.gatheringGradient} style={styles.featuredPanel}>
        {metrics.shouldRenderSeatLinked ? (
          <SeatLinkedGatheringHomeCard
            gathering={upcomingGathering}
            metrics={metrics}
            palette={palette}
            styles={styles}
            gatheringMemberPreviews={gatheringMemberPreviews}
            onAttend={onAttend}
            onAddToCalendar={onAddToCalendar}
            onOpenGathering={onOpenGathering}
            onOpenFeaturedProfile={onOpenFeaturedProfile}
          />
        ) : (
          <GeneralGatheringHomeCard
            gathering={upcomingGathering}
            metrics={metrics}
            palette={palette}
            styles={styles}
            gatheringMemberPreviews={gatheringMemberPreviews}
            onAttend={onAttend}
            onAddToCalendar={onAddToCalendar}
            onOpenGathering={onOpenGathering}
          />
        )}
      </LinearGradient>
    );
  }
  if (activePrompt) {
    return (
      <LinearGradient colors={palette.promptGradient} style={styles.featuredPanel}>
        <Text style={styles.kicker}>Circle Prompt</Text>
        <Text style={styles.featuredTitle}>{activePrompt.title}</Text>
        <Text style={styles.featuredBody}>{activePrompt.prompt}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onAnswerPrompt}>
          <Text style={styles.primaryButtonText}>Answer</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return null;
}

export function RelationshipGistCard({
  gist,
  availablePerspectives,
  selectedPerspective,
  onSelectPerspective: _onSelectPerspective,
  onOpenPerspectivePicker,
  onOpenReader,
  saved,
  progressLabel,
  onToggleSaved,
}: {
  gist: GistData | null | undefined;
  availablePerspectives?: string[];
  selectedPerspective?: string;
  onSelectPerspective?: (perspective: string) => void;
  onOpenPerspectivePicker?: (event: GestureResponderEvent) => void;
  onOpenReader?: () => void;
  saved?: boolean;
  progressLabel?: string;
  onToggleSaved?: () => void;
}) {
  const { palette, styles } = useCircleHomeStyles();
  const perspectives = availablePerspectives?.length
    ? availablePerspectives
    : ['general', 'christian', 'muslim', 'culture', 'safety', 'communication'];
  const activePerspective = (availablePerspectives?.includes(selectedPerspective ?? '')
    ? selectedPerspective
    : gist?.perspective ?? 'general')?.toLowerCase();
  const summary = gist?.short_body?.trim() || gist?.body?.trim() || '';
  const bodyPreview = gist?.short_body?.trim() && gist?.body?.trim() && gist.short_body.trim() !== gist.body.trim()
    ? gist.body?.trim()
    : null;
  const words = `${summary} ${bodyPreview ?? ''}`.trim().split(/\s+/).filter(Boolean).length;
  const readTimeLabel = `${Math.max(1, Math.ceil(words / 180))} min read`;
  const activePerspectiveLabel = activePerspective === 'general'
    ? 'General lens'
    : `${activePerspective?.[0]?.toUpperCase()}${activePerspective?.slice(1)} lens`;
  const contentAnim = React.useRef(new Animated.Value(0)).current;
  const isLongForm = summary.length + (bodyPreview?.length ?? 0) > 160;
  const translateY = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const translateX = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const scale = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });

  React.useEffect(() => {
    if (!gist) return;
    contentAnim.setValue(0);
    Animated.spring(contentAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 190,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [activePerspective, contentAnim, gist, gist?.body, gist?.id, gist?.short_body, gist?.title]);

  if (!gist) return null;

  return (
    <LinearGradient colors={palette.gistGradient} style={styles.gistPanel}>
      <View style={styles.gistPanelOrb} />
      <View style={styles.gistPanelOrbAlt} />
      <View style={styles.gistGlassRail} />
      <Animated.View
        style={[
          styles.gistContent,
          { opacity: contentAnim, transform: [{ translateY }, { translateX }, { scale }] },
        ]}
      >
        <Text style={styles.kicker}>Relationship Gist</Text>
        <Text style={styles.gistCaption}>Editorial guidance for intentional relationships.</Text>
        <Text style={styles.featuredTitle} numberOfLines={2}>{gist.title}</Text>
        <View style={styles.gistMetaRow}>
          <View style={styles.gistMetaPill}>
            <MaterialCommunityIcons name="tune-variant" size={12} color={palette.tealStrong} />
            <Text style={styles.gistMetaText}>{activePerspectiveLabel}</Text>
          </View>
          <View style={styles.gistMetaPill}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={12} color={palette.tealStrong} />
            <Text style={styles.gistMetaText}>{readTimeLabel}</Text>
          </View>
          {progressLabel ? (
            <View style={styles.gistMetaPill}>
              <MaterialCommunityIcons name="progress-clock" size={12} color={palette.tealStrong} />
              <Text style={styles.gistMetaText}>{progressLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.gistScrollShell}>
          <ScrollView
            style={styles.gistScrollViewport}
            contentContainerStyle={styles.gistScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            indicatorStyle="white"
          >
            <Text style={styles.gistSummary}>{summary}</Text>
            {bodyPreview ? <Text style={styles.gistBodyPreview}>{bodyPreview}</Text> : null}
          </ScrollView>
          {isLongForm ? (
            <View style={styles.gistScrollHintRow}>
              <MaterialCommunityIcons name="gesture-swipe-vertical" size={14} color={palette.textMuted} />
              <Text style={styles.gistScrollHint}>{onOpenReader ? 'Preview only' : 'Scroll to read more'}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
      <View style={styles.gistFooterRow}>
        {onToggleSaved ? (
          <Pressable style={styles.gistSaveButton} onPress={onToggleSaved}>
            <MaterialCommunityIcons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={15}
              color={saved ? palette.tealStrong : palette.textSoft}
            />
            <Text style={styles.gistSaveButtonText}>{saved ? 'Saved' : 'Save'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={!onOpenPerspectivePicker || perspectives.length <= 1}
          onPress={(event) => onOpenPerspectivePicker?.(event)}
          style={[
            styles.gistLensButton,
            (!onOpenPerspectivePicker || perspectives.length <= 1) && styles.gistLensButtonStatic,
          ]}
        >
          <MaterialCommunityIcons name="tune-variant" size={13} color={palette.tealStrong} />
          <Text style={styles.gistLensButtonText}>{activePerspectiveLabel}</Text>
          {onOpenPerspectivePicker && perspectives.length > 1 ? (
            <MaterialCommunityIcons name="chevron-down" size={14} color={palette.tealStrong} />
          ) : null}
        </Pressable>
        {onOpenReader ? (
          <Pressable style={styles.gistReaderLink} onPress={onOpenReader}>
            <Text style={styles.gistReaderLinkText}>Read full Gist</Text>
            <MaterialCommunityIcons name="arrow-top-right" size={15} color={palette.tealStrong} />
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const createStyles = (palette: CirclePulsePalette) => StyleSheet.create({
  circleCard: {
    width: 260,
    minHeight: 248,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceStrong,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  circleHero: {
    height: 144,
    position: 'relative',
    backgroundColor: palette.tealSoft,
  },
  circleImage: { width: '100%', height: '100%' },
  circleImageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  circleHeroOverlay: {
    ...StyleSheet.absoluteFill,
  },
  circleHeroTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleHeroBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  circleBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  heroBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: palette.overlayText,
    backgroundColor: palette.dark ? 'rgba(7,30,34,0.74)' : 'rgba(31,42,42,0.48)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(244,232,208,0.16)' : 'rgba(255,255,255,0.28)',
    fontSize: 10,
    fontWeight: '800',
  },
  circleSeal: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.dark ? 'rgba(7,30,34,0.62)' : 'rgba(31,42,42,0.42)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(244,232,208,0.16)' : 'rgba(255,255,255,0.22)',
  },
  circleCardBody: { padding: 12, gap: 10 },
  cardTitle: { flex: 1, color: palette.overlayText, fontSize: 15, fontWeight: '800' },
  cardBody: { color: palette.textSoft, fontSize: 12, lineHeight: 17 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  softBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  softBadge: { color: palette.teal, fontSize: 11, fontWeight: '800' },
  avatarStack: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  avatarStackImage: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: palette.surfaceStrong },
  avatarStackOverlap: { marginLeft: -7 },
  avatarStackFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.outlineSoft,
  },
  cardActionTrail: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openLabel: { color: palette.teal, fontSize: 12, fontWeight: '800' },
  joinButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.tealSoft,
    borderWidth: 1,
    borderColor: palette.tealBorder,
  },
  joinButtonText: { color: palette.teal, fontSize: 11, fontWeight: '800' },
  compactCircleCard: {
    minHeight: 122,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceStrong,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
  },
  compactCircleGlow: {
    position: 'absolute',
    right: -18,
    top: -6,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(19,168,168,0.08)',
  },
  compactCircleImage: {
    width: 62,
    height: 62,
    borderRadius: 17,
    backgroundColor: palette.surfaceMuted,
  },
  compactCircleImageFallback: {
    width: 62,
    height: 62,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCircleBody: { flex: 1, gap: 8 },
  compactCircleTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  compactCircleCopy: { flex: 1, gap: 3, minWidth: 0 },
  compactCircleTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
  compactCircleMeta: { color: palette.teal, fontSize: 11, fontWeight: '800' },
  scopeMetaRowCompact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactBadgeShell: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.tealBorder,
    backgroundColor: palette.tealSoft,
  },
  compactBadgeText: { color: palette.tealStrong, fontSize: 10, fontWeight: '800' },
  compactCircleBodyText: { color: palette.textSoft, fontSize: 11, lineHeight: 16 },
  compactCircleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto' },
  compactCircleActivity: { flex: 1, color: palette.teal, fontSize: 11, fontWeight: '800' },
  compactJoinButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.tealSoft,
    borderWidth: 1,
    borderColor: palette.tealBorder,
  },
  compactJoinButtonText: { color: palette.teal, fontSize: 10.5, fontWeight: '800' },
  compactOpenTrail: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  compactOpenLabel: { color: palette.teal, fontSize: 11, fontWeight: '800' },
  pickCard: {
    width: 272,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceStrong,
    gap: 10,
  },
  pickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  pickIdentityText: { flex: 1, gap: 4 },
  pickAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: palette.surfaceMuted },
  pickAvatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  pickHeartBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.purpleStrong,
  },
  pickName: { color: palette.text, fontSize: 13, fontWeight: '800' },
  pickCircle: { color: palette.tealStrong, fontSize: 11, fontWeight: '700' },
  pickChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickChip: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: palette.teal,
    backgroundColor: palette.tealSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  pickReason: { color: palette.textSoft, fontSize: 11, lineHeight: 16 },
  featuredPanel: {
    minHeight: 228,
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.tealBorder,
    gap: 12,
    overflow: 'hidden',
  },
  kicker: {
    color: palette.tealStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  featuredTitle: { color: palette.text, fontSize: 27, lineHeight: 33, fontFamily: 'PlayfairDisplay_700Bold' },
  featuredBody: { color: palette.textSoft, fontSize: 14, lineHeight: 21 },
  featuredActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  warmIntroBodies: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  introProfile: { alignItems: 'center', gap: 8, minWidth: 72 },
  introAvatarShell: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
    borderWidth: 2,
    borderColor: palette.outline,
  },
  introAvatarShellAlt: {
    borderColor: palette.purpleBorder,
  },
  introProfileLabel: { color: palette.text, fontSize: 12, fontWeight: '700' },
  introConnector: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  introLine: { flex: 1, height: 2, backgroundColor: palette.outline },
  introHeart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.purpleSoft,
    borderWidth: 1,
    borderColor: palette.outline,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoChip: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: palette.purple,
    backgroundColor: palette.purpleSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  storyCard: {
    width: 208,
    minHeight: 128,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceMuted,
    gap: 9,
  },
  storyTitle: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  storyMeta: { color: palette.textMuted, fontSize: 11 },
  gistPanel: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    gap: 12,
    overflow: 'hidden',
  },
  gistPanelOrb: {
    position: 'absolute',
    top: -24,
    right: -8,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: palette.purpleSoft,
  },
  gistPanelOrbAlt: {
    position: 'absolute',
    bottom: -28,
    left: -18,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: palette.tealSoft,
  },
  gistGlassRail: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    height: 42,
    borderRadius: 18,
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.52)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.07)' : palette.outlineSoft,
  },
  gistContent: { gap: 10 },
  gistCaption: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
  gistMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gistMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.08)' : palette.outlineSoft,
  },
  gistMetaText: { color: palette.textSoft, fontSize: 11, fontWeight: '800' },
  gistScrollShell: {
    marginTop: 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.075)' : palette.outlineSoft,
    backgroundColor: palette.dark ? 'rgba(5,18,24,0.38)' : 'rgba(255,255,255,0.68)',
    overflow: 'hidden',
  },
  gistScrollViewport: {
    maxHeight: 132,
  },
  gistScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  gistSummary: { color: palette.text, fontSize: 15, lineHeight: 23, fontWeight: '700' },
  gistBodyPreview: { color: palette.textSoft, fontSize: 12, lineHeight: 20 },
  gistScrollHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 2,
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.44)',
  },
  gistScrollHint: { color: palette.textMuted, fontSize: 10, fontWeight: '700' },
  gistFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  gistSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.065)' : 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.075)' : palette.outlineSoft,
  },
  gistSaveButtonText: { color: palette.textSoft, fontSize: 12, fontWeight: '800' },
  gistLensButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.dark ? 'rgba(6,24,27,0.44)' : palette.tealSoft,
    borderWidth: 1,
    borderColor: palette.tealBorder,
  },
  gistLensButtonStatic: { opacity: 0.92 },
  gistLensButtonText: { color: palette.text, fontSize: 12, fontWeight: '800' },
  gistReaderLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginLeft: 'auto',
  },
  gistReaderLinkText: { color: palette.tealStrong, fontSize: 12, fontWeight: '800' },
  gatheringHeroRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  gatheringPosterCinemaShell: {
    height: 210,
    minHeight: 184,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.08)' : palette.outline,
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
  },
  gatheringPosterCinemaImage: { width: '100%', height: '100%' },
  gatheringPosterCinemaOverlay: { ...StyleSheet.absoluteFill },
  gatheringPosterCinemaTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  gatheringPosterCinemaKicker: {
    alignSelf: 'flex-start',
    color: palette.overlayText,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.dark ? 'rgba(7,30,34,0.56)' : 'rgba(31,42,42,0.36)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(244,232,208,0.14)' : 'rgba(255,255,255,0.24)',
  },
  gatheringPosterCinemaDateBadge: {
    width: 84,
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: palette.dark ? 'rgba(7,30,34,0.72)' : 'rgba(31,42,42,0.44)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(244,232,208,0.14)' : 'rgba(255,255,255,0.24)',
    gap: 4,
  },
  gatheringPosterCinemaBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 8,
  },
  gatheringPosterCinemaSynopsis: {
    color: palette.overlayText,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.24)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  gatheringPosterCinemaTitle: {
    color: palette.overlayText,
    fontSize: 27,
    lineHeight: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  gatheringAvatarCinemaShell: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    padding: 16,
    gap: 14,
  },
  gatheringAvatarCinemaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  gatheringSeatContextPill: {
    color: palette.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.purpleSoft,
    borderWidth: 1,
    borderColor: palette.purpleBorder,
  },
  gatheringHostPill: {
    color: palette.textSoft,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.08)' : palette.outlineSoft,
  },
  gatheringAvatarCinemaBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gatheringAvatarCinemaBodyInteractive: { borderRadius: 20 },
  gatheringAvatarCinemaBodyPressed: { opacity: 0.9, transform: [{ scale: 0.992 }] },
  gatheringAvatarCinemaRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    padding: 3,
    backgroundColor: palette.dark ? 'rgba(113,86,255,0.52)' : 'rgba(139,92,255,0.28)',
  },
  gatheringAvatarCinemaImage: { width: '100%', height: '100%', borderRadius: 38, backgroundColor: palette.surfaceMuted },
  gatheringAvatarCinemaFallback: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.12)' : palette.outlineSoft,
  },
  gatheringAvatarCinemaCopy: { flex: 1, gap: 5, minWidth: 0 },
  gatheringAvatarCinemaName: { color: palette.text, fontSize: 22, lineHeight: 28, fontFamily: 'PlayfairDisplay_700Bold' },
  gatheringAvatarCinemaEyebrow: { color: palette.tealStrong, fontSize: 12, lineHeight: 17, fontWeight: '900', letterSpacing: 0.8 },
  gatheringAvatarCinemaBodyText: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
  gatheringPosterCard: {
    width: 86,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: palette.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: palette.dark ? 'rgba(255,255,255,0.12)' : palette.outlineSoft,
    gap: 5,
  },
  gatheringPosterMonth: { color: palette.tealStrong, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  gatheringPosterDay: { color: palette.text, fontSize: 30, lineHeight: 34, fontWeight: '900' },
  gatheringPosterDivider: { width: '100%', height: 1, backgroundColor: palette.dark ? 'rgba(255,255,255,0.1)' : palette.outlineSoft },
  gatheringPosterTime: { color: palette.textSoft, fontSize: 11, fontWeight: '700' },
  gatheringHeroCopy: { flex: 1, gap: 8 },
  gatheringFeatureCopy: { gap: 8 },
  gatheringMetaKicker: { color: palette.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  gatheringMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  gatheringTypePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.tealBorder,
    overflow: 'hidden',
  },
  gatheringTypePillText: { color: palette.teal, fontSize: 11, fontWeight: '900' },
  gatheringTypePillTextOnline: { color: palette.dark ? '#D7FFE8' : palette.tealStrong },
  gatheringUtilityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  gatheringCountdownPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.tealStrong,
  },
  gatheringCountdownText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
  gatheringAttendanceBadge: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.purpleSoft,
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    overflow: 'hidden',
  },
  gatheringSocialRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gatheringSocialText: { flex: 1, color: palette.textSoft, fontSize: 12, lineHeight: 18 },
  primaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.tealStrong,
  },
  primaryButtonText: { color: palette.tealInk, fontSize: 12, fontWeight: '900' },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.outline,
  },
  secondaryButtonText: { color: palette.text, fontSize: 12, fontWeight: '800' },
});
