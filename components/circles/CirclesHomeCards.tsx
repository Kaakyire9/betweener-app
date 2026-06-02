import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getCircleScopeLabel } from '@/lib/circles/circle-display';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

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
  title: string;
  starts_at: string;
  city?: string | null;
  gathering_type?: string | null;
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
  if ((circle.member_count ?? 0) > 0) return `${circle.member_count} members`;
  return 'Trusted space';
};

const toReasonChips = (reason: string | null | undefined) =>
  String(reason ?? '')
    .replace(/\u00c2/g, '')
    .split(/\s*(?:-|\u00b7)\s*/)
    .flatMap((part) => part
    .split('·')
    .map((part) => part.replace(/Â/g, '').trim())
    )
    .filter(Boolean)
    .slice(0, 3);

const useCircleHomeStyles = () => {
  const palette = useCirclePulsePalette();
  const styles = React.useMemo(() => createStyles(palette), [palette]);
  return { palette, styles };
};

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
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[circle.member_count ? `${circle.member_count} members` : null, getCircleScopeLabel(circle)].filter(Boolean).join(' - ')}
          </Text>
          <Text style={styles.softBadge}>{getCircleActivityLabel(circle)}</Text>
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
  activePrompt,
  compactDate,
  onAcceptIntro,
  onDeclineIntro,
  onAttend,
  onAnswerPrompt,
}: {
  warmIntro?: WarmIntroData | null;
  upcomingGathering?: GatheringData | null;
  activePrompt?: PromptData | null;
  compactDate: (value?: string | null) => string;
  onAcceptIntro: () => void;
  onDeclineIntro: () => void;
  onAttend: () => void;
  onAnswerPrompt: () => void;
}) {
  const { palette, styles } = useCircleHomeStyles();
  if (warmIntro) {
    return (
      <LinearGradient colors={palette.warmIntroGradient} style={styles.featuredPanel}>
        <Text style={styles.kicker}>Warm Introduction</Text>
        <Text style={styles.featuredTitle}>A Circle Host thinks you two may connect.</Text>
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
    return (
      <LinearGradient colors={palette.gatheringGradient} style={styles.featuredPanel}>
        <Text style={styles.kicker}>Upcoming Gathering</Text>
        <Text style={styles.featuredTitle}>{upcomingGathering.title}</Text>
        <Text style={styles.featuredBody}>
          {[compactDate(upcomingGathering.starts_at), upcomingGathering.city, upcomingGathering.gathering_type].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.chipRow}>
          {upcomingGathering.is_partner_venue ? <Text style={styles.infoChip}>Partner venue</Text> : null}
          {upcomingGathering.safe_first_date_space ? <Text style={styles.infoChip}>Safe first-date space</Text> : null}
          <Text style={styles.infoChip}>{upcomingGathering.attendee_count ?? 0} attending</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onAttend}>
          <Text style={styles.primaryButtonText}>Attend</Text>
        </TouchableOpacity>
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
  onSelectPerspective,
}: {
  gist: GistData | null | undefined;
  availablePerspectives?: string[];
  selectedPerspective?: string;
  onSelectPerspective?: (perspective: string) => void;
}) {
  const { palette, styles } = useCircleHomeStyles();
  if (!gist) return null;

  const perspectives = availablePerspectives?.length
    ? availablePerspectives
    : ['general', 'christian', 'muslim', 'culture', 'safety', 'communication'];
  const activePerspective = (availablePerspectives?.includes(selectedPerspective ?? '')
    ? selectedPerspective
    : gist.perspective ?? 'general')?.toLowerCase();

  return (
    <LinearGradient colors={palette.gistGradient} style={styles.gistPanel}>
      <Text style={styles.kicker}>Relationship Gist</Text>
      <Text style={styles.gistCaption}>Thoughtful guidance shaped around your values.</Text>
      <Text style={styles.featuredTitle}>{gist.title}</Text>
      <Text style={styles.featuredBody} numberOfLines={3}>{gist.short_body || gist.body}</Text>
      <View style={styles.gistPerspectiveRow}>
        {perspectives.map((item) => (
          <Pressable
            key={item}
            disabled={!onSelectPerspective || (availablePerspectives ? !availablePerspectives.includes(item) : false)}
            onPress={() => onSelectPerspective?.(item)}
            style={[
              styles.gistPerspectivePill,
              activePerspective === item && styles.gistPerspectivePillActive,
              availablePerspectives && !availablePerspectives.includes(item) && styles.gistPerspectivePillDisabled,
            ]}
          >
            <Text style={styles.gistPerspectivePillText}>
              {item === 'general' ? 'General' : item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
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
    ...StyleSheet.absoluteFillObject,
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
    color: '#F4E8D0',
    backgroundColor: 'rgba(7,30,34,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(244,232,208,0.16)',
    fontSize: 10,
    fontWeight: '800',
  },
  circleSeal: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,30,34,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(244,232,208,0.16)',
  },
  circleCardBody: { padding: 12, gap: 10 },
  cardTitle: { flex: 1, color: '#F4E8D0', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: 'rgba(244,232,208,0.6)', fontSize: 11 },
  cardBody: { color: palette.textSoft, fontSize: 12, lineHeight: 17 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
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
    padding: 17,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.tealBorder,
    gap: 10,
    overflow: 'hidden',
  },
  kicker: {
    color: palette.tealStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  featuredTitle: { color: palette.text, fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  featuredBody: { color: palette.textSoft, fontSize: 13, lineHeight: 20 },
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
    width: 196,
    minHeight: 116,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceMuted,
    gap: 9,
  },
  storyTitle: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  storyMeta: { color: palette.textMuted, fontSize: 11 },
  gistPanel: {
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    gap: 9,
    overflow: 'hidden',
  },
  gistCaption: { color: palette.textSoft, fontSize: 12 },
  gistPerspectiveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  gistPerspectivePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: palette.surfaceMuted,
  },
  gistPerspectivePillActive: {
    backgroundColor: palette.teal,
  },
  gistPerspectivePillDisabled: { opacity: 0.42 },
  gistPerspectivePillText: { color: palette.textSoft, fontSize: 11, fontWeight: '700' },
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
