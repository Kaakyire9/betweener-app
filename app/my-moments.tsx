import MomentViewer from '@/components/MomentViewer';
import MomentCommentsModal from '@/components/MomentCommentsModal';
import TextMomentCard from '@/components/moments/TextMomentCard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Moment, MomentUser } from '@/hooks/useMoments';
import { useAuth } from '@/lib/auth-context';
import { deleteMomentOfflineSafe } from '@/lib/moments-offline-actions';
import { createSignedUrl } from '@/lib/moments';
import {
  fetchMyMomentRecentViewers,
  fetchMyMomentViewerSegments,
  fetchMyMomentViewStats,
  type MomentRecentViewer,
  type MomentViewerSegments,
} from '@/lib/moments-views';
import { collectMomentSyncIssues } from '@/lib/offline/moment-sync-issues';
import { reconcileMomentRowsWithOfflineMutations } from '@/lib/offline/moment-mutation-reconciler';
import {
  mergeOwnMomentsSnapshot,
  removeMomentFromFeedSnapshot,
  readOwnMomentRecentViewersSnapshot,
  readMomentReactorsSnapshot,
  removeOwnMomentSnapshot,
  primeOfflineMomentMedia,
  readOwnMomentsSnapshot,
  resolveOfflineMomentMediaMap,
  writeOwnMomentRecentViewersSnapshot,
  writeMomentReactorsSnapshot,
} from '@/lib/offline/moments-store';
import { getMomentOfflineMutationSnapshot, retryFailedOfflineMutation, retryFailedOfflineMutations, subscribeToOfflineMutationEvents } from '@/lib/offline/mutation-queue';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const getMomentKindLabel = (moment: Moment) => {
  if (moment.type === 'text') return 'Text Moment';
  if (moment.type === 'video') return 'Video Moment';
  return 'Photo Moment';
};

const getTextPreviewDensity = (body: string | null) => {
  const text = String(body || '').trim();
  if (text.length > 140) return { lines: 5, compact: false };
  if (text.length > 90) return { lines: 4, compact: false };
  return { lines: 3, compact: true };
};

const formatRate = (numerator: number, denominator: number) => {
  if (denominator <= 0 || numerator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
};

const getMomentInsightLabel = (moment: Moment) => {
  const caption = String(moment.caption || '').trim();
  if (caption) return caption;
  const body = String(moment.text_body || '').trim().replace(/\s+/g, ' ');
  if (body) return body.length > 44 ? `${body.slice(0, 44).trim()}...` : body;
  return getMomentKindLabel(moment);
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatHourLabel = (hour: number) => {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${displayHour} ${suffix}`;
};

const formatCountryAudienceLabel = (currentCountryCode: string | null) => {
  if (currentCountryCode === 'GH') return 'Ghana';
  if (currentCountryCode && currentCountryCode.length > 0) return 'Abroad';
  return 'Unknown';
};

type MomentViewTimeInsightRow = {
  localHour: number;
  weekdayBucket: number;
  viewCount: number;
};

type NextActionInsight = {
  title: string;
  summary: string;
  cta: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  action:
    | { kind: 'open_comments'; momentId: string }
    | { kind: 'open_viewers'; momentId: string }
    | { kind: 'open_moment'; momentId: string }
    | { kind: 'create_moment' };
};

type ReactorRow = {
  id: string;
  emoji: string;
  user_id: string;
  created_at: string;
};

type ReactorProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export default function MyMomentsScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { user, profile } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [offlineMediaByMomentId, setOfflineMediaByMomentId] = useState<Record<string, string>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [syncStateByMomentId, setSyncStateByMomentId] = useState<Record<string, { state: 'pending' | 'failed'; label: string }>>({});
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStartMomentId, setViewerStartMomentId] = useState<string | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsMomentId, setCommentsMomentId] = useState<string | null>(null);
  const [reactorsVisible, setReactorsVisible] = useState(false);
  const [selectedReactionMoment, setSelectedReactionMoment] = useState<Moment | null>(null);
  const [reactors, setReactors] = useState<ReactorRow[]>([]);
  const [reactorProfiles, setReactorProfiles] = useState<Record<string, ReactorProfile>>({});
  const [reactorsLoading, setReactorsLoading] = useState(false);
  const [viewersVisible, setViewersVisible] = useState(false);
  const [selectedViewedMoment, setSelectedViewedMoment] = useState<Moment | null>(null);
  const [recentViewers, setRecentViewers] = useState<MomentRecentViewer[]>([]);
  const [recentViewersLoading, setRecentViewersLoading] = useState(false);
  const [viewTimeInsights, setViewTimeInsights] = useState<MomentViewTimeInsightRow[]>([]);
  const [viewerSegments, setViewerSegments] = useState<MomentViewerSegments | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const snapshot = await readOwnMomentsSnapshot(user.id);
      if (cancelled || !snapshot) return;
      if (Array.isArray(snapshot.moments) && snapshot.moments.length > 0) {
        setMoments((prev) => (prev.length === 0 ? (snapshot.moments as Moment[]) : prev));
      }
      if (snapshot.reactionCounts && Object.keys(snapshot.reactionCounts).length > 0) {
        setReactionCounts((prev) => (Object.keys(prev).length === 0 ? snapshot.reactionCounts : prev));
      }
      if (snapshot.commentCounts && Object.keys(snapshot.commentCounts).length > 0) {
        setCommentCounts((prev) => (Object.keys(prev).length === 0 ? snapshot.commentCounts : prev));
      }
      if (snapshot.viewCounts && Object.keys(snapshot.viewCounts).length > 0) {
        setViewCounts((prev) => (Object.keys(prev).length === 0 ? snapshot.viewCounts ?? {} : prev));
      }
      if (Array.isArray(snapshot.viewTimeInsights) && snapshot.viewTimeInsights.length > 0) {
        setViewTimeInsights((prev) => (prev.length === 0 ? snapshot.viewTimeInsights ?? [] : prev));
      }
      if (snapshot.viewerSegments) {
        setViewerSegments((prev) => prev ?? snapshot.viewerSegments ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const fetchMoments = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('moments')
        .select('id,user_id,type,media_url,metadata,thumbnail_url,text_body,caption,created_at,expires_at,visibility,is_deleted,moment_reactions(id),moment_comments(id)')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error || !data) {
        return;
      }
      const counts: Record<string, number> = {};
      const nextCommentCounts: Record<string, number> = {};
      const cleaned = (data as any[]).map((row) => {
        const reactions = Array.isArray(row.moment_reactions) ? row.moment_reactions.length : 0;
        const comments = Array.isArray(row.moment_comments) ? row.moment_comments.length : 0;
        counts[row.id] = reactions;
        nextCommentCounts[row.id] = comments;
        const { moment_reactions: _momentReactions, moment_comments: _momentComments, ...rest } = row;
        return rest as Moment;
      });
      const reconciled = await reconcileMomentRowsWithOfflineMutations({
        currentUserId: user.id,
        moments: cleaned,
        reactionCounts: counts,
        commentCounts: nextCommentCounts,
      });
      const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
      const [nextViewCounts, viewTimeInsightsResult, viewerSegmentsResult] = await Promise.all([
        fetchMyMomentViewStats(reconciled.moments.map((moment) => moment.id)),
        supabase.rpc('rpc_get_my_moment_view_time_insights', {
          p_days: 21,
          p_utc_offset_minutes: timezoneOffsetMinutes,
        }),
        fetchMyMomentViewerSegments(30),
      ]);
      const nextViewTimeInsights = Array.isArray(viewTimeInsightsResult.data)
        ? (viewTimeInsightsResult.data as Array<{
            local_hour?: number | null;
            weekday_bucket?: number | null;
            view_count?: number | null;
          }>).map((row) => ({
            localHour: Number(row.local_hour || 0),
            weekdayBucket: Number(row.weekday_bucket || 0),
            viewCount: Number(row.view_count || 0),
          }))
        : null;
      setReactionCounts(reconciled.reactionCounts);
      setCommentCounts(reconciled.commentCounts);
      if (nextViewCounts) {
        setViewCounts(nextViewCounts);
      }
      if (!viewTimeInsightsResult.error && nextViewTimeInsights) {
        setViewTimeInsights(nextViewTimeInsights);
      }
      if (viewerSegmentsResult) {
        setViewerSegments(viewerSegmentsResult);
      }
      setSyncStateByMomentId(reconciled.syncStateByMomentId);
      setMoments(reconciled.moments);
      await mergeOwnMomentsSnapshot(user.id, {
        moments: reconciled.moments,
        reactionCounts: reconciled.reactionCounts,
        commentCounts: reconciled.commentCounts,
        ...(nextViewCounts ? { viewCounts: nextViewCounts } : {}),
        ...(!viewTimeInsightsResult.error && nextViewTimeInsights
          ? { viewTimeInsights: nextViewTimeInsights }
          : {}),
        ...(viewerSegmentsResult ? { viewerSegments: viewerSegmentsResult } : {}),
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchMoments();
  }, [fetchMoments]);

  useEffect(() => {
    return subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind === 'moment_text_create' ||
        event.mutation.kind === 'moment_media_create' ||
        event.mutation.kind === 'moment_delete' ||
        event.mutation.kind === 'moment_reaction_sync' ||
        event.mutation.kind === 'moment_comment_create'
      ) {
        void fetchMoments();
      }
    });
  }, [fetchMoments]);

  useEffect(() => {
    const resolveUrls = async () => {
      const pending = moments.filter((m) => m.media_url && !m.media_url.startsWith('http') && !signedUrls[m.id]);
      if (pending.length === 0) return;
      const resolved: Record<string, string> = {};
      await Promise.all(
        pending.map(async (m) => {
          const url = await createSignedUrl(m.media_url || '', 3600);
          if (url) resolved[m.id] = url;
        }),
      );
      if (Object.keys(resolved).length > 0) {
        setSignedUrls((prev) => ({ ...prev, ...resolved }));
        const cachedLocals = await primeOfflineMomentMedia(moments, resolved);
        if (Object.keys(cachedLocals).length > 0) {
          setOfflineMediaByMomentId((prev) => ({ ...prev, ...cachedLocals }));
        }
      }
    };
    void resolveUrls();
  }, [moments, signedUrls]);

  useEffect(() => {
    let cancelled = false;
    if (moments.length === 0) {
      setOfflineMediaByMomentId({});
      return;
    }
    (async () => {
      const next = await resolveOfflineMomentMediaMap(moments);
      if (!cancelled) {
        setOfflineMediaByMomentId(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moments]);

  const handleDelete = (moment: Moment) => {
    Alert.alert('Delete Moment?', 'This will remove the Moment for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) {
            Alert.alert('Session expired', 'Please sign in again and retry.');
            return;
          }
          setMoments((prev) => prev.filter((m) => m.id !== moment.id));
          setReactionCounts((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          setCommentCounts((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          setViewCounts((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          setSignedUrls((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          setOfflineMediaByMomentId((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          void removeOwnMomentSnapshot(user.id, moment.id);
          void removeMomentFromFeedSnapshot(user.id, moment.id);
          try {
            await deleteMomentOfflineSafe({
              userId: user.id,
              momentId: moment.id,
              mediaPath: moment.media_url,
            });
          } catch (err) {
            console.log('Delete moment failed', err);
            const message = err instanceof Error ? err.message : 'Please try again.';
            Alert.alert('Delete failed', message);
            void fetchMoments();
          }
        },
      },
    ]);
  };

  const handleShare = async (moment: Moment) => {
    const url =
      moment.media_url?.startsWith('http')
        ? moment.media_url
        : signedUrls[moment.id] || offlineMediaByMomentId[moment.id];
    const message =
      moment.type === 'text'
        ? moment.text_body || 'My Moment'
        : url
        ? `My Moment: ${url}`
        : 'My Moment';
    try {
      await Share.share({ message });
    } catch (e) {
      console.log('Share moment failed', e);
    }
  };

  const openMomentActions = (moment: Moment) => {
    const syncState = syncStateByMomentId[moment.id] ?? null;
    const open = async () => {
      const snapshot = await getMomentOfflineMutationSnapshot();
      const issues = collectMomentSyncIssues([...snapshot.failed, ...snapshot.pending], moment.id);
      const failedIssues = issues.filter((issue) => issue.state === 'failed');
      const buttons: NonNullable<Parameters<typeof Alert.alert>[2]> = [
        { text: 'Share', onPress: () => handleShare(moment) },
      ];
      if (issues.length > 0) {
        buttons.push({
          text: 'Review sync issues',
          onPress: () => {
            Alert.alert(
              'Moment sync status',
              issues
                .slice(0, 4)
                .map((issue, index) => `${index + 1}. ${issue.title}\n${issue.detail}`)
                .join('\n\n'),
            );
          },
        });
      }
      if (failedIssues.length > 0) {
        buttons.push({
          text: 'Retry sync',
          onPress: async () => {
            await retryFailedOfflineMutations((mutation) =>
              failedIssues.some((issue) => issue.id === mutation.id),
            );
            void fetchMoments();
          },
        });
      }
      buttons.push({ text: 'Delete', style: 'destructive', onPress: () => handleDelete(moment) });
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Moment options', undefined, buttons);
    };
    void open();
  };

  const openComments = (momentId: string) => {
    setCommentsMomentId(momentId);
    setCommentsVisible(true);
  };

  const openProfileFromMomentContext = useCallback(
    (profileId?: string | null, actorUserId?: string | null) => {
      if (actorUserId && actorUserId === user?.id) {
        setReactorsVisible(false);
        setSelectedReactionMoment(null);
        setViewersVisible(false);
        setSelectedViewedMoment(null);
        router.push('/(tabs)/profile');
        return;
      }
      if (!profileId) return;
      setReactorsVisible(false);
      setSelectedReactionMoment(null);
      setViewersVisible(false);
      setSelectedViewedMoment(null);
      router.push({ pathname: '/profile-view', params: { profileId: String(profileId) } });
    },
    [router, user?.id],
  );

  const openReactors = useCallback(async (moment: Moment) => {
    setSelectedReactionMoment(moment);
    setReactorsVisible(true);
    setReactorsLoading(true);
    setReactors([]);
    setReactorProfiles({});
    try {
      if (user?.id) {
        const cached = await readMomentReactorsSnapshot(user.id, moment.id);
        if (cached) {
          setReactors(cached.reactions);
          setReactorProfiles(cached.profilesByUserId as Record<string, ReactorProfile>);
        }
      }

      const { data, error } = await supabase
        .from('moment_reactions')
        .select('id,emoji,user_id,created_at')
        .eq('moment_id', moment.id)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return;
      }

      const reactionRows = data as ReactorRow[];
      setReactors(reactionRows);

      const userIds = Array.from(new Set(reactionRows.map((row) => row.user_id))).filter(Boolean);
      if (userIds.length === 0) return;

      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id,user_id,full_name,avatar_url')
        .in('user_id', userIds);

      const nextProfiles: Record<string, ReactorProfile> = {};
      (profileRows || []).forEach((profileRow: any) => {
        if (!profileRow.user_id) return;
        nextProfiles[profileRow.user_id] = {
          id: profileRow.id ?? null,
          full_name: profileRow.full_name ?? null,
          avatar_url: profileRow.avatar_url ?? null,
        };
      });
      setReactorProfiles(nextProfiles);
      if (user?.id) {
        await writeMomentReactorsSnapshot(user.id, moment.id, {
          reactions: reactionRows,
          profilesByUserId: nextProfiles,
        });
      }
    } finally {
      setReactorsLoading(false);
    }
  }, [user?.id]);

  const openViewers = useCallback(async (moment: Moment) => {
    setSelectedViewedMoment(moment);
    setViewersVisible(true);
    setRecentViewersLoading(true);
    setRecentViewers([]);
    try {
      let cachedRows: MomentRecentViewer[] = [];
      if (user?.id) {
        cachedRows = await readOwnMomentRecentViewersSnapshot(user.id, moment.id);
        if (cachedRows.length > 0) {
          setRecentViewers(cachedRows);
        }
      }

      const rows = await fetchMyMomentRecentViewers(moment.id, 40);
      if (rows) {
        setRecentViewers(rows);
        if (user?.id) {
          await writeOwnMomentRecentViewersSnapshot(user.id, moment.id, rows);
        }
      } else if (cachedRows.length === 0) {
        setRecentViewers([]);
      }
    } finally {
      setRecentViewersLoading(false);
    }
  }, [user?.id]);

  const emptyState = !loading && moments.length === 0;
  const heroInsight = useMemo(() => {
    const ranked = moments
      .map((moment) => {
        const views = viewCounts[moment.id] ?? 0;
        const reactions = reactionCounts[moment.id] ?? 0;
        const comments = commentCounts[moment.id] ?? 0;
        const reactionRate = views > 0 ? reactions / views : 0;
        const commentRate = views > 0 ? comments / views : 0;
        const weightedScore = views + reactions * 5 + comments * 8 + reactionRate * 20 + commentRate * 28;
        return {
          moment,
          views,
          reactions,
          comments,
          reactionRate,
          commentRate,
          weightedScore,
        };
      })
      .filter((entry) => entry.views > 0)
      .sort((a, b) => b.weightedScore - a.weightedScore);

    const top = ranked[0];
    if (!top) return null;

    let metric = `${top.views} views`;
    let summary = 'This one is currently pulling the most attention.';

    if (top.comments > 0 && top.commentRate >= 0.12) {
      metric = `${formatRate(top.comments, top.views)} comment rate`;
      summary = 'People are not just opening it. They are replying to it.';
    } else if (top.reactions > 0 && top.reactionRate >= 0.18) {
      metric = `${formatRate(top.reactions, top.views)} reaction rate`;
      summary = 'This one is converting viewers into reactions better than the rest.';
    } else if (top.comments > 0) {
      metric = `${top.comments} comments`;
      summary = 'This one is creating the strongest conversation so far.';
    } else if (top.reactions > 0) {
      metric = `${top.reactions} reactions`;
      summary = 'This one is earning the warmest response so far.';
    }

    return {
      momentId: top.moment.id,
      label: getMomentInsightLabel(top.moment),
      metric,
      summary,
    };
  }, [commentCounts, moments, reactionCounts, viewCounts]);
  const audienceWindowInsight = useMemo(() => {
    if (viewTimeInsights.length === 0) return null;

    const byHour = new Map<number, number>();
    const byWeekday = new Map<number, number>();

    viewTimeInsights.forEach((row) => {
      byHour.set(row.localHour, (byHour.get(row.localHour) || 0) + row.viewCount);
      byWeekday.set(row.weekdayBucket, (byWeekday.get(row.weekdayBucket) || 0) + row.viewCount);
    });

    const topHourEntry = Array.from(byHour.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    const topWeekdayEntry = Array.from(byWeekday.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    const topWindow = viewTimeInsights[0] ?? null;
    if (!topHourEntry || !topWeekdayEntry || !topWindow) return null;

    const weekdayLabel = WEEKDAY_LABELS[topWeekdayEntry[0]] || 'This week';
    const hourLabel = formatHourLabel(topHourEntry[0]);
    const windowLabel = `${WEEKDAY_LABELS[topWindow.weekdayBucket] || 'Day'} around ${formatHourLabel(topWindow.localHour)}`;

    return {
      title: `${weekdayLabel} around ${hourLabel}`,
      metric: `${topWindow.viewCount} recent views in the strongest window`,
      summary: `Your audience has been most active ${windowLabel.toLowerCase()}.`,
    };
  }, [viewTimeInsights]);
  const nextActionInsight = useMemo<NextActionInsight | null>(() => {
    if (moments.length === 0) return null;

    const enriched = moments.map((moment) => {
      const views = viewCounts[moment.id] ?? 0;
      const reactions = reactionCounts[moment.id] ?? 0;
      const comments = commentCounts[moment.id] ?? 0;
      return {
        moment,
        views,
        reactions,
        comments,
        reactionRate: views > 0 ? reactions / views : 0,
        commentRate: views > 0 ? comments / views : 0,
      };
    });

    const topCommentMoment = [...enriched].sort((a, b) => b.comments - a.comments)[0] ?? null;
    if (topCommentMoment && topCommentMoment.comments > 0) {
      return {
        title: 'Reply while the conversation is warm',
        summary: `${getMomentInsightLabel(topCommentMoment.moment)} has ${topCommentMoment.comments} comment${topCommentMoment.comments === 1 ? '' : 's'}. The highest leverage move is answering people already engaged.`,
        cta: 'Open comments',
        icon: 'comment-processing-outline',
        action: { kind: 'open_comments', momentId: topCommentMoment.moment.id },
      };
    }

    const topViewedMoment = [...enriched].sort((a, b) => b.views - a.views || b.reactions - a.reactions)[0] ?? null;
    if (topViewedMoment && topViewedMoment.views >= 6 && topViewedMoment.reactions > 0) {
      return {
        title: 'Turn attention into a warmer next move',
        summary: `${getMomentInsightLabel(topViewedMoment.moment)} is drawing attention but has not converted into comments yet. Review viewers and lead from existing interest.`,
        cta: 'See viewers',
        icon: 'eye-check-outline',
        action: { kind: 'open_viewers', momentId: topViewedMoment.moment.id },
      };
    }

    if (audienceWindowInsight) {
      return {
        title: 'Use the strongest posting window',
        summary: `${audienceWindowInsight.summary} A fresh Moment in that window should outperform a random post.`,
        cta: 'Add moment',
        icon: 'clock-time-four-outline',
        action: { kind: 'create_moment' },
      };
    }

    if (heroInsight) {
      return {
        title: 'Double down on what is already working',
        summary: `${heroInsight.label} is your strongest live Moment right now. Open it, review the signal, and keep the same energy in your next post.`,
        cta: 'Open moment',
        icon: 'star-four-points',
        action: { kind: 'open_moment', momentId: heroInsight.momentId },
      };
    }

    return {
      title: 'Post again while your profile feels active',
      summary: 'Your Moments are live, but the next lift will come from staying fresh and giving people a new opening.',
      cta: 'Add moment',
      icon: 'plus-circle-outline',
      action: { kind: 'create_moment' },
    };
  }, [audienceWindowInsight, commentCounts, heroInsight, moments, reactionCounts, viewCounts]);
  const viewerSegmentsInsight = useMemo(() => {
    if (!viewerSegments || viewerSegments.totalViewers <= 0) return null;

    const dominantIdentity =
      viewerSegments.matchedViewers >= viewerSegments.nonMatchViewers
        ? `${viewerSegments.matchedViewers} matches`
        : `${viewerSegments.nonMatchViewers} new viewers`;
    const dominantGeo =
      viewerSegments.abroadViewers > viewerSegments.ghanaViewers
        ? `${viewerSegments.abroadViewers} abroad`
        : `${viewerSegments.ghanaViewers} in Ghana`;
    const repeatSignal =
      viewerSegments.repeatViewers > 0
        ? `${viewerSegments.repeatViewers} repeat viewers`
        : `${viewerSegments.firstTimeViewers} first-time viewers`;

    return {
      title: 'Audience mix',
      metric: `${dominantIdentity} - ${dominantGeo}`,
      summary: `${repeatSignal} across ${viewerSegments.totalViewers} recent viewer${viewerSegments.totalViewers === 1 ? '' : 's'}.`,
    };
  }, [viewerSegments]);

  const viewerMoments = useMemo(() => {
    if (!viewerStartMomentId) return moments;
    const idx = moments.findIndex((m) => m.id === viewerStartMomentId);
    if (idx === -1) return moments;
    return moments.slice(0, idx + 1).reverse();
  }, [moments, viewerStartMomentId]);

  const viewerUsers = useMemo<MomentUser[]>(() => {
    if (!user?.id) return [];
    return [
      {
        userId: user.id,
        profileId: profile?.id ?? null,
        name: profile?.full_name || 'You',
        avatarUrl: profile?.avatar_url || null,
        moments: viewerMoments,
        latestMoment: viewerMoments[0],
        isOwn: true,
      },
    ];
  }, [profile?.avatar_url, profile?.full_name, profile?.id, user?.id, viewerMoments]);

  const openViewer = (momentId?: string) => {
    if (!user?.id || moments.length === 0) return;
    setViewerStartMomentId(momentId ?? null);
    setViewerVisible(true);
  };

  const handleNextActionPress = useCallback(() => {
    if (!nextActionInsight) return;
    const action = nextActionInsight.action;
    if (action.kind === 'create_moment') {
      router.push('/moments/create');
      return;
    }
    const targetMoment = moments.find((moment) => moment.id === action.momentId);
    if (!targetMoment) return;
    if (action.kind === 'open_comments') {
      openComments(targetMoment.id);
      return;
    }
    if (action.kind === 'open_viewers') {
      void openViewers(targetMoment);
      return;
    }
    openViewer(targetMoment.id);
  }, [moments, nextActionInsight, openViewers]);

  const formatTimeAgo = (iso: string) => {
    const created = new Date(iso).getTime();
    if (Number.isNaN(created)) return '';
    const diffMs = Date.now() - created;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[
          withAlpha(theme.secondary, isDark ? 0.16 : 0.28),
          withAlpha(theme.accent, isDark ? 0.12 : 0.2),
          'transparent',
        ]}
        style={styles.topGlow}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Moments</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={
            isDark
              ? ['rgba(14,160,160,0.22)', 'rgba(19,33,37,0.92)', 'rgba(117,76,148,0.16)']
              : ['rgba(14,160,160,0.16)', 'rgba(247,236,226,0.96)', 'rgba(117,76,148,0.08)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <MaterialCommunityIcons name="motion-play-outline" size={14} color={theme.tint} />
            <Text style={styles.heroBadgeText}>24h archive</Text>
          </View>
          <Text style={styles.heroTitle}>Recent uploads</Text>
          <Text style={styles.heroSubtitle}>
            Review what is live now, open each Moment in context, and keep your signal feeling fresh.
          </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>{moments.length}</Text>
                <Text style={styles.heroStatLabel}>Active</Text>
              </View>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>
                  {moments.reduce((sum, moment) => sum + (reactionCounts[moment.id] ?? 0), 0)}
                </Text>
                <Text style={styles.heroStatLabel}>Reactions</Text>
              </View>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>
                  {moments.reduce((sum, moment) => sum + (viewCounts[moment.id] ?? 0), 0)}
                </Text>
                <Text style={styles.heroStatLabel}>Views</Text>
              </View>
            </View>
            {heroInsight ? (
              <View style={styles.heroInsightCard}>
                <View style={styles.heroInsightHeader}>
                  <View style={styles.heroInsightBadge}>
                    <MaterialCommunityIcons name="star-four-points" size={13} color={theme.tint} />
                    <Text style={styles.heroInsightBadgeText}>Top moment right now</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.heroInsightAction}
                    activeOpacity={0.85}
                    onPress={() => openViewer(heroInsight.momentId)}
                  >
                    <Text style={styles.heroInsightActionText}>Open</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color={theme.tint} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.heroInsightTitle} numberOfLines={1}>
                  {heroInsight.label}
                </Text>
                <Text style={styles.heroInsightMetric}>{heroInsight.metric}</Text>
                <Text style={styles.heroInsightSummary}>{heroInsight.summary}</Text>
              </View>
            ) : null}
            {audienceWindowInsight ? (
              <View style={styles.heroInsightCard}>
                <View style={styles.heroInsightHeader}>
                  <View style={styles.heroInsightBadge}>
                    <MaterialCommunityIcons name="clock-time-four-outline" size={13} color={theme.tint} />
                    <Text style={styles.heroInsightBadgeText}>Audience window</Text>
                  </View>
                </View>
                <Text style={styles.heroInsightTitle}>{audienceWindowInsight.title}</Text>
                <Text style={styles.heroInsightMetric}>{audienceWindowInsight.metric}</Text>
                <Text style={styles.heroInsightSummary}>{audienceWindowInsight.summary}</Text>
              </View>
            ) : null}
            {nextActionInsight ? (
              <View style={styles.heroInsightCard}>
                <View style={styles.heroInsightHeader}>
                  <View style={styles.heroInsightBadge}>
                    <MaterialCommunityIcons name={nextActionInsight.icon} size={13} color={theme.tint} />
                    <Text style={styles.heroInsightBadgeText}>Best next action</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.heroInsightAction}
                    activeOpacity={0.85}
                    onPress={handleNextActionPress}
                  >
                    <Text style={styles.heroInsightActionText}>{nextActionInsight.cta}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color={theme.tint} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.heroInsightTitle}>{nextActionInsight.title}</Text>
                <Text style={styles.heroInsightSummary}>{nextActionInsight.summary}</Text>
              </View>
            ) : null}
            {viewerSegmentsInsight ? (
              <View style={styles.heroInsightCard}>
                <View style={styles.heroInsightHeader}>
                  <View style={styles.heroInsightBadge}>
                    <MaterialCommunityIcons name="account-group-outline" size={13} color={theme.tint} />
                    <Text style={styles.heroInsightBadgeText}>Viewer segments</Text>
                  </View>
                </View>
                <Text style={styles.heroInsightTitle}>{viewerSegmentsInsight.title}</Text>
                <Text style={styles.heroInsightMetric}>{viewerSegmentsInsight.metric}</Text>
                <Text style={styles.heroInsightSummary}>{viewerSegmentsInsight.summary}</Text>
              </View>
            ) : null}
          </LinearGradient>

        {emptyState ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyBadge}>
              <Text style={styles.emptyBadgeText}>24-hour spotlight</Text>
            </View>
            <Text style={styles.emptyTitle}>Your story has not gone live yet</Text>
            <Text style={styles.emptySubtitle}>
              Post a quick photo, video, or text Moment to stay visible and give people something fresh to react to.
            </Text>
            <View style={styles.emptyHighlights}>
              <View style={styles.emptyHighlightRow}>
                <MaterialCommunityIcons name="flash-outline" size={16} color={theme.tint} />
                <Text style={styles.emptyHighlightText}>Moments keep your profile feeling active.</Text>
              </View>
              <View style={styles.emptyHighlightRow}>
                <MaterialCommunityIcons name="heart-outline" size={16} color={theme.accent} />
                <Text style={styles.emptyHighlightText}>Simple updates create easier conversation starters.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.emptyActionButton} onPress={() => router.push('/moments/create')}>
              <Text style={styles.emptyActionText}>Post your first Moment</Text>
            </TouchableOpacity>
          </View>
        ) : (
          moments.map((moment) => {
            const mediaUrl =
              moment.media_url?.startsWith('http')
                ? moment.media_url
                : signedUrls[moment.id] || offlineMediaByMomentId[moment.id];
            const timeLabel = formatTimeAgo(moment.created_at);
            const views = viewCounts[moment.id] ?? 0;
            const reactions = reactionCounts[moment.id] ?? 0;
            const comments = commentCounts[moment.id] ?? 0;
            const syncState = syncStateByMomentId[moment.id] ?? null;
            const title = moment.caption?.trim() || getMomentKindLabel(moment);
            const textDensity = moment.type === 'text' ? getTextPreviewDensity(moment.text_body) : null;
            const reactionRate = formatRate(reactions, views);
            const commentRate = formatRate(comments, views);
            return (
              <View key={moment.id} style={styles.momentCard}>
                <View style={styles.momentCardTopRow}>
                  <View style={styles.kindPill}>
                    <MaterialCommunityIcons
                      name={
                        moment.type === 'text'
                          ? 'format-text'
                          : moment.type === 'video'
                            ? 'play-box-multiple-outline'
                            : 'image-multiple-outline'
                      }
                      size={14}
                      color={theme.tint}
                    />
                    <Text style={styles.kindPillText}>{getMomentKindLabel(moment)}</Text>
                  </View>
                  {syncState ? (
                    <View
                      style={[
                        styles.syncStatusPill,
                        syncState.state === 'failed' ? styles.syncStatusPillFailed : styles.syncStatusPillPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.syncStatusText,
                          syncState.state === 'failed' ? styles.syncStatusTextFailed : styles.syncStatusTextPending,
                        ]}
                      >
                        {syncState.label}
                      </Text>
                    </View>
                  ) : null}
                  <TouchableOpacity style={styles.moreButton} onPress={() => openMomentActions(moment)}>
                    <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity activeOpacity={0.88} onPress={() => openViewer(moment.id)}>
                  {moment.type === 'text' ? (
                    <TextMomentCard
                      body={moment.text_body || ''}
                      caption={moment.caption}
                      metadata={moment.metadata}
                      bodyNumberOfLines={textDensity?.lines}
                      captionNumberOfLines={2}
                      style={[
                        styles.textMomentPreviewCard,
                        textDensity?.compact ? styles.textMomentPreviewCardCompact : null,
                      ]}
                    />
                  ) : moment.type === 'photo' && mediaUrl ? (
                    <View style={styles.mediaPreviewCard}>
                      <Image source={{ uri: mediaUrl }} style={styles.mediaPreview} contentFit="cover" />
                      {moment.caption ? (
                        <View style={styles.mediaCaptionOverlay}>
                          <Text style={styles.mediaCaptionText} numberOfLines={2}>
                            {moment.caption}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.videoPreviewSurface}>
                      <View style={styles.videoPreviewIcon}>
                        <MaterialCommunityIcons
                          name={moment.type === 'video' ? 'play-circle-outline' : 'image-outline'}
                          size={30}
                          color={theme.tint}
                        />
                      </View>
                      <View style={styles.videoPreviewBody}>
                        <Text style={styles.videoPreviewTitle}>{title}</Text>
                        <Text style={styles.videoPreviewCopy} numberOfLines={2}>
                          {moment.caption?.trim() || 'Tap to open this Moment in the viewer.'}
                        </Text>
                      </View>
                    </View>
                  )}

                    <View style={styles.momentFooterRow}>
                      <View style={styles.metaPill}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color={theme.textMuted} />
                        <Text style={styles.metaPillText}>{timeLabel}</Text>
                      </View>
                    <TouchableOpacity
                      style={styles.metaPill}
                      activeOpacity={0.8}
                      onPress={() => openReactors(moment)}
                      disabled={reactions <= 0}
                    >
                      <MaterialCommunityIcons name="heart" size={13} color={theme.tint} />
                      <Text style={styles.metaPillText}>{reactions}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.metaPill}
                      activeOpacity={0.8}
                      onPress={() => openComments(moment.id)}
                    >
                      <MaterialCommunityIcons name="comment-outline" size={13} color={theme.textMuted} />
                      <Text style={styles.metaPillText}>{comments}</Text>
                    </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.metaPill}
                        activeOpacity={0.8}
                        onPress={() => openViewers(moment)}
                      >
                        <MaterialCommunityIcons name="eye-outline" size={13} color={theme.textMuted} />
                        <Text style={styles.metaPillText}>{views}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.funnelCard}>
                      <View style={styles.funnelRow}>
                        <View style={styles.funnelNode}>
                          <Text style={styles.funnelValue}>{views}</Text>
                          <Text style={styles.funnelLabel}>Views</Text>
                        </View>
                        <View style={styles.funnelConnector}>
                          <View style={styles.funnelConnectorLine} />
                          <Text style={styles.funnelConnectorText}>{reactionRate}</Text>
                        </View>
                        <View style={styles.funnelNode}>
                          <Text style={styles.funnelValue}>{reactions}</Text>
                          <Text style={styles.funnelLabel}>Reactions</Text>
                        </View>
                        <View style={styles.funnelConnector}>
                          <View style={styles.funnelConnectorLine} />
                          <Text style={styles.funnelConnectorText}>{commentRate}</Text>
                        </View>
                        <View style={styles.funnelNode}>
                          <Text style={styles.funnelValue}>{comments}</Text>
                          <Text style={styles.funnelLabel}>Comments</Text>
                        </View>
                      </View>
                      <Text style={styles.funnelInsightText}>
                        {views > 0
                          ? `Reaction rate ${reactionRate} · Comment rate ${commentRate}`
                          : 'Waiting for first viewers'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })
        )}

        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/moments/create')}>
          <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Add Moment</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>Moments expire after 24 hours.</Text>
      </ScrollView>

      <MomentViewer
        visible={viewerVisible}
        users={viewerUsers}
        preferredMediaUrlsByMomentId={offlineMediaByMomentId}
        startUserId={user?.id ?? null}
        startMomentId={viewerStartMomentId}
        onClose={() => {
          setViewerVisible(false);
          setViewerStartMomentId(null);
        }}
      />

      <MomentCommentsModal
        visible={commentsVisible}
        momentId={commentsMomentId}
        onClose={() => {
          setCommentsVisible(false);
          setCommentsMomentId(null);
        }}
      />

      <Modal visible={reactorsVisible} transparent animationType="fade" onRequestClose={() => setReactorsVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setReactorsVisible(false)} />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View style={styles.reactorsSheet}>
            <View style={styles.reactorsHeader}>
              <View>
                <Text style={styles.reactorsTitle}>Reactions</Text>
                <Text style={styles.reactorsSubtitle}>
                  {selectedReactionMoment ? getMomentKindLabel(selectedReactionMoment) : 'Moment'}
                </Text>
              </View>
              <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setReactorsVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.reactorsList} contentContainerStyle={styles.reactorsListContent}>
              {reactorsLoading ? (
                <Text style={styles.reactorsEmptyText}>Loading reactions...</Text>
              ) : reactors.length === 0 ? (
                <Text style={styles.reactorsEmptyText}>No reactions yet.</Text>
              ) : (
                reactors.map((reaction) => {
                  const reactor = reactorProfiles[reaction.user_id];
                  const safeAvatarUrl = getSafeRemoteImageUri(reactor?.avatar_url);
                  const displayName = reaction.user_id === user?.id ? 'You' : reactor?.full_name || 'Member';
                  return (
                    <View key={reaction.id} style={styles.reactorRow}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        style={styles.reactorAvatarPressable}
                        onPress={() => openProfileFromMomentContext(reactor?.id, reaction.user_id)}
                      >
                        {safeAvatarUrl ? (
                          <Image source={{ uri: safeAvatarUrl }} style={styles.reactorAvatar} contentFit="cover" />
                        ) : (
                          <View style={styles.reactorAvatarFallback}>
                            <Text style={styles.reactorAvatarInitial}>
                              {displayName.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <View style={styles.reactorBody}>
                        <Text style={styles.reactorName}>{displayName}</Text>
                        <Text style={styles.reactorTime}>{formatTimeAgo(reaction.created_at)}</Text>
                      </View>
                      <Text style={styles.reactorEmoji}>{reaction.emoji}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={viewersVisible} transparent animationType="fade" onRequestClose={() => setViewersVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setViewersVisible(false)} />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View style={styles.reactorsSheet}>
            <View style={styles.reactorsHeader}>
              <View>
                <Text style={styles.reactorsTitle}>Views</Text>
                <Text style={styles.reactorsSubtitle}>
                  {selectedViewedMoment ? getMomentKindLabel(selectedViewedMoment) : 'Moment'}
                </Text>
              </View>
              <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setViewersVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.reactorsList} contentContainerStyle={styles.reactorsListContent}>
              {recentViewersLoading ? (
                <Text style={styles.reactorsEmptyText}>Loading viewers...</Text>
              ) : recentViewers.length === 0 ? (
                <Text style={styles.reactorsEmptyText}>No viewers yet.</Text>
              ) : (
                recentViewers.map((viewer) => {
                  const safeAvatarUrl = getSafeRemoteImageUri(viewer.avatarUrl);
                  const displayName = viewer.viewerUserId === user?.id ? 'You' : viewer.fullName || 'Member';
                  return (
                    <View key={`${viewer.viewerUserId}:${viewer.viewedAt}`} style={styles.reactorRow}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        style={styles.reactorAvatarPressable}
                        onPress={() => openProfileFromMomentContext(viewer.profileId, viewer.viewerUserId)}
                      >
                        {safeAvatarUrl ? (
                          <Image source={{ uri: safeAvatarUrl }} style={styles.reactorAvatar} contentFit="cover" />
                        ) : (
                          <View style={styles.reactorAvatarFallback}>
                            <Text style={styles.reactorAvatarInitial}>
                              {displayName.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <View style={styles.reactorBody}>
                        <Text style={styles.reactorName}>{displayName}</Text>
                        <Text style={styles.reactorTime}>{formatTimeAgo(viewer.viewedAt)}</Text>
                        <View style={styles.viewerTagRow}>
                          <View style={styles.viewerTag}>
                            <Text style={styles.viewerTagText}>{viewer.isMatch ? 'Match' : 'New'}</Text>
                          </View>
                          <View style={styles.viewerTag}>
                            <Text style={styles.viewerTagText}>{formatCountryAudienceLabel(viewer.currentCountryCode)}</Text>
                          </View>
                          <View style={styles.viewerTag}>
                            <Text style={styles.viewerTagText}>
                              {viewer.isRepeatViewer ? `Repeat · ${viewer.viewedMomentCount}` : 'First-time'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <MaterialCommunityIcons name="eye-outline" size={18} color={theme.tint} />
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    topGlow: {
      position: 'absolute',
      left: -50,
      right: -50,
      top: -40,
      height: 220,
    },
    header: {
      paddingTop: 8,
      paddingHorizontal: 18,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: 'transparent',
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.74 : 0.84),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    headerTitle: { fontSize: 18, fontFamily: 'Archivo_700Bold', color: theme.text },
    headerSpacer: { width: 40 },
    content: { padding: 18, paddingBottom: 40 },
    heroCard: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      marginBottom: 16,
      overflow: 'hidden',
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.22 : 0.56),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.14),
      marginBottom: 12,
    },
    heroBadgeText: {
      color: theme.text,
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: 'PlayfairDisplay_700Bold',
      marginBottom: 8,
    },
    heroSubtitle: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: 'Manrope_600SemiBold',
      maxWidth: 360,
    },
    heroStatsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    heroStatPill: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.background, isDark ? 0.18 : 0.48),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      minWidth: 88,
    },
    heroStatValue: {
      color: theme.text,
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
      marginBottom: 2,
    },
    heroStatLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    heroInsightCard: {
      marginTop: 14,
      padding: 14,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.background, isDark ? 0.2 : 0.56),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      gap: 6,
    },
    heroInsightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    heroInsightBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    heroInsightBadgeText: {
      color: theme.tint,
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    heroInsightAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.16),
    },
    heroInsightActionText: {
      color: theme.tint,
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
    },
    heroInsightTitle: {
      color: theme.text,
      fontSize: 16,
      fontFamily: 'Archivo_700Bold',
    },
    heroInsightMetric: {
      color: theme.text,
      fontSize: 13,
      fontFamily: 'Manrope_800ExtraBold',
    },
    heroInsightSummary: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_600SemiBold',
    },
    emptyCard: {
      padding: 18,
      borderRadius: 22,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.92 : 0.78),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      marginBottom: 16,
    },
    emptyBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.3 : 0.14),
      marginBottom: 12,
    },
    emptyBadgeText: {
      color: theme.tint,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    emptyTitle: { fontSize: 16, fontFamily: 'Archivo_700Bold', color: theme.text, marginBottom: 6 },
    emptySubtitle: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', lineHeight: 20 },
    emptyHighlights: { marginTop: 14, gap: 10 },
    emptyHighlightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    emptyHighlightText: { flex: 1, color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    emptyActionButton: {
      marginTop: 16,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    emptyActionText: { color: Colors.light.background, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    momentCard: {
      padding: 14,
      borderRadius: 22,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.94 : 0.84),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      marginBottom: 14,
    },
    momentCardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 12,
    },
    kindPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.26 : 0.14),
    },
    kindPillText: {
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    syncStatusPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    syncStatusPillPending: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.16),
    },
    syncStatusPillFailed: {
      backgroundColor: withAlpha(theme.danger, isDark ? 0.14 : 0.08),
      borderColor: withAlpha(theme.danger, isDark ? 0.26 : 0.18),
    },
    syncStatusText: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 10.5,
      letterSpacing: 0.2,
    },
    syncStatusTextPending: {
      color: theme.tint,
    },
    syncStatusTextFailed: {
      color: theme.danger,
    },
    moreButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.16 : 0.64),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    textMomentPreviewCard: {
      minHeight: 156,
    },
    textMomentPreviewCardCompact: {
      minHeight: 128,
    },
    mediaPreviewCard: {
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    mediaPreview: {
      width: '100%',
      aspectRatio: 1.22,
    },
    mediaCaptionOverlay: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: 'rgba(7,17,18,0.66)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    mediaCaptionText: {
      color: '#f8fcfb',
      fontSize: 13,
      lineHeight: 18,
      fontFamily: 'Manrope_700Bold',
    },
    videoPreviewSurface: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 20,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    videoPreviewIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.58),
    },
    videoPreviewBody: {
      flex: 1,
    },
    videoPreviewTitle: {
      color: theme.text,
      fontSize: 16,
      fontFamily: 'Archivo_700Bold',
      marginBottom: 4,
    },
    videoPreviewCopy: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_600SemiBold',
    },
    momentFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 14,
    },
    funnelCard: {
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.05),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
      gap: 10,
    },
    funnelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 4,
    },
    funnelNode: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
    },
    funnelValue: {
      color: theme.text,
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
    },
    funnelLabel: {
      marginTop: 3,
      color: theme.textMuted,
      fontSize: 10.5,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    funnelConnector: {
      width: 52,
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    funnelConnectorLine: {
      width: '100%',
      height: 1,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
    },
    funnelConnectorText: {
      color: theme.tint,
      fontSize: 10.5,
      fontFamily: 'Manrope_800ExtraBold',
    },
    funnelInsightText: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_600SemiBold',
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.035),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    metaPillText: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.52)',
    },
    sheetWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    reactorsSheet: {
      backgroundColor: theme.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 22,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      maxHeight: '62%',
    },
    reactorsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    reactorsTitle: {
      color: theme.text,
      fontSize: 17,
      fontFamily: 'Archivo_700Bold',
    },
    reactorsSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      marginTop: 2,
    },
    sheetCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    reactorsList: {
      flexGrow: 0,
    },
    reactorsListContent: {
      gap: 10,
      paddingBottom: 6,
    },
    reactorsEmptyText: {
      color: theme.textMuted,
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      textAlign: 'center',
      paddingVertical: 18,
    },
    reactorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.92 : 0.82),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.06),
    },
    reactorAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    reactorAvatarPressable: {
      borderRadius: 21,
    },
    reactorAvatarFallback: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    reactorAvatarInitial: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 15,
    },
    reactorBody: {
      flex: 1,
    },
    reactorName: {
      color: theme.text,
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      marginBottom: 2,
    },
    reactorTime: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
    },
    viewerTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    viewerTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.2 : 0.12),
    },
    viewerTagText: {
      color: theme.tint,
      fontSize: 10.5,
      fontFamily: 'Manrope_800ExtraBold',
    },
    reactorEmoji: {
      fontSize: 22,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
      borderRadius: 18,
      backgroundColor: theme.tint,
      marginTop: 8,
    },
    addButtonText: { color: Colors.light.background, fontFamily: 'Manrope_700Bold' },
    footerText: { marginTop: 16, color: theme.textMuted, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  });
