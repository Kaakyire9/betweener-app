import OfflineImage from '@/components/media/OfflineImage';
import ProfileInterestStoryCard from '@/components/profile-interest/ProfileInterestStoryCard';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { showBetweenerAlert } from '@/components/ui/BetweenerAlertHost';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { readProfileInterestSnapshotState, writeProfileInterestSnapshot } from '@/lib/offline/profile-insights-store';
import {
  getMyProfileInterest,
  type ProfileInterestPerson,
  type ProfileInterestSummary,
  type ProfileInterestTimelineItem,
} from '@/lib/profile-interest';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const HERO_RING_COLORS = ['#29E6E4', '#A97CFF', '#FFC84D', '#4FD4FF', '#FF8FB5'] as const;
const COMPACT_RING_COLORS = ['#C4FFFF', '#C9B3FF', '#8BE7FF', '#FFD57A'] as const;

const timelineSignalMeta = (signal: string) => {
  switch (signal) {
    case 'profile_saved':
      return {
        icon: 'bookmark-outline',
        eyebrow: 'SAVE SIGNAL',
        title: 'saved your profile',
        body: 'Kept your profile close for later.',
        accent: '#D8B24D',
      };
    case 'profile_unsaved':
      return {
        icon: 'bookmark-remove-outline',
        eyebrow: 'SIGNAL SHIFT',
        title: 'removed your profile from saved',
        body: 'A previous save is no longer active.',
        accent: '#B48CFF',
      };
    case 'intro_replayed':
      return {
        icon: 'play-speed',
        eyebrow: 'INTRO REPLAY',
        title: 'replayed your intro',
        body: 'Came back to your introduction more than once.',
        accent: '#A97CFF',
      };
    case 'intro_played':
      return {
        icon: 'play-circle-outline',
        eyebrow: 'INTRO PLAY',
        title: 'played your intro',
        body: 'Spent time with your introduction.',
        accent: '#B48CFF',
      };
    case 'intro_completed':
      return {
        icon: 'play-circle-outline',
        eyebrow: 'INTRO COMPLETE',
        title: 'finished your intro',
        body: 'Watched your introduction through to the end.',
        accent: '#A97CFF',
      };
    case 'repeat_visit':
      return {
        icon: 'repeat',
        eyebrow: 'RETURN VISIT',
        title: 'revisited your profile',
        body: 'Came back for another look.',
        accent: '#29E6E4',
      };
    case 'intent_opened':
      return {
        icon: 'target',
        eyebrow: 'INTENT DEPTH',
        title: 'opened your Intent card',
        body: 'Spent time evaluating fit beyond the surface.',
        accent: '#35D2E2',
      };
    case 'full_profile_opened':
      return {
        icon: 'book-open-page-variant-outline',
        eyebrow: 'FULL STORY',
        title: 'opened your full profile',
        body: 'Went beyond the preview to learn more about you.',
        accent: '#35D2E2',
      };
    default:
      return {
        icon: 'eye-outline',
        eyebrow: 'PROFILE VIEW',
        title: 'viewed your profile',
        body: 'Spent time on your profile.',
        accent: '#29E6E4',
      };
  }
};

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const buildStoryPayload = (person: ProfileInterestPerson, focusSignal?: SignalKey) => {
  const visitCount = person.visit_count;
  const repeatCount = person.repeat_visit_count;
  const introPlayCount = person.intro_play_count;
  const introCompleteCount = person.intro_complete_count;
  const fullOpenCount = person.full_open_count;
  const saveCount = person.profile_save_count;
  const unsaveCount = person.profile_unsave_count;
  const intentCount = person.intent_open_count;
  const signal = (focusSignal ?? person.dominant_signal ?? 'visits') as string;
  const chips = [
    visitCount > 0 ? `${visitCount} ${pluralize(visitCount, 'visit')}` : null,
    repeatCount > 0 ? `${repeatCount} ${pluralize(repeatCount, 'revisit')}` : null,
    introPlayCount > 0 ? `${introPlayCount} intro ${pluralize(introPlayCount, 'play')}` : null,
    introCompleteCount > 0 ? `${introCompleteCount} intro ${pluralize(introCompleteCount, 'completion')}` : null,
    fullOpenCount > 0 ? `${fullOpenCount} full ${pluralize(fullOpenCount, 'open')}` : null,
    saveCount > 0 ? 'Saved your profile' : null,
    unsaveCount > 0 ? 'Unsaved later' : null,
    intentCount > 0 ? `${intentCount} Intent ${pluralize(intentCount, 'open')}` : null,
    ...(person.shared_values?.slice(0, 2).map((value) => `Shared: ${value}`) ?? []),
  ].filter(Boolean) as string[];

  switch (signal) {
    case 'saves':
    case 'profile_saved':
      return {
        title: `${person.name} decided to keep you close`,
        body: saveCount > 0
          ? `${person.name} still has your profile saved${visitCount > 0 ? ` and has checked in ${visitCount} ${pluralize(visitCount, 'time')} recently` : ''}. This is one of the clearest intent signals on the app.`
          : `${person.name} saved your profile before but later pulled back. The save signal is no longer active, so this story is no longer leading your cards.`,
        chips: chips.slice(0, 4),
        accentLabel: person.interest_level,
      };
    case 'intent':
    case 'intent_opened':
      return {
        title: `${person.name} explored your intent more deeply`,
        body: `${person.name} opened your Intent card${visitCount > 1 ? ` after visiting ${visitCount} times` : ''}. This usually means they are evaluating fit, not just browsing.`,
        chips: chips.slice(0, 4),
        accentLabel: person.interest_level,
      };
    case 'intro':
    case 'intro_replayed':
    case 'intro_played':
    case 'intro_completed':
      return {
        title: introPlayCount > 1
          ? `${person.name} came back to your intro`
          : `${person.name} spent time with your intro`,
        body: introCompleteCount > 0
          ? `${person.name} completed your introduction${fullOpenCount > 0 ? ` and opened your full story ${fullOpenCount} ${pluralize(fullOpenCount, 'time')}` : ''}. That's warmer than a surface-level tap.`
          : introPlayCount > 1
            ? `${person.name} replayed your introduction ${introPlayCount} ${pluralize(introPlayCount, 'time')}${fullOpenCount > 0 ? ` and opened your full story ${fullOpenCount} ${pluralize(fullOpenCount, 'time')}` : ''}. Replays usually mean they were paying attention to detail.`
            : `${person.name} watched your introduction${fullOpenCount > 0 ? ` and opened your full story ${fullOpenCount} ${pluralize(fullOpenCount, 'time')}` : ''}. That's warmer than a surface-level tap.`,
        chips: chips.slice(0, 4),
        accentLabel: person.interest_level,
      };
    case 'repeat':
    case 'repeat_visit':
      return {
        title: `${person.name} keeps coming back`,
        body: `${person.name} returned to your profile ${repeatCount} ${pluralize(repeatCount, 'extra time', 'extra times')}. Repeated visits are one of the best early curiosity signals.`,
        chips: chips.slice(0, 4),
        accentLabel: person.interest_level,
      };
    case 'full':
    case 'full_profile_opened':
      return {
        title: `${person.name} opened your full story`,
        body: `${person.name} went beyond the preview and opened your full profile ${fullOpenCount} ${pluralize(fullOpenCount, 'time')}. That usually means they wanted more context about you.`,
        chips: chips.slice(0, 4),
        accentLabel: person.interest_level,
      };
    case 'visits':
    default:
      return {
        title: `${person.name} noticed your profile`,
        body: `${person.name} spent time on your profile${visitCount > 1 ? ` across ${visitCount} visits` : ''}. This reads like active curiosity, not a passing glance.`,
        chips: chips.slice(0, 4),
        accentLabel: person.interest_level,
      };
  }
};

const uniquePreviewPeople = (people: ProfileInterestPerson[]) => {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (!person.profile_id || seen.has(person.profile_id)) return false;
    seen.add(person.profile_id);
    return true;
  });
};

const signalPriorityBase: Record<string, number> = {
  profile_saved: 600,
  intro_replayed: 500,
  intent_opened: 520,
  intro_completed: 460,
  intro_played: 410,
  repeat_visit: 420,
  profile_unsaved: 120,
  full_profile_opened: 320,
  profile_opened: 180,
};

const getSignalStrengthScore = (person: ProfileInterestPerson) =>
  (signalPriorityBase[person.dominant_signal ?? 'profile_opened'] ?? signalPriorityBase.profile_opened) +
  person.profile_open_count * 12 +
  person.full_open_count * 18 +
  person.intro_watch_count * 26 +
  person.profile_save_count * 42 +
  person.intent_open_count * 34 +
  person.repeat_visit_count * 24 +
  Math.min(person.interest_score, 24) * 6;

const getSignalTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const compareBySignalStrength = (left: ProfileInterestPerson, right: ProfileInterestPerson) => {
  const strengthDelta = getSignalStrengthScore(right) - getSignalStrengthScore(left);
  if (strengthDelta !== 0) return strengthDelta;
  return getSignalTimestamp(right.last_signal_at) - getSignalTimestamp(left.last_signal_at);
};

const buildPreviewFaces = (
  people: ProfileInterestPerson[],
  score: (person: ProfileInterestPerson) => number,
) =>
  uniquePreviewPeople(people)
    .sort((left, right) => {
      const scoreDelta = score(right) - score(left);
      if (scoreDelta !== 0) return scoreDelta;
      return getSignalTimestamp(right.last_signal_at) - getSignalTimestamp(left.last_signal_at);
    })
    .slice(0, 4)
    .map((person) => ({ profile_id: person.profile_id, name: person.name, avatar_url: person.avatar_url }));

const mergePreviewFaceSources = (
  primary: ProfileInterestPerson[],
  secondary: ProfileInterestPerson[],
) => {
  const merged: ProfileInterestPerson[] = [];
  const seen = new Set<string>();

  for (const person of [...primary, ...secondary]) {
    if (!person.profile_id || seen.has(person.profile_id)) continue;
    seen.add(person.profile_id);
    merged.push(person);
  }

  return merged;
};

type PreviewFace = {
  profile_id: string;
  name: string;
  avatar_url?: string | null;
};

type SignalKey = 'visits' | 'intro' | 'saves' | 'full' | 'repeat' | 'intent';

const storySignalMeta: Record<
  SignalKey,
  {
    tone: 'visits' | 'intro' | 'saves' | 'full' | 'repeat' | 'intent';
    eyebrow: string;
  }
> = {
  visits: { tone: 'visits', eyebrow: 'PROFILE CURIOSITY' },
  intro: { tone: 'intro', eyebrow: 'INTRO ATTENTION' },
  saves: { tone: 'saves', eyebrow: 'SAVE SIGNAL' },
  full: { tone: 'full', eyebrow: 'FULL STORY OPEN' },
  repeat: { tone: 'repeat', eyebrow: 'RETURN VISIT' },
  intent: { tone: 'intent', eyebrow: 'INTENT DEPTH' },
};

type StrongSignalHighlight = {
  key: string;
  signalKey: SignalKey;
  profileId: string;
  personName: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  accent: string;
  eyebrow: string;
  title: string;
  body: string;
};

const buildStrongSignalHighlights = (
  people: ProfileInterestPerson[],
  limit = 4,
): StrongSignalHighlight[] => {
  const candidates = people.flatMap((person) => {
    const items: (StrongSignalHighlight & { weight: number; signalUniq: string; timestamp: number })[] = [];
    const lastSignalAt = getSignalTimestamp(person.last_signal_at);

    if (person.profile_save_count > 0) {
      items.push({
        key: `${person.profile_id}-save`,
        signalKey: 'saves',
        signalUniq: 'saves',
        profileId: person.profile_id,
        personName: person.name,
        icon: 'bookmark-outline',
        accent: '#D8B24D',
        eyebrow: 'SAVE SIGNAL',
        title: 'Saved your profile',
        body: `${person.name} kept your profile for later.`,
        weight: 700 + person.profile_save_count * 50 + person.visit_count * 5,
        timestamp: lastSignalAt,
      });
    }

    if (person.intent_open_count > 0) {
      items.push({
        key: `${person.profile_id}-intent`,
        signalKey: 'intent',
        signalUniq: 'intent',
        profileId: person.profile_id,
        personName: person.name,
        icon: 'target',
        accent: '#33D6A6',
        eyebrow: 'INTENT DEPTH',
        title: 'Opened your Intent card',
        body: `${person.name} explored fit beyond the surface.`,
        weight: 620 + person.intent_open_count * 42 + person.repeat_visit_count * 10,
        timestamp: lastSignalAt,
      });
    }

    if (person.repeat_visit_count > 0) {
      items.push({
        key: `${person.profile_id}-repeat`,
        signalKey: 'repeat',
        signalUniq: 'repeat',
        profileId: person.profile_id,
        personName: person.name,
        icon: 'repeat',
        accent: '#29E6E4',
        eyebrow: 'RETURN VISIT',
        title: 'Came back again',
        body: `${person.name} revisited your profile ${person.repeat_visit_count} ${pluralize(person.repeat_visit_count, 'extra time', 'extra times')}.`,
        weight: 560 + person.repeat_visit_count * 34 + person.visit_count * 8,
        timestamp: lastSignalAt,
      });
    }

    if (person.intro_complete_count > 0 || person.intro_play_count > 1 || person.intro_watch_count > 0) {
      const introTitle =
        person.intro_complete_count > 0
          ? 'Finished your intro'
          : person.intro_play_count > 1
            ? 'Replayed your intro'
            : 'Watched your intro';
      const introBody =
        person.intro_complete_count > 0
          ? `${person.name} watched your introduction through to the end.`
          : person.intro_play_count > 1
            ? `${person.name} came back to your introduction more than once.`
            : `${person.name} spent time with your introduction.`;
      items.push({
        key: `${person.profile_id}-intro`,
        signalKey: 'intro',
        signalUniq: 'intro',
        profileId: person.profile_id,
        personName: person.name,
        icon: person.intro_play_count > 1 ? 'play-speed' : 'play-circle-outline',
        accent: '#A97CFF',
        eyebrow: person.intro_play_count > 1 ? 'INTRO REPLAY' : 'INTRO ATTENTION',
        title: introTitle,
        body: introBody,
        weight: 500 + person.intro_complete_count * 38 + person.intro_play_count * 24 + person.full_open_count * 8,
        timestamp: lastSignalAt,
      });
    }

    if (person.full_open_count > 0) {
      items.push({
        key: `${person.profile_id}-full`,
        signalKey: 'full',
        signalUniq: 'full',
        profileId: person.profile_id,
        personName: person.name,
        icon: 'book-open-page-variant-outline',
        accent: '#35D2E2',
        eyebrow: 'FULL STORY',
        title: 'Opened your full profile',
        body: `${person.name} went beyond the preview for more context.`,
        weight: 420 + person.full_open_count * 26 + person.visit_count * 6,
        timestamp: lastSignalAt,
      });
    }

    if (person.visit_count > 0) {
      items.push({
        key: `${person.profile_id}-visit`,
        signalKey: 'visits',
        signalUniq: 'visits',
        profileId: person.profile_id,
        personName: person.name,
        icon: 'eye-outline',
        accent: '#29E6E4',
        eyebrow: 'PROFILE CURIOSITY',
        title: 'Spent time on your profile',
        body: `${person.name} visited ${person.visit_count} ${pluralize(person.visit_count, 'time')}.`,
        weight: 240 + person.visit_count * 18,
        timestamp: lastSignalAt,
      });
    }

    return items;
  });

  const sorted = candidates.sort((left, right) => {
    const weightDelta = right.weight - left.weight;
    if (weightDelta !== 0) return weightDelta;
    return right.timestamp - left.timestamp;
  });

  const chosen: StrongSignalHighlight[] = [];
  const usedSignals = new Set<string>();

  for (const candidate of sorted) {
    if (usedSignals.has(candidate.signalUniq)) continue;
    chosen.push(candidate);
    usedSignals.add(candidate.signalUniq);
    if (chosen.length >= limit) return chosen;
  }

  for (const candidate of sorted) {
    if (chosen.some((item) => item.key === candidate.key)) continue;
    chosen.push(candidate);
    if (chosen.length >= limit) return chosen;
  }

  return chosen;
};

const hasMeaningfulSignalStory = (person: ProfileInterestPerson, signalKey: SignalKey) => {
  switch (signalKey) {
    case 'visits':
      return (
        person.visit_count > 1 ||
        person.repeat_visit_count > 0 ||
        person.full_open_count > 0 ||
        person.intro_watch_count > 0 ||
        person.profile_save_count > 0 ||
        person.intent_open_count > 0
      );
    case 'intro':
      return person.intro_play_count > 1 || person.intro_complete_count > 0 || person.full_open_count > 0;
    case 'saves':
      return person.profile_save_count > 0;
    case 'full':
      return person.full_open_count > 1 || person.intro_watch_count > 0 || person.visit_count > 1;
    case 'repeat':
      return person.repeat_visit_count > 0;
    case 'intent':
      return person.intent_open_count > 0;
    default:
      return false;
  }
};

const sortPeopleBySignalScore = (
  people: ProfileInterestPerson[],
  score: (person: ProfileInterestPerson) => number,
) =>
  [...people].sort((left, right) => {
    const scoreDelta = score(right) - score(left);
    if (scoreDelta !== 0) return scoreDelta;
    return getSignalTimestamp(right.last_signal_at) - getSignalTimestamp(left.last_signal_at);
  });

function InterestAvatarRow({
  people,
  totalCount,
  variant = 'compact',
  onPress,
  onPersonPress,
  locked = false,
  dense = false,
}: {
  people: PreviewFace[];
  totalCount: number;
  variant?: 'hero' | 'compact';
  onPress?: () => void;
  onPersonPress?: (person: PreviewFace) => void;
  locked?: boolean;
  dense?: boolean;
}) {
  const isHero = variant === 'hero';
  const avatarSize = isHero ? (dense ? 60 : 70) : 34;
  const overlap = isHero ? (dense ? 39 : 45) : 21;
  const borderWidth = isHero ? (dense ? 2 : 2.25) : 1.6;
  const lockedBlurRadius = !locked ? 0 : Platform.OS === 'android' ? (isHero ? 10 : 7) : isHero ? 20 : 14;
  const lockedScrimStyle = locked
    ? Platform.OS === 'android'
      ? styles.previewAvatarScrimAndroid
      : styles.previewAvatarScrim
    : null;
  const visibleCount = isHero ? Math.min(people.length, 4) : Math.min(people.length, 4);
  const visiblePeople = people.slice(0, visibleCount);
  const extraCount = Math.max(totalCount - visiblePeople.length, 0);
  const showLockTail = locked && extraCount > 0;
  const renderCountPill = !locked && !isHero && extraCount > 0;
  const colors = isHero ? HERO_RING_COLORS : COMPACT_RING_COLORS;
  const stackWidth = visiblePeople.length
    ? visiblePeople.length * overlap + avatarSize - overlap + (showLockTail ? overlap : 0)
    : avatarSize;

  const content = (
    <View style={[styles.previewStack, { width: stackWidth, height: avatarSize }]}>
      {visiblePeople.map((person, index) => {
        const ringColor = colors[index % colors.length];
        return (
          <View
            key={`${person.name}-${index}`}
            style={[
              styles.previewAvatarFrame,
              isHero ? styles.previewAvatarFrameHero : null,
              {
                width: avatarSize,
                height: avatarSize,
                left: index * overlap,
                borderRadius: avatarSize / 2,
                borderWidth,
                borderColor: ringColor,
                zIndex: visiblePeople.length - index + 1,
              },
            ]}
          >
            {person.avatar_url ? (
              <OfflineImage
                uri={person.avatar_url}
                blurRadius={lockedBlurRadius}
                style={[styles.previewAvatarImage, { borderRadius: avatarSize / 2 }]}
              />
            ) : (
              <View style={[styles.previewAvatarFallback, { borderRadius: avatarSize / 2 }]}>
                <MaterialCommunityIcons name="account" size={isHero ? 22 : 14} color="#C6FFFF" />
              </View>
            )}
            {lockedScrimStyle ? <View style={lockedScrimStyle} /> : null}
            {!locked && onPersonPress ? (
              <Pressable
                onPress={() => onPersonPress(person)}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
        );
      })}

      {showLockTail ? (
        <View
          style={[
            styles.previewAvatarFrame,
            styles.previewLockTail,
            isHero ? styles.previewAvatarFrameHero : null,
            {
              width: avatarSize,
              height: avatarSize,
              left: visiblePeople.length * overlap,
              borderRadius: avatarSize / 2,
              borderWidth,
              borderColor: HERO_RING_COLORS[Math.min(visiblePeople.length, HERO_RING_COLORS.length - 1)],
            },
          ]}
        >
          <LinearGradientSafe
            colors={['rgba(255,143,181,0.24)', 'rgba(15,27,34,0.92)']}
            start={[0, 0]}
            end={[1, 1]}
            style={[styles.previewAvatarImage, { borderRadius: avatarSize / 2 }]}
          />
          <MaterialCommunityIcons name="lock-outline" size={isHero ? 22 : 14} color="#EAFDFC" />
        </View>
      ) : null}

      {renderCountPill ? (
        <View
          style={[
            styles.previewCountPill,
            {
              left: visiblePeople.length * overlap,
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
            },
          ]}
        >
          <Text style={[styles.previewCountText, { fontSize: isHero ? 18 : 13 }]}>+{extraCount}</Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.previewTouch, pressed ? styles.previewTouchPressed : null]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

function InterestMetricCard({
  icon,
  accent,
  value,
  lead,
  tail,
  previewPeople,
  totalCount,
  onPreviewPress,
  onPersonPress,
  onPress,
  selected = false,
  theme,
  isDark,
  compact = false,
  lockedPreview = false,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  accent: string;
  value: number;
  lead: string;
  tail: string;
  previewPeople: PreviewFace[];
  totalCount: number;
  onPreviewPress?: () => void;
  onPersonPress?: (person: PreviewFace) => void;
  onPress?: () => void;
  selected?: boolean;
  theme: typeof Colors.light;
  isDark: boolean;
  compact?: boolean;
  lockedPreview?: boolean;
}) {
  const content = (
    <LinearGradient
      colors={
        isDark
          ? ['rgba(16, 28, 34, 0.98)', 'rgba(11, 20, 26, 0.96)']
          : ['rgba(248, 252, 252, 0.98)', 'rgba(241, 247, 249, 0.96)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.metricCard,
        compact ? styles.metricCardCompact : null,
        selected ? styles.metricCardSelected : null,
        {
          backgroundColor: theme.backgroundSubtle,
          borderColor: selected ? `${accent}88` : theme.outline,
        },
      ]}
    >
      <View style={[styles.metricCardAura, { backgroundColor: `${accent}12` }]} />
      <LinearGradientSafe
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
        start={[0, 0]}
        end={[0, 1]}
        style={styles.metricCardSheen}
      />
      <View style={styles.metricTopRow}>
        <View style={[styles.metricValueRow, compact ? styles.metricValueRowCompact : null]}>
          <View style={[styles.metricIconWrap, compact ? styles.metricIconWrapCompact : null, { backgroundColor: `${accent}20` }]}>
            <MaterialCommunityIcons name={icon} size={compact ? 22 : 24} color={accent} />
          </View>
          <Text style={[styles.metricValue, compact ? styles.metricValueCompact : null, { color: accent }]}>{value}</Text>
        </View>
        <View style={styles.metricCopyBlock}>
          <Text style={[styles.metricLead, compact ? styles.metricLeadCompact : null, { color: theme.text }]}>{lead}</Text>
          <Text style={[styles.metricTail, compact ? styles.metricTailCompact : null, { color: theme.text }]}>{tail}</Text>
        </View>
      </View>
      {totalCount > 0 ? (
        <View style={styles.metricPreviewRow}>
          <InterestAvatarRow
            people={previewPeople}
            totalCount={totalCount}
            variant="compact"
            onPress={onPreviewPress}
            onPersonPress={onPersonPress}
            locked={lockedPreview}
          />
        </View>
      ) : (
        <View style={styles.metricEmptySpacer} />
      )}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.metricCardPressable, pressed ? styles.metricCardPressed : null]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

function StrongSignalHighlightCard({
  item,
  theme,
  isDark,
  compact,
  stacked,
  onPress,
}: {
  item: StrongSignalHighlight;
  theme: typeof Colors.light;
  isDark: boolean;
  compact: boolean;
  stacked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.strongSignalCardPressable,
        stacked ? styles.strongSignalCardPressableStacked : null,
        pressed ? styles.metricCardPressed : null,
      ]}
    >
      <LinearGradient
        colors={
          isDark
            ? ['rgba(16, 28, 34, 0.98)', 'rgba(10, 18, 24, 0.96)']
            : ['rgba(248, 252, 253, 0.98)', 'rgba(241, 247, 250, 0.97)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.strongSignalCard, compact ? styles.strongSignalCardCompact : null, { borderColor: theme.outline }]}
      >
        <View style={[styles.strongSignalCardAura, { backgroundColor: isDark ? `${item.accent}18` : `${item.accent}12` }]} />
        <LinearGradientSafe
          colors={
            isDark
              ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']
              : ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']
          }
          start={[0, 0]}
          end={[0, 1]}
          style={styles.strongSignalCardSheen}
        />
        <View style={styles.strongSignalCardTop}>
          <View
            style={[
              styles.strongSignalCardBadge,
              {
                backgroundColor: isDark ? `${item.accent}20` : `${item.accent}14`,
                borderColor: isDark ? `${item.accent}30` : `${item.accent}24`,
              },
            ]}
          >
            <Text style={[styles.strongSignalCardBadgeText, { color: item.accent }]} numberOfLines={1}>
              {item.eyebrow}
            </Text>
          </View>
          <View
            style={[
              styles.strongSignalCardIconWrap,
              {
                backgroundColor: isDark ? `${item.accent}18` : `${item.accent}14`,
                borderColor: isDark ? `${item.accent}14` : `${item.accent}18`,
              },
            ]}
          >
            <MaterialCommunityIcons name={item.icon} size={18} color={item.accent} />
          </View>
        </View>
        <Text style={[styles.strongSignalCardTitle, { color: theme.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.strongSignalCardBody, { color: isDark ? theme.textMuted : '#5E6F76' }]} numberOfLines={3}>
          {item.body}
        </Text>
        <View
          style={[
            styles.strongSignalCardPersonPill,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.82)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(126, 145, 154, 0.24)',
            },
          ]}
        >
          <Text style={[styles.strongSignalCardPersonText, { color: theme.text }]} numberOfLines={1}>
            {item.personName}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function PersonAvatar({ person }: { person: Pick<ProfileInterestPerson, 'name' | 'avatar_url'> }) {
  const initial = person.name.trim().charAt(0).toUpperCase() || 'B';
  return person.avatar_url ? (
    <OfflineImage uri={person.avatar_url} style={styles.avatar} />
  ) : (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export default function ProfileInterestScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const [summary, setSummary] = useState<ProfileInterestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSignalKey, setActiveSignalKey] = useState<SignalKey>('visits');
  const contentWidth = Math.max(width - 36, 0);
  const compactHero = contentWidth < 390;
  const compactMetrics = contentWidth < 390;
  const stackUpsell = contentWidth < 430;
  const wrapStrongSignals = contentWidth < 420;
  const stackStrongSignalCards = contentWidth < 390;
  const strongSignalCardLimit = stackStrongSignalCards ? 3 : 4;

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const nextSummary = await getMyProfileInterest();
      setSummary(nextSummary);
      if (profile?.id) {
        await writeProfileInterestSnapshot(profile.id, nextSummary);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Profile Interest.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const cached = await readProfileInterestSnapshotState(profile.id);
      if (cancelled || !cached.data) return;
      setSummary((current) => current ?? cached.data);
      setLoading((current) => (current ? false : current));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = summary?.metrics;
  const heroGradientColors: [string, string, string] = isDark
    ? ['#071118', '#0A1B24', '#071018']
    : ['#F5FCFD', '#EEF6FF', '#F6F1FF'];
  const heroCtaColors: [string, string, string] = isDark
    ? ['#1FD5E2', '#6D82FF', '#9E6EFF']
    : ['#1CCFE0', '#4E86FF', '#8D63FF'];
  const bottomUpsellActionColors: [string, string, string] = isDark
    ? ['#16CFE0', '#4B88FF', '#8A63FF']
    : ['#10C8D9', '#467FFF', '#7D5DF8'];
  const bottomUpsellIconColors: [string, string] = isDark
    ? ['#5B76FF', '#A05FF2']
    : ['#4A74FF', '#8D4CF6'];
  const softMutedText = isDark ? theme.textMuted : '#5F737A';
  const surfaceMutedText = isDark ? theme.textMuted : '#51666F';
  const surfaceOutline = isDark ? theme.outline : 'rgba(125, 145, 154, 0.28)';
  const strongest = useMemo(
    () => (summary?.people ?? []).filter((person) => person.interest_score >= 7).slice(0, 6),
    [summary?.people],
  );
  const plan = summary?.plan ?? 'FREE';
  const previewPeople = useMemo(() => {
    const allPeople = summary?.people ?? [];

    return {
      visits: buildPreviewFaces(
        allPeople.filter((person) => person.visit_count > 0),
        (person) => person.visit_count * 10 + person.repeat_visit_count * 16 + person.full_open_count * 12,
      ),
      intro: buildPreviewFaces(
        allPeople.filter((person) => person.intro_watch_count > 0),
        (person) => person.intro_watch_count * 20 + person.full_open_count * 10 + person.visit_count * 4,
      ),
      saves: buildPreviewFaces(
        allPeople.filter((person) => person.profile_save_count > 0),
        (person) => person.profile_save_count * 30 + person.visit_count * 6 + person.repeat_visit_count * 10,
      ),
      full: buildPreviewFaces(
        allPeople.filter((person) => person.full_open_count > 0),
        (person) => person.full_open_count * 22 + person.intro_watch_count * 10 + person.visit_count * 6,
      ),
      repeat: buildPreviewFaces(
        allPeople.filter((person) => person.repeat_visit_count > 0),
        (person) => person.repeat_visit_count * 24 + person.visit_count * 8 + person.intent_open_count * 10,
      ),
      intent: buildPreviewFaces(
        allPeople.filter((person) => person.intent_open_count > 0),
        (person) => person.intent_open_count * 28 + person.repeat_visit_count * 10 + person.visit_count * 6,
      ),
      teaser: buildPreviewFaces(
        mergePreviewFaceSources(strongest, allPeople),
        getSignalStrengthScore,
      ),
    };
  }, [strongest, summary?.people]);
  const exploredPeopleCount = useMemo(
    () => metrics?.unique_visitors ?? metrics?.profile_visits ?? summary?.people.length ?? 0,
    [metrics?.profile_visits, metrics?.unique_visitors, summary?.people.length],
  );
  const peopleBySignal = useMemo(
    () => ({
      visits: sortPeopleBySignalScore(
        (summary?.people ?? []).filter((person) => person.visit_count > 0),
        (person) => person.visit_count * 10 + person.repeat_visit_count * 16 + person.full_open_count * 12,
      ),
      intro: sortPeopleBySignalScore(
        (summary?.people ?? []).filter((person) => person.intro_watch_count > 0),
        (person) => person.intro_watch_count * 20 + person.full_open_count * 10 + person.visit_count * 4,
      ),
      saves: sortPeopleBySignalScore(
        (summary?.people ?? []).filter((person) => person.profile_save_count > 0),
        (person) => person.profile_save_count * 30 + person.visit_count * 6 + person.repeat_visit_count * 10,
      ),
      full: sortPeopleBySignalScore(
        (summary?.people ?? []).filter((person) => person.full_open_count > 0),
        (person) => person.full_open_count * 22 + person.intro_watch_count * 10 + person.visit_count * 6,
      ),
      repeat: sortPeopleBySignalScore(
        (summary?.people ?? []).filter((person) => person.repeat_visit_count > 0),
        (person) => person.repeat_visit_count * 24 + person.visit_count * 8 + person.intent_open_count * 10,
      ),
      intent: sortPeopleBySignalScore(
        (summary?.people ?? []).filter((person) => person.intent_open_count > 0),
        (person) => person.intent_open_count * 28 + person.repeat_visit_count * 10 + person.visit_count * 6,
      ),
    }),
    [summary?.people],
  );
  const signalPanelMeta = useMemo(
    () => ({
      visits: {
        title: 'Profile explorers',
        subtitle: 'People who spent time on your profile.',
      },
      intro: {
        title: 'Intro watchers',
        subtitle: 'People who played or completed your introduction.',
      },
      saves: {
        title: 'Profile savers',
        subtitle: 'People who kept your profile for later.',
      },
      full: {
        title: 'Full story openers',
        subtitle: 'People who opened your full profile for more context.',
      },
      repeat: {
        title: 'Repeat visitors',
        subtitle: 'People who came back more than once.',
      },
      intent: {
        title: 'Intent openers',
        subtitle: 'People who explored your Intent card more deeply.',
      },
    }),
    [],
  );
  const activeSignalPeople = peopleBySignal[activeSignalKey] ?? [];
  const featuredStory = useMemo(() => {
    const signalCandidates = activeSignalPeople.length
      ? activeSignalPeople
      : [...(summary?.people ?? [])]
          .filter(
            (person) =>
              person.profile_save_count > 0 ||
              person.intent_open_count > 0 ||
              person.intro_watch_count > 0 ||
              person.repeat_visit_count > 0 ||
              person.full_open_count > 0,
          )
          .sort(compareBySignalStrength);
    const person = signalCandidates[0] ?? (strongest.length ? strongest[0] : undefined);
    return person ? { person, story: buildStoryPayload(person, activeSignalKey) } : null;
  }, [activeSignalKey, activeSignalPeople, strongest, summary?.people]);
  const shouldShowSignalStory = useMemo(
    () => (featuredStory ? hasMeaningfulSignalStory(featuredStory.person, activeSignalKey) : false),
    [activeSignalKey, featuredStory],
  );
  const strongSignalHighlights = useMemo(
    () => buildStrongSignalHighlights(strongest.length ? strongest : summary?.people ?? [], strongSignalCardLimit),
    [strongSignalCardLimit, strongest, summary?.people],
  );
  const showStrongSignalHighlights = strongSignalHighlights.length > 0;
  const engagementCards = useMemo(
    () => [
      {
        key: 'visits',
        icon: 'eye-outline' as const,
        accent: theme.tint,
        value: metrics?.unique_visitors ?? metrics?.profile_visits ?? 0,
        lead: `${(metrics?.unique_visitors ?? metrics?.profile_visits ?? 0) === 1 ? 'person explored' : 'people explored'}`,
        tail: 'your profile',
        previewPeople: previewPeople.visits,
        totalCount: metrics?.unique_visitors ?? metrics?.profile_visits ?? 0,
        signalKey: 'visits' as const,
      },
      {
        key: 'intro',
        icon: 'play-outline' as const,
        accent: theme.accent,
        value: metrics?.intro_watches ?? 0,
        lead: `${metrics?.intro_watches === 1 ? 'person watched' : 'people watched'}`,
        tail: 'your introduction',
        previewPeople: previewPeople.intro,
        totalCount: metrics?.intro_watches ?? 0,
        signalKey: 'intro' as const,
      },
      {
        key: 'saves',
        icon: 'bookmark-outline' as const,
        accent: '#D8B24D',
        value: metrics?.profile_saves ?? 0,
        lead: `${metrics?.profile_saves === 1 ? 'person saved' : 'people saved'}`,
        tail: 'your profile',
        previewPeople: previewPeople.saves,
        totalCount: metrics?.profile_saves ?? 0,
        signalKey: 'saves' as const,
      },
      {
        key: 'full',
        icon: 'book-open-page-variant-outline' as const,
        accent: '#35D2E2',
        value: metrics?.full_opens ?? 0,
        lead: `${metrics?.full_opens === 1 ? 'person opened' : 'people opened'}`,
        tail: 'your full story',
        previewPeople: previewPeople.full,
        totalCount: metrics?.full_opens ?? 0,
        signalKey: 'full' as const,
      },
      {
        key: 'repeat',
        icon: 'repeat' as const,
        accent: '#7BE0FF',
        value: metrics?.repeat_visits ?? 0,
        lead: `${metrics?.repeat_visits === 1 ? 'person revisited' : 'people revisited'}`,
        tail: 'your profile',
        previewPeople: previewPeople.repeat,
        totalCount: metrics?.repeat_visits ?? 0,
        signalKey: 'repeat' as const,
      },
      {
        key: 'intent',
        icon: 'target' as const,
        accent: '#33D6A6',
        value: metrics?.intent_opens ?? 0,
        lead: `${metrics?.intent_opens === 1 ? 'person opened' : 'people opened'}`,
        tail: 'your Intent card',
        previewPeople: previewPeople.intent,
        totalCount: metrics?.intent_opens ?? 0,
        signalKey: 'intent' as const,
      },
    ],
    [
      metrics?.full_opens,
      metrics?.intent_opens,
      metrics?.intro_watches,
      metrics?.profile_saves,
      metrics?.profile_visits,
      metrics?.unique_visitors,
      metrics?.repeat_visits,
      previewPeople.full,
      previewPeople.intent,
      previewPeople.intro,
      previewPeople.repeat,
      previewPeople.saves,
      previewPeople.visits,
      theme.accent,
      theme.tint,
    ],
  );
  const strongSignalItems = useMemo(
    () => [
      {
        key: 'repeat',
        icon: 'target' as const,
        accent: theme.tint,
        text:
          (metrics?.repeat_visits ?? 0) > 0
            ? `${metrics?.repeat_visits} ${pluralize(metrics?.repeat_visits ?? 0, 'person revisited', 'people revisited')} your profile.`
            : 'Revisits will appear here.',
      },
      {
        key: 'intro',
        icon: 'play-outline' as const,
        accent: theme.accent,
        text:
          (metrics?.intro_watches ?? 0) > 0
            ? `${metrics?.intro_watches} ${pluralize(metrics?.intro_watches ?? 0, 'person watched', 'people watched')} your full intro.`
            : 'Full intro watches will appear here.',
      },
      {
        key: 'save',
        icon: 'bookmark-outline' as const,
        accent: '#D8B24D',
        text:
          (metrics?.profile_saves ?? 0) > 0
            ? `${metrics?.profile_saves} ${pluralize(metrics?.profile_saves ?? 0, 'person saved', 'people saved')} your profile.`
            : 'Profile saves will appear here.',
      },
      {
        key: 'full',
        icon: 'book-open-page-variant-outline' as const,
        accent: '#35D2E2',
        text:
          (metrics?.full_opens ?? 0) > 0
            ? `${metrics?.full_opens} ${pluralize(metrics?.full_opens ?? 0, 'person opened', 'people opened')} your full profile.`
            : 'Deeper opens will appear here.',
      },
    ],
    [metrics?.full_opens, metrics?.intro_watches, metrics?.profile_saves, metrics?.repeat_visits, theme.accent, theme.tint],
  );

  const openProfile = (profileId: string) => {
    router.push({ pathname: '/profile-view', params: { profileId } });
  };

  useEffect(() => {
    if (plan === 'FREE') return;
    const firstNonEmptySignal = (['visits', 'intro', 'saves', 'full', 'repeat', 'intent'] as SignalKey[]).find(
      (key) => (peopleBySignal[key]?.length ?? 0) > 0,
    );
    if (firstNonEmptySignal && activeSignalPeople.length === 0) {
      setActiveSignalKey(firstNonEmptySignal);
    }
  }, [activeSignalPeople.length, peopleBySignal, plan]);

  const openInterestUpsell = useCallback(() => {
    showBetweenerAlert({
      tone: 'info',
      icon: 'shield-crown-outline',
      title: 'Unlock Profile Interest',
      message: 'Silver reveals who is behind these signals and the kind of attention they gave your profile.',
      buttons: [
        { text: 'Maybe later', style: 'cancel' },
        {
          text: 'View plans',
          style: 'primary',
          onPress: () => router.push('/premium-plans'),
        },
      ],
    });
  }, []);

  const renderPerson = (person: ProfileInterestPerson) => {
    const details = [
      person.visit_count > 0 ? `${person.visit_count} ${pluralize(person.visit_count, 'visit')}` : null,
      person.repeat_visit_count > 0 ? `${person.repeat_visit_count} ${pluralize(person.repeat_visit_count, 'revisit')}` : null,
      person.full_open_count > 0 ? `${person.full_open_count} full ${pluralize(person.full_open_count, 'open')}` : null,
      person.intro_watch_count > 0 ? `${person.intro_watch_count} intro ${pluralize(person.intro_watch_count, 'watch')}` : null,
      person.profile_save_count > 0 ? 'Saved profile' : null,
      person.intent_open_count > 0 ? `${person.intent_open_count} Intent ${pluralize(person.intent_open_count, 'open')}` : null,
    ].filter(Boolean);

    return (
      <Pressable
        key={person.profile_id}
        onPress={() => openProfile(person.profile_id)}
        style={[styles.personRow, { borderBottomColor: theme.outline }]}
      >
        <PersonAvatar person={person} />
        <View style={styles.personCopy}>
          <View style={styles.personTitleRow}>
            <Text style={[styles.personName, { color: theme.text }]} numberOfLines={1}>
              {person.name}
            </Text>
            {plan === 'GOLD' ? (
              <View style={styles.scorePill}>
                <Text style={styles.scorePillText}>{person.interest_level}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.personSignal, { color: theme.textMuted }]} numberOfLines={2}>
            {details.join(' - ')}
          </Text>
          {plan === 'GOLD' && person.shared_values?.length ? (
            <Text style={[styles.sharedValues, { color: theme.secondary }]} numberOfLines={1}>
              Shared values: {person.shared_values.join(', ')}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.personDate, { color: theme.textMuted }]}>{formatTime(person.last_signal_at)}</Text>
      </Pressable>
    );
  };

  const renderTimeline = (item: ProfileInterestTimelineItem) => {
    const meta = timelineSignalMeta(item.signal);
    const avatarInitial = item.name.trim().charAt(0).toUpperCase() || '?';
    return (
      <Pressable
        key={item.id}
        onPress={() => openProfile(item.profile_id)}
        style={[styles.timelineRow, { borderBottomColor: theme.outline }]}
      >
        <View style={styles.timelineAvatarWrap}>
          {item.avatar_url ? (
            <OfflineImage uri={item.avatar_url} style={styles.timelineAvatar} />
          ) : (
            <View style={[styles.timelineAvatarFallback, { backgroundColor: `${meta.accent}22` }]}>
              <Text style={[styles.timelineAvatarInitial, { color: meta.accent }]}>{avatarInitial}</Text>
            </View>
          )}
          <View
            style={[
              styles.timelineSignalBadge,
              {
                backgroundColor: isDark ? `${meta.accent}22` : `${meta.accent}18`,
                borderColor: isDark ? 'rgba(8, 16, 24, 0.9)' : '#F8F6FF',
              },
            ]}
          >
            <MaterialCommunityIcons name={meta.icon as any} size={12} color={meta.accent} />
          </View>
        </View>
        <View style={styles.timelineCopy}>
          <View style={styles.timelineTopRow}>
            <Text style={[styles.timelineEyebrow, { color: meta.accent }]} numberOfLines={1}>
              {meta.eyebrow}
            </Text>
            <View
              style={[
                styles.timelineDatePill,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
                  borderColor: theme.outline,
                },
              ]}
            >
              <Text style={[styles.timelineDate, { color: theme.textMuted }]}>{formatTime(item.occurred_at)}</Text>
            </View>
          </View>
          <Text style={[styles.timelineHeadline, { color: theme.text }]} numberOfLines={1}>
            <Text style={styles.timelineName}>{item.name}</Text> {meta.title}
          </Text>
          <Text style={[styles.timelineBody, { color: theme.textMuted }]} numberOfLines={2}>
            {meta.body}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.outline }]}>
        <Pressable
          onPress={() => router.replace(params.from === 'profile-insights' ? '/profile-insights' : '/(tabs)/profile')}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile Interest</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
            See how people engage with your profile.
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.tint} />
          }
        >
          <LinearGradient
            colors={heroGradientColors}
            style={[styles.hero, { borderColor: surfaceOutline }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heroSparkField} pointerEvents="none">
              <View style={[styles.heroOrbA, !isDark ? styles.heroOrbALight : null]} />
              <View style={[styles.heroOrbB, !isDark ? styles.heroOrbBLight : null]} />
              <View style={[styles.heroOrbC, !isDark ? styles.heroOrbCLight : null]} />
              <LinearGradientSafe
                colors={
                  isDark
                    ? ['rgba(33, 209, 228, 0.18)', 'rgba(33, 209, 228, 0)']
                    : ['rgba(33, 209, 228, 0.12)', 'rgba(33, 209, 228, 0)']
                }
                start={[0, 0.5]}
                end={[1, 0.5]}
                style={styles.heroBeam}
              />
              <LinearGradientSafe
                colors={
                  isDark
                    ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']
                    : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']
                }
                start={[0, 0]}
                end={[0, 1]}
                style={styles.heroSheen}
              />
              <View style={[styles.heroSpark, styles.heroSparkA]} />
              <View style={[styles.heroSpark, styles.heroSparkB]} />
              <View style={[styles.heroSpark, styles.heroSparkC]} />
              <View style={[styles.heroSpark, styles.heroSparkD]} />
              <View style={[styles.heroSpark, styles.heroSparkE]} />
            </View>

            <View style={styles.heroTopRow}>
              <View style={[styles.heroIcon, compactHero ? styles.heroIconCompact : null]}>
                <MaterialCommunityIcons name="heart-outline" size={24} color="#EAFDFC" />
              </View>
              <View
                style={[
                  styles.heroPill,
                  compactHero ? styles.heroPillCompact : null,
                  { borderColor: `${theme.secondary}30`, backgroundColor: `${theme.secondary}15` },
                ]}
              >
                <MaterialCommunityIcons name="shield-lock-outline" size={13} color={theme.secondary} />
                <Text style={[styles.heroPillText, { color: theme.secondary }]}>PRIVATE BY DEFAULT</Text>
              </View>
            </View>

            <View style={styles.heroMainRow}>
              <View style={styles.heroLeft}>
                <Text style={[styles.heroEyebrow, { color: theme.secondary }]}>THIS WEEK</Text>
                <Text style={[styles.heroTitle, compactHero ? styles.heroTitleCompact : null, { color: theme.text }]}>
                  Meaningful signals, without the surveillance.
                </Text>
                <Text style={[styles.heroBody, compactHero ? styles.heroBodyCompact : null, { color: surfaceMutedText }]}>
                  People are slowing down and genuinely getting to know you.
                </Text>

                <View style={[styles.heroPreviewRow, compactHero ? styles.heroPreviewRowCompact : null]}>
                  <InterestAvatarRow
                    people={previewPeople.teaser}
                    totalCount={exploredPeopleCount}
                    variant="hero"
                    locked={plan === 'FREE'}
                    dense={compactHero}
                    onPersonPress={plan === 'FREE' ? undefined : (person) => openProfile(person.profile_id)}
                    onPress={plan === 'FREE' ? openInterestUpsell : undefined}
                  />
                </View>

                <View style={[styles.heroCountRow, compactHero ? styles.heroCountRowCompact : null]}>
                  <Text style={[styles.heroCountValue, compactHero ? styles.heroCountValueCompact : null, { color: theme.tint }]}>
                    {exploredPeopleCount}
                  </Text>
                  <Text style={[styles.heroCountLabel, compactHero ? styles.heroCountLabelCompact : null, { color: theme.text }]}>
                    {' '}
                    {exploredPeopleCount === 1 ? 'person explored your profile' : 'people explored your profile'}
                  </Text>
                </View>
              </View>
            </View>

            {plan === 'FREE' ? (
              <>
                <Pressable onPress={openInterestUpsell} style={[styles.heroCtaWrap, compactHero ? styles.heroCtaWrapCompact : null]}>
                  <LinearGradient
                    colors={heroCtaColors}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.heroCta, compactHero ? styles.heroCtaCompact : null]}
                  >
                    <MaterialCommunityIcons name="diamond-stone" size={20} color="#FFFFFF" />
                    <Text style={[styles.heroCtaText, compactHero ? styles.heroCtaTextCompact : null]}>Unlock Profile Interest</Text>
                  </LinearGradient>
                </Pressable>
                <View style={[styles.heroFootnote, compactHero ? styles.heroFootnoteCompact : null]}>
                  <MaterialCommunityIcons name="lock-outline" size={13} color={softMutedText} />
                  <Text style={[styles.heroFootnoteText, compactHero ? styles.heroFootnoteTextCompact : null, { color: softMutedText }]}>
                    Upgrade to Silver to see who&apos;s behind these signals.
                  </Text>
                </View>
              </>
            ) : null}
          </LinearGradient>

          {error ? (
            <Pressable onPress={() => void load()} style={[styles.errorCard, { borderColor: theme.danger }]}>
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              <Text style={[styles.retryText, { color: theme.textMuted }]}>Tap to retry</Text>
            </Pressable>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Engagement</Text>
            <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>Last 7 days</Text>
          </View>
          <View style={styles.metricsGrid}>
            {engagementCards.map((card) => (
              <InterestMetricCard
                key={card.key}
                icon={card.icon}
                accent={card.accent}
                value={card.value}
                lead={card.lead}
                tail={card.tail}
                previewPeople={card.previewPeople}
                totalCount={card.totalCount}
                onPreviewPress={plan === 'FREE' ? openInterestUpsell : () => setActiveSignalKey(card.signalKey)}
                onPersonPress={plan === 'FREE' ? undefined : (person) => openProfile(person.profile_id)}
                onPress={plan === 'FREE' ? openInterestUpsell : () => setActiveSignalKey(card.signalKey)}
                selected={plan !== 'FREE' && activeSignalKey === card.signalKey}
                theme={theme}
                isDark={isDark}
                compact={compactMetrics}
                lockedPreview={plan === 'FREE'}
              />
            ))}
          </View>

          {plan !== 'FREE' ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{signalPanelMeta[activeSignalKey].title}</Text>
                <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>
                  {activeSignalPeople.length} {pluralize(activeSignalPeople.length, 'profile')}
                </Text>
              </View>
              <View style={[styles.listSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={[styles.signalPanelIntro, { borderBottomColor: theme.outline }]}>
                  <Text style={[styles.signalPanelIntroText, { color: surfaceMutedText }]}>
                    {signalPanelMeta[activeSignalKey].subtitle}
                  </Text>
                </View>
                {activeSignalPeople.length > 0 ? (
                  activeSignalPeople.map((person) => renderPerson(person))
                ) : (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="account-search-outline" size={26} color={theme.tint} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No profiles in this signal yet</Text>
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      As people engage more deeply, they will appear here.
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {plan !== 'FREE' && featuredStory && shouldShowSignalStory ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Signal Story</Text>
                <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>{plan === 'GOLD' ? 'Gold detail' : 'Silver detail'}</Text>
              </View>
              <ProfileInterestStoryCard
                name={featuredStory.person.name}
                avatarUrl={featuredStory.person.avatar_url}
                title={featuredStory.story.title}
                body={featuredStory.story.body}
                chips={featuredStory.story.chips}
                accentLabel={featuredStory.story.accentLabel}
                eyebrow={storySignalMeta[activeSignalKey].eyebrow}
                signalTone={storySignalMeta[activeSignalKey].tone}
                onPress={() => openProfile(featuredStory.person.profile_id)}
                theme={theme}
                isDark={isDark}
              />
            </>
          ) : null}

          {plan === 'FREE' ? (
            <>
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(15, 27, 33, 0.98)', 'rgba(10, 18, 24, 0.96)']
                    : ['rgba(248, 252, 253, 0.98)', 'rgba(239, 245, 247, 0.96)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.strongSignalsCard, { backgroundColor: theme.backgroundSubtle, borderColor: surfaceOutline }]}
              >
                <View style={styles.strongSignalsAura} />
                <View style={styles.strongSignalsHeader}>
                  <Text style={[styles.strongSignalsTitle, { color: theme.text }]}>Strong signals</Text>
                  <MaterialCommunityIcons name="pulse" size={18} color={theme.accent} />
                </View>
                <View style={[styles.strongSignalsGrid, wrapStrongSignals ? styles.strongSignalsGridWrapped : null]}>
                  {strongSignalItems.map((item, index) => (
                    <View
                      key={item.key}
                      style={[
                        styles.strongSignalItem,
                        !wrapStrongSignals && index < strongSignalItems.length - 1 ? styles.strongSignalDivider : null,
                        wrapStrongSignals ? styles.strongSignalItemWrapped : null,
                        wrapStrongSignals && index % 2 === 0 ? styles.strongSignalItemWrappedLeft : null,
                        { borderRightColor: theme.outline },
                      ]}
                      >
                        <View style={[styles.strongSignalIconWrap, { backgroundColor: `${item.accent}18` }]}>
                          <MaterialCommunityIcons name={item.icon} size={18} color={item.accent} />
                        </View>
                      <Text style={[styles.strongSignalText, { color: surfaceMutedText }]}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>

              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(15, 28, 35, 0.98)', 'rgba(10, 19, 26, 0.96)']
                    : ['rgba(249, 252, 253, 0.98)', 'rgba(240, 246, 249, 0.97)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.bottomUpsellCard,
                  stackUpsell ? styles.bottomUpsellCardStacked : null,
                  { backgroundColor: theme.backgroundSubtle, borderColor: surfaceOutline },
                ]}
              >
                <View style={styles.bottomUpsellAura} />
                <LinearGradientSafe
                  colors={bottomUpsellIconColors}
                  start={[0, 0]}
                  end={[1, 1]}
                  style={[styles.bottomUpsellIcon, !isDark ? styles.bottomUpsellIconLight : null]}
                >
                  <MaterialCommunityIcons
                    name="diamond-stone"
                    size={28}
                    color="#FFFFFF"
                    style={!isDark ? styles.bottomUpsellGlyphLight : null}
                  />
                </LinearGradientSafe>
                <View style={[styles.bottomUpsellCopy, stackUpsell ? styles.bottomUpsellCopyStacked : null]}>
                  <Text style={[styles.bottomUpsellTitle, { color: theme.text }]}>See who&apos;s interested in you</Text>
                  <Text style={[styles.bottomUpsellBody, { color: surfaceMutedText }]}>
                    Unlock names, activity, and what they engaged with.
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push('/premium-plans')}
                  style={[styles.bottomUpsellActionWrap, stackUpsell ? styles.bottomUpsellActionWrapStacked : null]}
                >
                  <LinearGradient
                    colors={bottomUpsellActionColors}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[
                      styles.bottomUpsellAction,
                      !isDark ? styles.bottomUpsellActionLight : null,
                      stackUpsell ? styles.bottomUpsellActionStacked : null,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="diamond-stone"
                      size={15}
                      color="#FFFFFF"
                      style={!isDark ? styles.bottomUpsellActionGlyphLight : null}
                    />
                    <Text style={styles.bottomUpsellActionText}>Upgrade to Silver</Text>
                  </LinearGradient>
                </Pressable>
              </LinearGradient>
            </>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Strong Signals</Text>
                <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>
                  {showStrongSignalHighlights ? `Top ${strongSignalHighlights.length}` : 'Warming up'}
                </Text>
              </View>
              <View style={[styles.listSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                {showStrongSignalHighlights ? (
                  <>
                    <View style={[styles.signalPanelIntro, { borderBottomColor: theme.outline }]}>
                      <Text style={[styles.signalPanelIntroText, { color: surfaceMutedText }]}>
                        High-signal moments ranked for depth and recency.
                      </Text>
                    </View>
                    <View style={[styles.strongSignalHighlightsGrid, stackStrongSignalCards ? styles.strongSignalHighlightsGridStacked : null]}>
                      {strongSignalHighlights.map((item) => (
                        <StrongSignalHighlightCard
                          key={item.key}
                          item={item}
                          theme={theme}
                          isDark={isDark}
                          compact={stackStrongSignalCards}
                          stacked={stackStrongSignalCards}
                          onPress={() => {
                            setActiveSignalKey(item.signalKey);
                            openProfile(item.profileId);
                          }}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                {(summary?.people ?? []).length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="account-search-outline" size={26} color={theme.tint} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>Signals are still warming up</Text>
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      Thoughtful visits, saves, and intro watches will appear here.
                    </Text>
                  </View>
                ) : !showStrongSignalHighlights ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="star-four-points-outline" size={26} color={theme.tint} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>Strong signals are still forming</Text>
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      This section appears once deeper signals start standing out across visits, saves, intros, full opens, or Intent activity.
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          )}

          {plan === 'GOLD' && (summary?.timeline.length ?? 0) > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Interest Timeline</Text>
                <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>Gold · 30 days</Text>
              </View>
              <View style={[styles.listSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={[styles.signalPanelIntro, { borderBottomColor: theme.outline }]}>
                  <Text style={[styles.signalPanelIntroText, { color: surfaceMutedText }]}>
                    Recent signal moments, weighted by depth and recency.
                  </Text>
                </View>
                {summary?.timeline.map(renderTimeline)}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
  headerSubtitle: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 11 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 40 },

  previewTouch: { alignSelf: 'flex-start' },
  previewTouchPressed: { opacity: 0.9 },
  previewStack: { position: 'relative' },
  previewAvatarFrame: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 5,
  },
  previewAvatarFrameHero: {
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 7,
  },
  previewAvatarImage: { width: '100%', height: '100%' },
  previewAvatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#13222A',
  },
  previewAvatarScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 18, 24, 0.16)',
  },
  previewAvatarScrimAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 18, 24, 0.09)',
  },
  previewLockTail: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCountPill: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(48, 58, 68, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCountText: {
    color: '#EAFDFC',
    fontFamily: 'Archivo_700Bold',
  },

  hero: {
    borderWidth: 1,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    overflow: 'hidden',
    backgroundColor: '#08131A',
  },
  heroSparkField: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOrbA: {
    position: 'absolute',
    top: -58,
    right: -44,
    width: 214,
    height: 214,
    borderRadius: 107,
    backgroundColor: 'rgba(34, 221, 228, 0.055)',
  },
  heroOrbALight: {
    backgroundColor: 'rgba(52, 219, 229, 0.05)',
  },
  heroOrbB: {
    position: 'absolute',
    bottom: -104,
    left: -58,
    width: 242,
    height: 242,
    borderRadius: 121,
    backgroundColor: 'rgba(126, 116, 255, 0.072)',
  },
  heroOrbBLight: {
    backgroundColor: 'rgba(149, 124, 255, 0.045)',
  },
  heroOrbC: {
    position: 'absolute',
    top: 146,
    right: 36,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(18, 39, 48, 0.24)',
  },
  heroOrbCLight: {
    backgroundColor: 'rgba(168, 179, 196, 0.18)',
  },
  heroBeam: {
    position: 'absolute',
    top: 96,
    left: -10,
    right: 70,
    height: 1,
    opacity: 0.75,
  },
  heroSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  heroSpark: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4EE9FF',
    shadowColor: '#4EE9FF',
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 4,
  },
  heroSparkA: { top: 122, right: 156 },
  heroSparkB: { top: 176, right: 46 },
  heroSparkC: { bottom: 148, right: 132, backgroundColor: '#9D73FF' },
  heroSparkD: { bottom: 92, right: 24, backgroundColor: '#9D73FF' },
  heroSparkE: { bottom: 134, left: 52, backgroundColor: '#2FE8D1' },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(17, 192, 205, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(54, 229, 236, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroPillText: { fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.3 },
  heroMainRow: {
    marginTop: 24,
    flexDirection: 'column',
  },
  heroLeft: { width: '100%' },
  heroEyebrow: { fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 2 },
  heroTitle: { marginTop: 12, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 34, lineHeight: 44, maxWidth: 330 },
  heroTitleCompact: { marginTop: 10, fontSize: 28, lineHeight: 37, maxWidth: 268 },
  heroBody: { marginTop: 14, fontFamily: 'Manrope_500Medium', fontSize: 16, lineHeight: 28, maxWidth: 314 },
  heroBodyCompact: { marginTop: 12, fontSize: 14, lineHeight: 24, maxWidth: 258 },
  heroPreviewRow: { marginTop: 22 },
  heroPreviewRowCompact: { marginTop: 18 },
  heroCountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  heroCountRowCompact: { marginTop: 14, flexWrap: 'wrap' },
  heroCountValue: { fontFamily: 'Archivo_700Bold', fontSize: 42, lineHeight: 42 },
  heroCountValueCompact: { fontSize: 34, lineHeight: 34 },
  heroCountLabel: { fontFamily: 'Manrope_500Medium', fontSize: 17, lineHeight: 24 },
  heroCountLabelCompact: { fontSize: 14, lineHeight: 20 },
  heroCtaWrap: { marginTop: 20, width: '100%' },
  heroCtaWrapCompact: { marginTop: 16 },
  heroCta: {
    width: '100%',
    minHeight: 62,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#54D8FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    elevation: 10,
  },
  heroCtaCompact: { minHeight: 56, paddingHorizontal: 16 },
  heroCtaText: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 16, letterSpacing: 0.2 },
  heroCtaTextCompact: { fontSize: 14 },
  heroFootnote: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroFootnoteCompact: { marginTop: 10, gap: 6, paddingHorizontal: 10 },
  heroFootnoteText: { fontFamily: 'Manrope_500Medium', fontSize: 13 },
  heroFootnoteTextCompact: { fontSize: 12, textAlign: 'center', flexShrink: 1 },
  heroIconCompact: { width: 52, height: 52, borderRadius: 16 },
  heroPillCompact: { paddingHorizontal: 12, paddingVertical: 9, gap: 6 },

  errorCard: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 14 },
  errorText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  retryText: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 11 },

  sectionHeader: {
    marginTop: 30,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 21 },
  sectionMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '100%',
    minHeight: 198,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  metricCardPressable: { width: '48%' },
  metricCardPressed: { opacity: 0.96 },
  metricCardSelected: {
    shadowColor: '#38DDE5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
  metricCardCompact: {
    minHeight: 182,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 14,
  },
  metricTopRow: { gap: 12 },
  metricIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconWrapCompact: { width: 46, height: 46, borderRadius: 23 },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  metricValueRowCompact: { gap: 12 },
  metricValue: { fontFamily: 'Archivo_700Bold', fontSize: 34, lineHeight: 36 },
  metricValueCompact: { fontSize: 30, lineHeight: 32 },
  metricCopyBlock: { paddingTop: 2, minHeight: 46 },
  metricLead: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20 },
  metricLeadCompact: { fontSize: 13, lineHeight: 18 },
  metricTail: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20 },
  metricTailCompact: { fontSize: 13, lineHeight: 18 },
  metricPreviewRow: { marginTop: 'auto', paddingTop: 18 },
  metricEmptySpacer: { flex: 1 },
  metricCardAura: {
    position: 'absolute',
    top: -16,
    right: -12,
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  metricCardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 74,
  },

  strongSignalsCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  strongSignalsAura: {
    position: 'absolute',
    top: -30,
    right: -18,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(138, 107, 255, 0.06)',
  },
  strongSignalsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  strongSignalsTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 19 },
  strongSignalsGrid: { flexDirection: 'row' },
  strongSignalsGridWrapped: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  strongSignalItem: { flex: 1, minHeight: 116, paddingHorizontal: 10 },
  strongSignalItemWrapped: { width: '50%', flexBasis: '50%', minHeight: 104, paddingHorizontal: 6 },
  strongSignalItemWrappedLeft: { paddingRight: 10 },
  strongSignalDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  strongSignalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  strongSignalText: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 22 },
  strongSignalHighlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 14,
  },
  strongSignalHighlightsGridStacked: {
    gap: 10,
  },
  strongSignalCardPressable: {
    width: '48%',
  },
  strongSignalCardPressableStacked: {
    width: '100%',
  },
  strongSignalCard: {
    minHeight: 164,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
    overflow: 'hidden',
  },
  strongSignalCardCompact: {
    minHeight: 148,
  },
  strongSignalCardAura: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  strongSignalCardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  strongSignalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  strongSignalCardBadge: {
    alignSelf: 'flex-start',
    maxWidth: '74%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  strongSignalCardBadgeText: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 9,
    letterSpacing: 0.9,
  },
  strongSignalCardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strongSignalCardTitle: {
    marginTop: 12,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  strongSignalCardBody: {
    marginTop: 7,
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
    lineHeight: 17,
  },
  strongSignalCardPersonPill: {
    marginTop: 'auto',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  strongSignalCardPersonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },

  bottomUpsellCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  bottomUpsellAura: {
    position: 'absolute',
    top: -36,
    right: -20,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(39, 216, 228, 0.055)',
  },
  bottomUpsellCardStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  bottomUpsellIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomUpsellIconLight: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#7B65F8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  bottomUpsellGlyphLight: {
    textShadowColor: 'rgba(31, 42, 112, 0.34)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  bottomUpsellCopy: { flex: 1, minWidth: 0 },
  bottomUpsellCopyStacked: { width: '100%' },
  bottomUpsellTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, lineHeight: 22 },
  bottomUpsellBody: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20 },
  bottomUpsellActionWrap: { marginLeft: 'auto' },
  bottomUpsellActionWrapStacked: { width: '100%', marginLeft: 0 },
  bottomUpsellAction: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4E86FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  bottomUpsellActionLight: {
    shadowColor: '#6D67FF',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  bottomUpsellActionGlyphLight: {
    textShadowColor: 'rgba(45, 55, 128, 0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  bottomUpsellActionStacked: { width: '100%' },
  bottomUpsellActionText: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },

  listSurface: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  signalPanelIntro: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  signalPanelIntroText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
  personRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0C7778',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 17 },
  personCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  personTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { flexShrink: 1, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  personSignal: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16 },
  sharedValues: { marginTop: 3, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  personDate: { marginLeft: 8, fontFamily: 'Manrope_500Medium', fontSize: 10 },
  scorePill: { borderRadius: 999, backgroundColor: 'rgba(139,92,255,0.14)', paddingHorizontal: 7, paddingVertical: 3 },
  scorePillText: { color: '#A991FF', fontFamily: 'Manrope_700Bold', fontSize: 9 },
  timelineRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timelineAvatarWrap: {
    width: 46,
    height: 46,
    marginRight: 12,
    justifyContent: 'center',
  },
  timelineAvatar: { width: 46, height: 46, borderRadius: 23 },
  timelineAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineAvatarInitial: { fontFamily: 'Archivo_700Bold', fontSize: 16 },
  timelineSignalBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  timelineCopy: { flex: 1, minWidth: 0 },
  timelineTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timelineEyebrow: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 10, letterSpacing: 1.1 },
  timelineDatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  timelineHeadline: { marginTop: 5, fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 20 },
  timelineBody: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  timelineName: { fontFamily: 'Manrope_700Bold' },
  timelineDate: { fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  emptyState: { padding: 28, alignItems: 'center' },
  emptyTitle: { marginTop: 12, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  emptyBody: { marginTop: 6, textAlign: 'center', fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
});
