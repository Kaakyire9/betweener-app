import { Colors } from '@/constants/theme';
import GiftArtwork from '@/components/gifts/GiftArtwork';
import GiftRevealSheet from '@/components/gifts/GiftRevealSheet';
import PremiumSyncNotice from '@/components/profile/PremiumSyncNotice';
import { markInboxItemsReadByCriteria } from '@/hooks/useInbox';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremiumOfflineQueueStatus } from '@/hooks/usePremiumOfflineQueueStatus';
import { logProfileGiftEvent } from '@/lib/gifts/events';
import { INSIGHTS_SYSTEM_ACTIVITY_KEYS } from '@/lib/inbox/badge-groups';
import { isLikelyNetworkError } from '@/lib/network';
import {
  enqueueProfileGiftArchiveMutation,
  enqueueProfileGiftRevealMutation,
} from '@/lib/offline/mutation-queue';
import {
  readProfileInsightsSnapshotState,
  updateProfileInsightsSnapshot,
  writeProfileInsightsSnapshot,
} from '@/lib/offline/profile-insights-store';
import { getSafeRemoteImageUri, getUserFacingDisplayName } from '@/lib/profile/display-name';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type InsightCardProps = {
  title: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: [string, string];
  onPress: () => void;
  footerLabel?: string;
};

type InsightGiftItem = {
  id: string;
  senderName: string;
  senderAvatar?: string | null;
  senderProfileId?: string | null;
  senderGender?: string | null;
  giftType: string;
  createdAt: string;
  openedAt?: string | null;
  revealedAt?: string | null;
  archivedAt?: string | null;
};

type SentGiftItem = {
  id: string;
  recipientName: string;
  recipientAvatar?: string | null;
  recipientProfileId?: string | null;
  giftType: string;
  createdAt: string;
  revealedAt?: string | null;
  archivedAt?: string | null;
};

type GiftProfileRelation = {
  id?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
  account_state?: string | null;
  deleted_at?: string | null;
};

function InsightFeatureCard({ title, body, icon, accent, onPress, footerLabel = 'Open' }: InsightCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { width } = useWindowDimensions();
  const isCompactWidth = width <= 390;

  return (
    <Pressable onPress={onPress} style={[styles.featureCard, isCompactWidth ? styles.featureCardCompact : null, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
      <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.featureIconWrap, isCompactWidth ? styles.featureIconWrapCompact : null]}>
        <MaterialCommunityIcons name={icon} size={20} color="#F8FFFF" />
      </LinearGradient>
      <Text style={[styles.featureTitle, isCompactWidth ? styles.featureTitleCompact : null, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.featureBody, isCompactWidth ? styles.featureBodyCompact : null, { color: theme.textMuted }]}>{body}</Text>
      <View style={styles.featureFooter}>
        <Text style={[styles.featureLink, { color: theme.tint }]}>{footerLabel}</Text>
        <MaterialCommunityIcons name="arrow-right" size={16} color={theme.tint} />
      </View>
    </Pressable>
  );
}

function GiftEmptyPlaceholder({
  title,
  body,
  icon,
  theme,
  isDark,
  eyebrow = 'Premium archive',
  actionLabel = 'Waiting for gifts',
}: {
  title: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  theme: typeof Colors.light;
  isDark: boolean;
  eyebrow?: string;
  actionLabel?: string;
}) {
  return (
    <View
      style={[
        styles.giftArchivePlaceholder,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background,
          borderColor: theme.outline,
        },
      ]}
    >
      <View
        style={[
          styles.giftArchivePlaceholderIcon,
          {
            backgroundColor: isDark ? 'rgba(46,214,194,0.12)' : `${theme.tint}14`,
            borderColor: theme.outline,
          },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={18} color={theme.tint} />
      </View>
      <View style={styles.giftArchivePlaceholderCopy}>
        <Text style={[styles.giftArchivePlaceholderEyebrow, { color: theme.tint }]}>{eyebrow}</Text>
        <Text style={[styles.giftArchivePlaceholderTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.giftArchivePlaceholderBody, { color: theme.textMuted }]}>{body}</Text>
        <View
          style={[
            styles.giftArchivePlaceholderAction,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : theme.background,
              borderColor: theme.outline,
            },
          ]}
        >
          <MaterialCommunityIcons name="star-four-points-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.giftArchivePlaceholderActionText, { color: theme.textMuted }]}>
            {actionLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function GiftActionPill({
  label,
  giftType,
  icon,
  onPress,
  theme,
  isCompactWidth,
  isDark,
  disabled = false,
}: {
  label: string;
  giftType?: string | null;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: (() => void) | null;
  theme: typeof Colors.light;
  isCompactWidth: boolean;
  isDark: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      {giftType ? (
        <GiftArtwork giftType={giftType} size={isCompactWidth ? 28 : 34} animate={false} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={isCompactWidth ? 14 : 15} color={disabled ? theme.textMuted : theme.text} />
      ) : null}
      <Text
        style={[
          styles.giftArchiveRevealText,
          isCompactWidth ? styles.giftArchiveRevealTextCompact : null,
          { color: disabled ? theme.textMuted : theme.text },
        ]}
      >
        {label}
      </Text>
    </>
  );

  const pillStyle = [
    styles.giftArchiveRevealPill,
    isCompactWidth ? styles.giftArchiveRevealPillCompact : null,
    {
      borderColor: theme.outline,
      backgroundColor: disabled
        ? isDark
          ? 'rgba(255,255,255,0.035)'
          : 'rgba(255,255,255,0.72)'
        : 'transparent',
      opacity: disabled ? 0.82 : 1,
    },
  ];

  if (disabled || !onPress) {
    return <View style={pillStyle}>{content}</View>;
  }

  return (
    <Pressable onPress={onPress} style={pillStyle}>
      {content}
    </Pressable>
  );
}

const formatGiftArchiveDate = (value?: string | null) => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const getGiftProfileRelation = (value: unknown): GiftProfileRelation | null => {
  if (Array.isArray(value)) return (value[0] as GiftProfileRelation | undefined) ?? null;
  return (value as GiftProfileRelation | null) ?? null;
};

const isGiftSnapshotPlaceholder = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.length === 0 || normalized === 'someone';
};

const normalizeGiftType = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
};

const resolveGiftSenderName = (
  snapshotName: string | null | undefined,
  senderProfile: GiftProfileRelation | null | undefined,
  fallback: string,
) => {
  if (!isGiftSnapshotPlaceholder(snapshotName)) return String(snapshotName).trim();
  return getUserFacingDisplayName(senderProfile, fallback);
};

const formatSentGiftStatus = (gift: SentGiftItem) => {
  if (gift.archivedAt) return `Archived ${formatGiftArchiveDate(gift.archivedAt)}`;
  if (gift.revealedAt) return `Opened ${formatGiftArchiveDate(gift.revealedAt)}`;
  return 'Awaiting reveal';
};

export default function ProfileInsightsScreen() {
  const params = useLocalSearchParams<{ giftId?: string | string[] }>();
  const { width } = useWindowDimensions();
  const isCompactWidth = width <= 390;
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const { profile, user } = useAuth();
  const premiumQueue = usePremiumOfflineQueueStatus();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const giftArchiveYRef = useRef(0);
  const [giftSummary, setGiftSummary] = useState<{
    count: number;
    waitingCount: number;
    latestSender: string;
    latestGiftType?: string | null;
  }>({
    count: 0,
    waitingCount: 0,
    latestSender: 'Gift Signals',
    latestGiftType: null,
  });
  const [giftArchive, setGiftArchive] = useState<InsightGiftItem[]>([]);
  const [sentGiftArchive, setSentGiftArchive] = useState<SentGiftItem[]>([]);
  const [selectedGift, setSelectedGift] = useState<InsightGiftItem | null>(null);
  const handledGiftRouteRef = useRef<string | null>(null);

  const waitingGifts = useMemo(
    () => giftArchive.filter((gift) => !gift.revealedAt && !gift.archivedAt),
    [giftArchive],
  );
  const revealedGifts = useMemo(
    () => giftArchive.filter((gift) => Boolean(gift.revealedAt) && !gift.archivedAt),
    [giftArchive],
  );
  const archivedGifts = useMemo(
    () => giftArchive.filter((gift) => Boolean(gift.archivedAt)),
    [giftArchive],
  );
  const pendingSentGifts = useMemo(
    () => sentGiftArchive.filter((gift) => !gift.revealedAt && !gift.archivedAt),
    [sentGiftArchive],
  );
  const openedSentGifts = useMemo(
    () => sentGiftArchive.filter((gift) => Boolean(gift.revealedAt) && !gift.archivedAt),
    [sentGiftArchive],
  );
  const archivedSentGifts = useMemo(
    () => sentGiftArchive.filter((gift) => Boolean(gift.archivedAt)),
    [sentGiftArchive],
  );
  const routeGiftId = useMemo(() => {
    const value = params.giftId;
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }, [params.giftId]);
  const waitingGiftCount = waitingGifts.length;
  const focusGiftArchive = useCallback(() => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, giftArchiveYRef.current - 12),
        animated: true,
      });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      void markInboxItemsReadByCriteria(user.id, {
        types: ['GIFT_RECEIVED'],
        systemActivityKeys: [...INSIGHTS_SYSTEM_ACTIVITY_KEYS],
      });
    }, [user?.id]),
  );

  const applyGiftSnapshot = useCallback(
    async (
      nextArchive: InsightGiftItem[],
      options?: {
        nextSentGiftArchive?: SentGiftItem[];
        nextSummary?: {
          count: number;
          waitingCount: number;
          latestSender: string;
          latestGiftType?: string | null;
        };
      },
    ) => {
      const nextSummary = options?.nextSummary ?? {
        ...giftSummary,
        waitingCount: nextArchive.filter((row) => !row.revealedAt && !row.archivedAt).length,
      };
      const nextSentGiftArchive = options?.nextSentGiftArchive ?? sentGiftArchive;

      setGiftArchive(nextArchive);
      setGiftSummary(nextSummary);
      if (options?.nextSentGiftArchive) {
        setSentGiftArchive(nextSentGiftArchive);
      }

      if (profile?.id) {
        await updateProfileInsightsSnapshot(profile.id, (current) => ({
          giftSummary: nextSummary,
          giftArchive: nextArchive,
          sentGiftArchive: nextSentGiftArchive ?? current?.sentGiftArchive ?? [],
        }));
      }

      return { nextSummary, nextSentGiftArchive };
    },
    [giftSummary, profile?.id, sentGiftArchive],
  );

  const archiveGift = useCallback(async (gift: InsightGiftItem) => {
    const archivedAt = new Date().toISOString();
    const previousArchive = giftArchive;
    const previousSummary = giftSummary;
    const optimisticArchive = giftArchive.map((row) =>
      row.id === gift.id
        ? {
            ...row,
            archivedAt: row.archivedAt ?? archivedAt,
          }
        : row,
    );

    await applyGiftSnapshot(optimisticArchive);

    const { data, error } = await supabase.rpc('rpc_archive_profile_gift' as any, {
      p_gift_id: gift.id,
    });

    if (error) {
      if (isLikelyNetworkError(error)) {
        await enqueueProfileGiftArchiveMutation({ giftId: gift.id });
        return;
      }
      console.error('Error archiving insight gift:', error);
      await applyGiftSnapshot(previousArchive, { nextSummary: previousSummary });
      return;
    }

    const nextArchive = optimisticArchive.map((row) =>
        row.id === gift.id
          ? {
              ...row,
              openedAt:
                typeof (data as any)?.opened_at === 'string'
                  ? (data as any).opened_at
                  : row.openedAt,
              revealedAt:
                typeof (data as any)?.revealed_at === 'string'
                  ? (data as any).revealed_at
                  : row.revealedAt,
              archivedAt:
                typeof (data as any)?.archived_at === 'string'
                  ? (data as any).archived_at
                  : row.archivedAt,
            }
          : row,
      );
    await applyGiftSnapshot(nextArchive);
  }, [applyGiftSnapshot, giftArchive, giftSummary]);

  const openGiftReveal = useCallback(async (gift: InsightGiftItem) => {
    let nextGift = gift;
    let previousArchive: InsightGiftItem[] | null = null;
    let previousSummary: typeof giftSummary | null = null;

    if (!gift.revealedAt) {
      const revealedAt = new Date().toISOString();
      previousArchive = giftArchive;
      previousSummary = giftSummary;
      nextGift = {
        ...gift,
        openedAt: gift.openedAt ?? revealedAt,
        revealedAt: gift.revealedAt ?? revealedAt,
      };
      const optimisticArchive = giftArchive.map((row) => (row.id === nextGift.id ? nextGift : row));
      await applyGiftSnapshot(optimisticArchive);

      const { data, error } = await supabase.rpc('rpc_reveal_profile_gift' as any, {
        p_gift_id: gift.id,
      });

      if (error) {
        if (isLikelyNetworkError(error)) {
          await enqueueProfileGiftRevealMutation({ giftId: gift.id });
          setSelectedGift(nextGift);
          return;
        }
        console.error('Error revealing insight gift:', error);
        if (previousArchive && previousSummary) {
          await applyGiftSnapshot(previousArchive, { nextSummary: previousSummary });
        }
        return;
      }

      nextGift = {
        ...gift,
        openedAt:
          typeof (data as any)?.opened_at === 'string' ? (data as any).opened_at : gift.openedAt,
        revealedAt:
          typeof (data as any)?.revealed_at === 'string'
            ? (data as any).revealed_at
            : gift.revealedAt,
        archivedAt:
          typeof (data as any)?.archived_at === 'string'
            ? (data as any).archived_at
            : gift.archivedAt,
      };

      const nextArchive = optimisticArchive.map((row) => (row.id === nextGift.id ? nextGift : row));
      await applyGiftSnapshot(nextArchive);
    }

    setSelectedGift(nextGift);
  }, [applyGiftSnapshot, giftArchive, giftSummary]);

  const openGiftSenderProfile = useCallback(
    async (gift: InsightGiftItem) => {
      if (!gift.senderProfileId) return;
      void logProfileGiftEvent({
        giftId: gift.id,
        eventType: 'sender_profile_opened',
        metadata: { surface: 'profile_insights' },
      });
      setSelectedGift(null);
      router.push({ pathname: '/profile-view', params: { profileId: String(gift.senderProfileId) } });
    },
    [],
  );

  const openSentGiftRecipientProfile = useCallback(
    async (gift: SentGiftItem) => {
      if (!gift.recipientProfileId) return;
      void logProfileGiftEvent({
        giftId: gift.id,
        eventType: 'recipient_profile_opened',
        metadata: { surface: 'profile_insights_sent' },
      });
      router.push({ pathname: '/profile-view', params: { profileId: String(gift.recipientProfileId) } });
    },
    [],
  );

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const cached = await readProfileInsightsSnapshotState(profile.id);
      if (cancelled || !cached.data) return;
      setGiftSummary(cached.data.giftSummary);
      setGiftArchive(cached.data.giftArchive);
      setSentGiftArchive(cached.data.sentGiftArchive);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadGiftSummary = async () => {
      if (!profile?.id) {
        if (!cancelled) {
          setGiftSummary({ count: 0, waitingCount: 0, latestSender: 'Gift Signals', latestGiftType: null });
          setSentGiftArchive([]);
        }
        return;
      }

      const [receivedResult, sentResult] = await Promise.all([
        supabase
          .from('profile_gifts')
          .select(
            'id,sender_id,sender_profile_id,sender_display_name,sender_avatar_url,sender_gender,gift_type,created_at,opened_at,revealed_at,archived_at,sender_profile:profiles!profile_gifts_sender_profile_id_fkey(id,full_name,username,avatar_url,gender,account_state,deleted_at)',
            { count: 'exact' },
          )
          .eq('profile_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(16),
        user?.id
          ? supabase
              .from('profile_gifts')
              .select(
                'id,profile_id,gift_type,created_at,revealed_at,archived_at,recipient_profile:profiles!profile_gifts_profile_id_fkey(id,full_name,username,avatar_url,account_state,deleted_at)',
              )
              .eq('sender_id', user.id)
              .order('created_at', { ascending: false })
              .limit(16)
          : Promise.resolve({ data: [], error: null } as const),
      ]);

      const { data: gifts, count } = receivedResult;
      const { data: sentGifts, error: sentGiftsError } = sentResult;

      if (receivedResult.error) {
        if (!isLikelyNetworkError(receivedResult.error)) {
          console.warn('Error loading received gift archive:', receivedResult.error);
        }
        return;
      }
      if (sentGiftsError) {
        if (!isLikelyNetworkError(sentGiftsError)) {
          console.warn('Error loading sent gift archive:', sentGiftsError);
        }
        return;
      }

      if (cancelled) return;

      const unresolvedSenderIds = Array.from(
        new Set(
          ((gifts || []) as any[])
            .filter((row) => isGiftSnapshotPlaceholder(row.sender_display_name))
            .map((row) => String(row.sender_id || '').trim())
            .filter(Boolean),
        ),
      );

      let fallbackSenderProfilesByUserId = new Map<string, GiftProfileRelation>();
      if (unresolvedSenderIds.length > 0) {
        const { data: senderProfiles, error: senderProfilesError } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,username,avatar_url,gender,account_state,deleted_at')
          .in('user_id', unresolvedSenderIds);

        if (senderProfilesError) {
          console.error('Error hydrating fallback sender profiles:', senderProfilesError);
        } else {
          fallbackSenderProfilesByUserId = new Map(
            ((senderProfiles || []) as any[]).map((item) => [String(item.user_id), item as GiftProfileRelation]),
          );
        }
      }

      const normalizedReceived = ((gifts || []) as any[]).map((row) => {
        const senderProfile =
          getGiftProfileRelation(row.sender_profile) ??
          fallbackSenderProfilesByUserId.get(String(row.sender_id || '').trim()) ??
          null;
        const senderName = resolveGiftSenderName(
          row.sender_display_name,
          senderProfile,
          'A new admirer',
        );

        return {
          id: row.id,
          senderName,
          senderAvatar: getSafeRemoteImageUri(row.sender_avatar_url ?? senderProfile?.avatar_url ?? null),
          senderProfileId: row.sender_profile_id ?? senderProfile?.id ?? null,
          senderGender: row.sender_gender ?? senderProfile?.gender ?? null,
          giftType: normalizeGiftType(row.gift_type) ?? '',
          createdAt: row.created_at,
          openedAt: row.opened_at ?? null,
          revealedAt: row.revealed_at ?? null,
          archivedAt: row.archived_at ?? null,
        } satisfies InsightGiftItem;
      });

      const normalizedSent = ((sentGifts || []) as any[]).map((row) => {
        const recipientProfile = getGiftProfileRelation(row.recipient_profile);
        return {
          id: row.id,
          recipientName: getUserFacingDisplayName(recipientProfile, 'Betweener member'),
          recipientAvatar: getSafeRemoteImageUri(recipientProfile?.avatar_url ?? null),
          recipientProfileId: row.profile_id ?? recipientProfile?.id ?? null,
          giftType: normalizeGiftType(row.gift_type) ?? '',
          createdAt: row.created_at,
          revealedAt: row.revealed_at ?? null,
          archivedAt: row.archived_at ?? null,
        } satisfies SentGiftItem;
      });

      const latest = normalizedReceived[0] ?? null;
      if (!latest) {
        const nextSummary = { count: 0, waitingCount: 0, latestSender: 'Gift Signals', latestGiftType: null as string | null };
        setGiftSummary(nextSummary);
        setGiftArchive([]);
        setSentGiftArchive(normalizedSent);
        if (profile?.id) {
          await writeProfileInsightsSnapshot(profile.id, {
            giftSummary: nextSummary,
            giftArchive: [],
            sentGiftArchive: normalizedSent,
          });
        }
        return;
      }
      const waitingCount = normalizedReceived.filter((row) => !row.revealedAt).length;

      const nextSummary = {
        count: Math.max(1, Number(count) || 1),
        waitingCount,
        latestSender: latest.senderName,
        latestGiftType: latest.giftType,
      };
      setGiftSummary(nextSummary);
      setGiftArchive(normalizedReceived);
      setSentGiftArchive(normalizedSent);
      if (profile?.id) {
        await writeProfileInsightsSnapshot(profile.id, {
          giftSummary: nextSummary,
          giftArchive: normalizedReceived,
          sentGiftArchive: normalizedSent,
        });
      }
    };

    void loadGiftSummary();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, user?.id]);

  useEffect(() => {
    if (!routeGiftId || handledGiftRouteRef.current === routeGiftId) return;
    const targetGift = giftArchive.find((gift) => gift.id === routeGiftId);
    if (!targetGift) return;
    handledGiftRouteRef.current = routeGiftId;
    void openGiftReveal(targetGift);
  }, [giftArchive, openGiftReveal, routeGiftId]);

  const giftCardBody = useMemo(() => {
    if (!giftSummary.latestGiftType) {
      return 'Track premium gestures, memorable admirers, and the warmth arriving on your profile.';
    }
    const extra =
      waitingGiftCount > 1 ? ` ${waitingGiftCount - 1} more waiting.` : '';
    return waitingGiftCount > 0
      ? `${giftSummary.latestSender} sent warmth your way. Open the archive and reveal it properly.${extra}`
      : `${giftSummary.latestSender}'s gift is now part of your premium archive.`;
  }, [giftSummary.latestGiftType, giftSummary.latestSender, waitingGiftCount]);

  const secondaryItems = [
    {
      id: 'profile-strength',
      title: 'Profile Strength',
      body: 'Keep your profile complete and credible.',
      icon: 'shield-star-outline' as const,
      onPress: () => router.replace('/(tabs)/profile'),
    },
    {
      id: 'intent-signals',
      title: 'Intent Signals',
      body: 'Review thoughtful openings and requests.',
      icon: 'target' as const,
      onPress: () => router.push('/(tabs)/intent'),
    },
    {
      id: 'compatibility',
      title: 'Compatibility Insights',
      body: 'Refine the values shaping your recommendations.',
      icon: 'compass-rose' as const,
      onPress: () => router.push('/relationship-compass'),
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, isCompactWidth ? styles.headerCompact : null, { borderBottomColor: theme.outline }]}>
        <Pressable onPress={() => router.replace('/(tabs)/profile')} style={styles.headerButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, isCompactWidth ? styles.headerTitleCompact : null, { color: theme.text }]}>Profile Insights</Text>
          <Text style={[styles.headerSubtitle, isCompactWidth ? styles.headerSubtitleCompact : null, { color: theme.textMuted }]}>Meaningful signals around how your profile is landing.</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.content, isCompactWidth ? styles.contentCompact : null]}
      >
        {premiumQueue.visible ? (
          <PremiumSyncNotice
            theme={theme}
            isDark={isDark}
            title={premiumQueue.title}
            message={premiumQueue.message}
            failedCount={premiumQueue.failedCount}
            pendingCount={premiumQueue.pendingCount}
            onPress={() => {
              if (premiumQueue.hasFailed) {
                void premiumQueue.retryFailed();
                return;
              }
              router.push('/sync-activity');
            }}
          />
        ) : null}
        <LinearGradient
          colors={isDark ? ['#19243A', '#1D1538'] : ['#E4F4F1', '#EFE6FA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, isCompactWidth ? styles.heroCompact : null, { borderColor: theme.outline }]}
        >
          <Text style={[styles.heroEyebrow, { color: theme.secondary }]}>PREMIUM HUB</Text>
          <Text style={[styles.heroTitle, isCompactWidth ? styles.heroTitleCompact : null, { color: theme.text }]}>Your profile, understood</Text>
          <Text style={[styles.heroBody, isCompactWidth ? styles.heroBodyCompact : null, { color: theme.textMuted }]}>
            Open the parts of Betweener that turn profile activity into clear, relationship-focused signals.
          </Text>
        </LinearGradient>

        <View style={styles.featureGrid}>
          <InsightFeatureCard
            title="Gift Signals"
            body={giftCardBody}
            icon="gift-outline"
            accent={['#FB7185', '#7D7CF3']}
            footerLabel={giftSummary.count > 0 ? 'Open' : 'Preview'}
            onPress={() => {
              const nextGift = waitingGifts[0] ?? revealedGifts[0] ?? archivedGifts[0];
              if (nextGift) {
                void openGiftReveal(nextGift);
                return;
              }
              focusGiftArchive();
            }}
          />
          <InsightFeatureCard
            title="Profile Interest"
            body="See how people engage with your profile."
            icon="chart-timeline-variant-shimmer"
            accent={['#7D7CF3', '#2FB2BE']}
            onPress={() => router.push({ pathname: '/profile-interest', params: { from: 'profile-insights' } })}
          />
          <InsightFeatureCard
            title="Saved Profiles"
            body="Revisit the people you want to come back to."
            icon="book-heart-outline"
            accent={['#2FB2BE', '#0C6E7A']}
            onPress={() => router.push({ pathname: '/saved-profiles', params: { from: 'profile-insights' } })}
          />
        </View>

        <View
          onLayout={(event) => {
            giftArchiveYRef.current = event.nativeEvent.layout.y;
          }}
          style={[styles.giftArchiveCard, isCompactWidth ? styles.giftArchiveCardCompact : null, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
        >
          <View style={[styles.giftArchiveHeader, isCompactWidth ? styles.giftArchiveHeaderCompact : null]}>
            <View style={styles.giftArchiveHeaderCopy}>
              <Text style={[styles.giftArchiveEyebrow, { color: theme.tint }]}>Gift archive</Text>
              <Text style={[styles.giftArchiveTitle, isCompactWidth ? styles.giftArchiveTitleCompact : null, { color: theme.text }]}>Your premium gifts live here</Text>
            </View>
            <View style={[styles.giftArchiveCount, isCompactWidth ? styles.giftArchiveCountCompact : null, { backgroundColor: isDark ? 'rgba(46,214,194,0.12)' : `${theme.tint}14`, borderColor: theme.outline }]}>
              <MaterialCommunityIcons name="gift-outline" size={14} color={theme.tint} />
              <Text style={[styles.giftArchiveCountText, { color: theme.tint }]}>{giftSummary.count}</Text>
            </View>
          </View>

          {giftArchive.length === 0 ? (
            <GiftEmptyPlaceholder
              title="Your gifts will show here"
              body="When someone sends a premium gift, it will collect here for a quieter, more memorable reveal."
              icon="gift-outline"
              theme={theme}
              isDark={isDark}
              eyebrow="Gift archive"
              actionLabel="Premium reveals will collect here"
            />
          ) : (
            <View style={styles.giftArchiveGroups}>
              {waitingGifts.length > 0 ? (
                <View style={styles.giftArchiveGroup}>
                  <View style={styles.giftArchiveSectionHeader}>
                    <Text style={[styles.giftArchiveSectionTitle, { color: theme.text }]}>
                      Waiting
                    </Text>
                    <Text style={[styles.giftArchiveSectionMeta, { color: theme.textMuted }]}>
                      {waitingGifts.length}
                    </Text>
                  </View>
                  <View style={styles.giftArchiveList}>
                    {waitingGifts.map((gift) => (
                      <Pressable
                        key={gift.id}
                        onPress={() => void openGiftReveal(gift)}
                        style={[styles.giftArchiveRow, isCompactWidth ? styles.giftArchiveRowCompact : null, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background, borderColor: theme.outline }]}
                      >
                        <View style={styles.giftArchiveSender}>
                          {gift.senderAvatar ? (
                            <Image source={{ uri: gift.senderAvatar }} style={styles.giftArchiveAvatar} />
                          ) : (
                            <View style={[styles.giftArchiveAvatarFallback, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}16` }]}>
                              <Text style={[styles.giftArchiveAvatarText, { color: theme.text }]}>
                                {gift.senderName.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.giftArchiveCopy}>
                            <Text style={[styles.giftArchiveSenderName, { color: theme.text }]} numberOfLines={1}>
                              {gift.senderName}
                            </Text>
                            <Text style={[styles.giftArchiveSenderMeta, { color: theme.textMuted }]}>
                              Awaiting reveal
                            </Text>
                          </View>
                        </View>

                        <GiftActionPill
                          label="Reveal"
                          giftType={gift.giftType}
                          onPress={() => void openGiftReveal(gift)}
                          theme={theme}
                          isCompactWidth={isCompactWidth}
                          isDark={isDark}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {revealedGifts.length > 0 ? (
                <View style={styles.giftArchiveGroup}>
                  <View style={styles.giftArchiveSectionHeader}>
                    <Text style={[styles.giftArchiveSectionTitle, { color: theme.text }]}>
                      Revealed
                    </Text>
                    <Text style={[styles.giftArchiveSectionMeta, { color: theme.textMuted }]}>
                      {revealedGifts.length}
                    </Text>
                  </View>
                  <View style={styles.giftArchiveList}>
                    {revealedGifts.map((gift) => (
                      <View
                        key={gift.id}
                        style={[styles.giftArchiveRow, isCompactWidth ? styles.giftArchiveRowCompact : null, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background, borderColor: theme.outline }]}
                      >
                        <Pressable style={styles.giftArchiveSender} onPress={() => void openGiftReveal(gift)}>
                          {gift.senderAvatar ? (
                            <Image source={{ uri: gift.senderAvatar }} style={styles.giftArchiveAvatar} />
                          ) : (
                            <View style={[styles.giftArchiveAvatarFallback, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}16` }]}>
                              <Text style={[styles.giftArchiveAvatarText, { color: theme.text }]}>
                                {gift.senderName.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.giftArchiveCopy}>
                            <Text style={[styles.giftArchiveSenderName, { color: theme.text }]} numberOfLines={1}>
                              {gift.senderName}
                            </Text>
                            <Text style={[styles.giftArchiveSenderMeta, { color: theme.textMuted }]}>
                              {`Revealed ${formatGiftArchiveDate(gift.revealedAt)}`}
                            </Text>
                          </View>
                        </Pressable>

                        <View style={styles.giftArchiveActionStack}>
                          <GiftActionPill
                            label="Open"
                            giftType={gift.giftType}
                            onPress={() => void openGiftReveal(gift)}
                            theme={theme}
                            isCompactWidth={isCompactWidth}
                            isDark={isDark}
                          />
                          <Pressable
                            onPress={() => void archiveGift(gift)}
                            style={[styles.giftArchiveArchivePill, { borderColor: theme.outline }]}
                          >
                            <MaterialCommunityIcons name="archive-outline" size={14} color={theme.textMuted} />
                            <Text style={[styles.giftArchiveArchiveText, { color: theme.textMuted }]}>
                              Archive
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {archivedGifts.length > 0 ? (
                <View style={styles.giftArchiveGroup}>
                  <View style={styles.giftArchiveSectionHeader}>
                    <Text style={[styles.giftArchiveSectionTitle, { color: theme.text }]}>
                      Archived
                    </Text>
                    <Text style={[styles.giftArchiveSectionMeta, { color: theme.textMuted }]}>
                      {archivedGifts.length}
                    </Text>
                  </View>
                  <View style={styles.giftArchiveList}>
                    {archivedGifts.map((gift) => (
                      <Pressable
                        key={gift.id}
                        onPress={() => void openGiftReveal(gift)}
                        style={[styles.giftArchiveRow, isCompactWidth ? styles.giftArchiveRowCompact : null, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background, borderColor: theme.outline }]}
                      >
                        <View style={styles.giftArchiveSender}>
                          {gift.senderAvatar ? (
                            <Image source={{ uri: gift.senderAvatar }} style={styles.giftArchiveAvatar} />
                          ) : (
                            <View style={[styles.giftArchiveAvatarFallback, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}16` }]}>
                              <Text style={[styles.giftArchiveAvatarText, { color: theme.text }]}>
                                {gift.senderName.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.giftArchiveCopy}>
                            <Text style={[styles.giftArchiveSenderName, { color: theme.text }]} numberOfLines={1}>
                              {gift.senderName}
                            </Text>
                            <Text style={[styles.giftArchiveSenderMeta, { color: theme.textMuted }]}>
                              {`Archived ${formatGiftArchiveDate(gift.archivedAt)}`}
                            </Text>
                          </View>
                        </View>

                        <GiftActionPill
                          label="Open"
                          giftType={gift.giftType}
                          onPress={() => void openGiftReveal(gift)}
                          theme={theme}
                          isCompactWidth={isCompactWidth}
                          isDark={isDark}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View style={[styles.giftArchiveCard, isCompactWidth ? styles.giftArchiveCardCompact : null, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
          <View style={[styles.giftArchiveHeader, isCompactWidth ? styles.giftArchiveHeaderCompact : null]}>
            <View style={styles.giftArchiveHeaderCopy}>
              <Text style={[styles.giftArchiveEyebrow, { color: theme.tint }]}>Sent gifts</Text>
              <Text style={[styles.giftArchiveTitle, isCompactWidth ? styles.giftArchiveTitleCompact : null, { color: theme.text }]}>Signals you already sent</Text>
            </View>
            <View style={[styles.giftArchiveCount, isCompactWidth ? styles.giftArchiveCountCompact : null, { backgroundColor: isDark ? 'rgba(46,214,194,0.12)' : `${theme.tint}14`, borderColor: theme.outline }]}>
              <MaterialCommunityIcons name="send-outline" size={14} color={theme.tint} />
              <Text style={[styles.giftArchiveCountText, { color: theme.tint }]}>{sentGiftArchive.length}</Text>
            </View>
          </View>

          {sentGiftArchive.length === 0 ? (
            <GiftEmptyPlaceholder
              title="Your sent gifts will show here"
              body="Every premium gift you send will also live here, along with its reveal status."
              icon="send-outline"
              theme={theme}
              isDark={isDark}
              eyebrow="Sent gifts"
              actionLabel="Sent signals will appear here"
            />
          ) : (
            <View style={styles.giftArchiveGroups}>
              {pendingSentGifts.length > 0 ? (
                <View style={styles.giftArchiveGroup}>
                  <View style={styles.giftArchiveSectionHeader}>
                    <Text style={[styles.giftArchiveSectionTitle, { color: theme.text }]}>Awaiting reveal</Text>
                    <Text style={[styles.giftArchiveSectionMeta, { color: theme.textMuted }]}>{pendingSentGifts.length}</Text>
                  </View>
                  <View style={styles.giftArchiveList}>
                    {pendingSentGifts.map((gift) => (
                      <Pressable
                        key={gift.id}
                        onPress={() => void openSentGiftRecipientProfile(gift)}
                        style={[styles.giftArchiveRow, isCompactWidth ? styles.giftArchiveRowCompact : null, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background, borderColor: theme.outline }]}
                      >
                        <View style={styles.giftArchiveSender}>
                          {gift.recipientAvatar ? (
                            <Image source={{ uri: gift.recipientAvatar }} style={styles.giftArchiveAvatar} />
                          ) : (
                            <View style={[styles.giftArchiveAvatarFallback, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}16` }]}>
                              <Text style={[styles.giftArchiveAvatarText, { color: theme.text }]}>
                                {gift.recipientName.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.giftArchiveCopy}>
                            <Text style={[styles.giftArchiveSenderName, { color: theme.text }]} numberOfLines={1}>
                              {gift.recipientName}
                            </Text>
                            <Text style={[styles.giftArchiveSenderMeta, { color: theme.textMuted }]}>
                              Awaiting reveal
                            </Text>
                          </View>
                        </View>

                        <GiftActionPill
                          label="Pending"
                          giftType={gift.giftType}
                          theme={theme}
                          isCompactWidth={isCompactWidth}
                          isDark={isDark}
                          disabled
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {openedSentGifts.length > 0 ? (
                <View style={styles.giftArchiveGroup}>
                  <View style={styles.giftArchiveSectionHeader}>
                    <Text style={[styles.giftArchiveSectionTitle, { color: theme.text }]}>Opened</Text>
                    <Text style={[styles.giftArchiveSectionMeta, { color: theme.textMuted }]}>{openedSentGifts.length}</Text>
                  </View>
                  <View style={styles.giftArchiveList}>
                    {openedSentGifts.map((gift) => (
                      <Pressable
                        key={gift.id}
                        onPress={() => void openSentGiftRecipientProfile(gift)}
                        style={[styles.giftArchiveRow, isCompactWidth ? styles.giftArchiveRowCompact : null, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background, borderColor: theme.outline }]}
                      >
                        <View style={styles.giftArchiveSender}>
                          {gift.recipientAvatar ? (
                            <Image source={{ uri: gift.recipientAvatar }} style={styles.giftArchiveAvatar} />
                          ) : (
                            <View style={[styles.giftArchiveAvatarFallback, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}16` }]}>
                              <Text style={[styles.giftArchiveAvatarText, { color: theme.text }]}>
                                {gift.recipientName.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.giftArchiveCopy}>
                            <Text style={[styles.giftArchiveSenderName, { color: theme.text }]} numberOfLines={1}>
                              {gift.recipientName}
                            </Text>
                            <Text style={[styles.giftArchiveSenderMeta, { color: theme.textMuted }]}>
                              {formatSentGiftStatus(gift)}
                            </Text>
                          </View>
                        </View>

                        <GiftActionPill
                          label="Open"
                          giftType={gift.giftType}
                          onPress={() => void openSentGiftRecipientProfile(gift)}
                          theme={theme}
                          isCompactWidth={isCompactWidth}
                          isDark={isDark}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {archivedSentGifts.length > 0 ? (
                <View style={styles.giftArchiveGroup}>
                  <View style={styles.giftArchiveSectionHeader}>
                    <Text style={[styles.giftArchiveSectionTitle, { color: theme.text }]}>Archived</Text>
                    <Text style={[styles.giftArchiveSectionMeta, { color: theme.textMuted }]}>{archivedSentGifts.length}</Text>
                  </View>
                  <View style={styles.giftArchiveList}>
                    {archivedSentGifts.map((gift) => (
                      <Pressable
                        key={gift.id}
                        onPress={() => void openSentGiftRecipientProfile(gift)}
                        style={[styles.giftArchiveRow, isCompactWidth ? styles.giftArchiveRowCompact : null, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background, borderColor: theme.outline }]}
                      >
                        <View style={styles.giftArchiveSender}>
                          {gift.recipientAvatar ? (
                            <Image source={{ uri: gift.recipientAvatar }} style={styles.giftArchiveAvatar} />
                          ) : (
                            <View style={[styles.giftArchiveAvatarFallback, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}16` }]}>
                              <Text style={[styles.giftArchiveAvatarText, { color: theme.text }]}>
                                {gift.recipientName.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.giftArchiveCopy}>
                            <Text style={[styles.giftArchiveSenderName, { color: theme.text }]} numberOfLines={1}>
                              {gift.recipientName}
                            </Text>
                            <Text style={[styles.giftArchiveSenderMeta, { color: theme.textMuted }]}>
                              {formatSentGiftStatus(gift)}
                            </Text>
                          </View>
                        </View>

                        <GiftActionPill
                          label="Open"
                          giftType={gift.giftType}
                          onPress={() => void openSentGiftRecipientProfile(gift)}
                          theme={theme}
                          isCompactWidth={isCompactWidth}
                          isDark={isDark}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View style={[styles.secondaryList, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
          {secondaryItems.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={item.onPress}
              style={[
                styles.secondaryRow,
                index < secondaryItems.length - 1 ? { borderBottomColor: theme.outline, borderBottomWidth: StyleSheet.hairlineWidth } : null,
              ]}
            >
              <View style={[styles.secondaryIcon, { backgroundColor: theme.background }]}>
                <MaterialCommunityIcons name={item.icon} size={18} color={theme.tint} />
              </View>
              <View style={styles.secondaryCopy}>
                <Text style={[styles.secondaryTitle, { color: theme.text }]}>{item.title}</Text>
                <Text style={[styles.secondaryBody, { color: theme.textMuted }]}>{item.body}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
        <GiftRevealSheet
          visible={Boolean(selectedGift)}
          senderAvatar={selectedGift?.senderAvatar ?? null}
          senderName={selectedGift?.senderName ?? 'Gift signal'}
          senderGender={selectedGift?.senderGender ?? null}
          giftType={selectedGift?.giftType}
          timeLabel={formatGiftArchiveDate(selectedGift?.revealedAt ?? selectedGift?.createdAt)}
          onClose={() => setSelectedGift(null)}
        onViewProfile={
          selectedGift?.senderProfileId
            ? () => void openGiftSenderProfile(selectedGift)
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  headerCompact: { minHeight: 64, paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
  headerTitleCompact: { fontSize: 20 },
  headerSubtitle: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 11, textAlign: 'center' },
  headerSubtitleCompact: { fontSize: 10, lineHeight: 14, paddingHorizontal: 10 },
  content: { padding: 18, paddingBottom: 40 },
  contentCompact: { padding: 14, paddingBottom: 28 },
  hero: { borderWidth: 1, borderRadius: 22, padding: 20 },
  heroCompact: { borderRadius: 18, padding: 16 },
  heroEyebrow: { fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1.4 },
  heroTitle: { marginTop: 8, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, lineHeight: 34 },
  heroTitleCompact: { fontSize: 24, lineHeight: 28 },
  heroBody: { marginTop: 10, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20 },
  heroBodyCompact: { marginTop: 8, fontSize: 12, lineHeight: 18 },
  featureGrid: { marginTop: 22, gap: 14 },
  featureCard: { borderWidth: 1, borderRadius: 22, padding: 16 },
  featureCardCompact: { borderRadius: 18, padding: 14 },
  featureIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  featureIconWrapCompact: { width: 40, height: 40, borderRadius: 12 },
  featureTitle: { marginTop: 14, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 23 },
  featureTitleCompact: { marginTop: 12, fontSize: 20 },
  featureBody: { marginTop: 6, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19 },
  featureBodyCompact: { fontSize: 12, lineHeight: 18 },
  featureFooter: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureLink: { fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1 },
  giftArchiveCard: { marginTop: 18, borderWidth: 1, borderRadius: 22, padding: 16 },
  giftArchiveCardCompact: { marginTop: 16, borderRadius: 18, padding: 14 },
  giftArchiveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  giftArchiveHeaderCompact: { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', flexWrap: 'nowrap', gap: 10 },
  giftArchiveHeaderCopy: { flex: 1, minWidth: 0 },
  giftArchiveEyebrow: { fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  giftArchiveTitle: { marginTop: 6, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24, lineHeight: 28 },
  giftArchiveTitleCompact: { fontSize: 20, lineHeight: 24 },
  giftArchiveCount: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  giftArchiveCountCompact: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 6 },
  giftArchiveCountText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12 },
  giftArchiveEmpty: { marginTop: 16, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20 },
  giftArchivePlaceholder: { marginTop: 16, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  giftArchivePlaceholderIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  giftArchivePlaceholderCopy: { flex: 1, minWidth: 0 },
  giftArchivePlaceholderEyebrow: { fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  giftArchivePlaceholderTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  giftArchivePlaceholderBody: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  giftArchivePlaceholderAction: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  giftArchivePlaceholderActionText: { fontFamily: 'Manrope_700Bold', fontSize: 11.5 },
  giftArchiveGroups: { marginTop: 16, gap: 18 },
  giftArchiveGroup: { gap: 12 },
  giftArchiveSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  giftArchiveSectionTitle: { fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' },
  giftArchiveSectionMeta: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  giftArchiveList: { marginTop: 16, gap: 12 },
  giftArchiveRow: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  giftArchiveRowCompact: { borderRadius: 16, padding: 10, gap: 8 },
  giftArchiveSender: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  giftArchiveAvatar: { width: 42, height: 42, borderRadius: 21 },
  giftArchiveAvatarFallback: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  giftArchiveAvatarText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  giftArchiveCopy: { flex: 1, minWidth: 0 },
  giftArchiveSenderName: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  giftArchiveSenderMeta: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 12 },
  giftArchiveRevealPill: {
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  giftArchiveRevealPillCompact: { minWidth: 82, gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  giftArchiveRevealText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  giftArchiveRevealTextCompact: { fontSize: 11.5 },
  giftArchiveActionStack: { alignItems: 'flex-end', gap: 8 },
  giftArchiveArchivePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  giftArchiveArchiveText: { fontFamily: 'Manrope_700Bold', fontSize: 11.5 },
  secondaryList: { marginTop: 18, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  secondaryRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  secondaryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  secondaryCopy: { flex: 1, minWidth: 0 },
  secondaryTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  secondaryBody: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
});
