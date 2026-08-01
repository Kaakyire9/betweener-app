import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  readMomentsFeedSnapshot,
  resolveOfflineMomentMediaMap,
  writeMomentCommentsSnapshot,
  writeMomentsFeedSnapshot,
  writeMomentReactorsSnapshot,
} from '@/lib/offline/moments-store';
import { readMeProfileSnapshot } from '@/lib/offline/me-store';
import { reconcileMomentRowsWithOfflineMutations } from '@/lib/offline/moment-mutation-reconciler';
import { subscribeToOfflineMutationEvents } from '@/lib/offline/mutation-queue';
import {
  getLocationAffinityStrength,
  getLocationConnectionInsight,
} from '@/lib/location/location-intelligence';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import { supabase } from '@/lib/supabase';
import type { MomentMetadata } from '@/lib/moment-text-style';
import { isLikelyNetworkError } from '@/lib/network';
import { addEventListener as addNetInfoListener } from '@react-native-community/netinfo';

export type MomentType = 'video' | 'photo' | 'text';
export type MomentVisibility = 'public' | 'matches' | 'vibe_check_approved' | 'private';

export type Moment = {
  id: string;
  user_id: string;
  type: MomentType;
  media_url: string | null;
  metadata: MomentMetadata | null;
  thumbnail_url: string | null;
  text_body: string | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
  visibility: MomentVisibility;
  is_deleted: boolean;
};

export type MomentProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  photos?: string[] | null;
  city?: string | null;
  region?: string | null;
  current_country?: string | null;
  current_country_code?: string | null;
  locality_geoname_id?: number | null;
  locality_district?: string | null;
  roots_visibility?: string | null;
  roots_region?: string | null;
  roots_locality?: string | null;
  roots_locality_geoname_id?: number | null;
  location_affinity_reason_code?: string | null;
  location_affinity_strength?: number | null;
  location_affinity_short_text?: string | null;
  location_affinity_long_text?: string | null;
};

export type MomentUser = {
  userId: string;
  profileId: string | null;
  name: string;
  avatarUrl: string | null;
  moments: Moment[];
  latestMoment?: Moment;
  isOwn: boolean;
  locationInsight?: string | null;
  locationAffinityScore?: number;
};

type UseMomentsParams = {
  currentUserId?: string | null;
  currentUserProfile?: {
    id?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    photos?: string[] | null;
    city?: string | null;
    region?: string | null;
    current_country?: string | null;
    current_country_code?: string | null;
    locality_geoname_id?: number | null;
    locality_district?: string | null;
    roots_visibility?: string | null;
    roots_region?: string | null;
    roots_locality?: string | null;
    roots_locality_geoname_id?: number | null;
  } | null;
};

type MomentsRealtimeEntry = {
  channel: ReturnType<typeof supabase.channel> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  listeners: Set<() => void>;
  notifyTimer: ReturnType<typeof setTimeout> | null;
  startPromise: Promise<void> | null;
};

const momentsRealtimeEntries = new Map<string, MomentsRealtimeEntry>();

const notifyMomentsRealtimeListeners = (entry: MomentsRealtimeEntry) => {
  if (entry.notifyTimer) clearTimeout(entry.notifyTimer);
  entry.notifyTimer = setTimeout(() => {
    entry.notifyTimer = null;
    entry.listeners.forEach((listener) => listener());
  }, 350);
};

const startMomentsRealtimeEntry = (userId: string, entry: MomentsRealtimeEntry) => {
  if (entry.channel || entry.startPromise) return;

  entry.startPromise = (async () => {
    const channelName = `moments-updates:${userId}`;
    const realtimeTopic = `realtime:${channelName}`;
    const staleChannel = supabase.getChannels().find((channel) => channel.topic === realtimeTopic);

    // Fast Refresh can retain the Supabase client after recreating this module.
    if (staleChannel) await supabase.removeChannel(staleChannel);

    if (entry.listeners.size === 0 || momentsRealtimeEntries.get(userId) !== entry) return;

    const notify = () => notifyMomentsRealtimeListeners(entry);
    entry.channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moments' }, notify)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') notify();
      });
  })()
    .catch(() => notifyMomentsRealtimeListeners(entry))
    .finally(() => {
      entry.startPromise = null;
    });
};

const subscribeMomentsRealtime = (userId: string, listener: () => void) => {
  let entry = momentsRealtimeEntries.get(userId);
  if (!entry) {
    entry = {
      channel: null,
      cleanupTimer: null,
      listeners: new Set<() => void>(),
      notifyTimer: null,
      startPromise: null,
    };
    momentsRealtimeEntries.set(userId, entry);
  }

  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
  entry.listeners.add(listener);
  startMomentsRealtimeEntry(userId, entry);

  return () => {
    if (momentsRealtimeEntries.get(userId) !== entry) return;
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0 || entry.cleanupTimer) return;

    entry.cleanupTimer = setTimeout(() => {
      entry.cleanupTimer = null;
      if (entry.listeners.size > 0 || momentsRealtimeEntries.get(userId) !== entry) return;

      momentsRealtimeEntries.delete(userId);
      if (entry.notifyTimer) clearTimeout(entry.notifyTimer);
      entry.notifyTimer = null;
      const channel = entry.channel;
      entry.channel = null;
      if (channel) void supabase.removeChannel(channel);
    }, 1_000);
  };
};

const getMomentFreshnessScore = (moment?: Moment) => {
  if (!moment?.created_at) return 0;
  const createdAtMs = new Date(moment.created_at).getTime();
  if (!Number.isFinite(createdAtMs)) return 0;
  const hoursAgo = Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60));
  return Math.max(0, 24 - hoursAgo) / 4;
};

const resolveMomentAvatarUrl = (profile?: {
  avatar_url?: string | null;
  photos?: string[] | null;
} | null) => {
  const avatar = normalizeProfilePhotoUri(profile?.avatar_url);
  if (avatar) return avatar;
  const photos = Array.isArray(profile?.photos) ? profile.photos : [];
  const firstPhoto = photos.find((photo) => normalizeProfilePhotoUri(photo));
  return firstPhoto ? normalizeProfilePhotoUri(firstPhoto) : null;
};

const hasUsableMomentProfileSnapshot = (profile?: MomentProfile | null) =>
  Boolean(profile?.full_name || resolveMomentAvatarUrl(profile));

const hasMomentLocationSnapshot = (profile?: MomentProfile | null) =>
  Boolean(
    profile?.city ||
      profile?.region ||
      profile?.current_country ||
      profile?.current_country_code ||
      profile?.locality_geoname_id != null ||
      profile?.roots_region ||
      profile?.roots_locality ||
      profile?.roots_locality_geoname_id != null,
  );

async function primeInteractedMomentSnapshots(params: {
  currentUserId: string;
  currentUserProfile?: UseMomentsParams['currentUserProfile'];
  moments: Moment[];
  profilesById: Record<string, MomentProfile>;
}) {
  const visibleMomentIds = Array.from(new Set(params.moments.map((moment) => moment.id).filter(Boolean)));
  if (visibleMomentIds.length === 0) return;

  const [myReactionsRes, myCommentsRes] = await Promise.all([
    supabase
      .from('moment_reactions')
      .select('moment_id')
      .eq('user_id', params.currentUserId)
      .in('moment_id', visibleMomentIds),
    supabase
      .from('moment_comments')
      .select('moment_id')
      .eq('user_id', params.currentUserId)
      .eq('is_deleted', false)
      .in('moment_id', visibleMomentIds),
  ]);

  const interactedMomentIds = Array.from(
    new Set([
      ...((myReactionsRes.data || []).map((row: any) => row?.moment_id).filter(Boolean) as string[]),
      ...((myCommentsRes.data || []).map((row: any) => row?.moment_id).filter(Boolean) as string[]),
    ]),
  );

  if (interactedMomentIds.length === 0) return;

  const [reactionsRes, commentsRes] = await Promise.all([
    supabase
      .from('moment_reactions')
      .select('id,moment_id,emoji,user_id,created_at')
      .in('moment_id', interactedMomentIds),
    supabase
      .from('moment_comments')
      .select('id,moment_id,user_id,body,created_at,parent_comment_id,is_deleted')
      .eq('is_deleted', false)
      .in('moment_id', interactedMomentIds)
      .order('created_at', { ascending: false }),
  ]);

  const reactions = (reactionsRes.data || []) as {
    id: string;
    moment_id: string;
    emoji: string;
    user_id: string;
    created_at: string;
  }[];
  const comments = (commentsRes.data || []) as {
    id: string;
    moment_id: string;
    user_id: string;
    body: string;
    created_at: string;
    parent_comment_id: string | null;
    is_deleted: boolean;
  }[];

  const interactionUserIds = Array.from(
    new Set([
      ...reactions.map((row) => row.user_id),
      ...comments.map((row) => row.user_id),
    ].filter(Boolean)),
  );

  const profilesByUserId: Record<string, { id: string | null; full_name: string | null; avatar_url: string | null }> = {};
  Object.entries(params.profilesById).forEach(([userId, profile]) => {
    profilesByUserId[userId] = {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    };
  });
  if (params.currentUserId) {
    profilesByUserId[params.currentUserId] = {
      id: params.currentUserProfile?.id ? String(params.currentUserProfile.id) : null,
      full_name: params.currentUserProfile?.full_name ?? 'You',
      avatar_url: resolveMomentAvatarUrl(params.currentUserProfile),
    };
  }

  const missingProfileUserIds = interactionUserIds.filter((userId) => !profilesByUserId[userId]);
  if (missingProfileUserIds.length > 0) {
    const { data: interactionProfiles } = await supabase
      .from('profiles')
      .select('id,user_id,full_name,avatar_url,photos,city,region,current_country,current_country_code,locality_geoname_id,locality_district,roots_visibility,roots_region,roots_locality,roots_locality_geoname_id')
      .in('user_id', missingProfileUserIds);
    (interactionProfiles || []).forEach((profile: any) => {
      if (!profile?.user_id) return;
      profilesByUserId[profile.user_id] = {
        id: profile.id ?? null,
        full_name: profile.full_name ?? null,
        avatar_url: resolveMomentAvatarUrl(profile),
      };
    });
  }

  await Promise.all(
    interactedMomentIds.flatMap((momentId) => {
      const momentReactions = reactions
        .filter((row) => row.moment_id === momentId)
        .map(({ id, emoji, user_id, created_at }) => ({ id, emoji, user_id, created_at }));
      const momentComments = comments
        .filter((row) => row.moment_id === momentId)
        .map(({ id, moment_id, user_id, body, created_at, parent_comment_id, is_deleted }) => ({
          id,
          moment_id,
          user_id,
          body,
          created_at,
          parent_comment_id: parent_comment_id ?? null,
          is_deleted,
        }));
      const scopedUserIds = Array.from(
        new Set([
          ...momentReactions.map((row) => row.user_id),
          ...momentComments.map((row) => row.user_id),
        ]),
      );
      const scopedProfiles = scopedUserIds.reduce<Record<string, { id: string | null; full_name: string | null; avatar_url: string | null }>>(
        (acc, userId) => {
          const profile = profilesByUserId[userId];
          if (profile) acc[userId] = profile;
          return acc;
        },
        {},
      );
      return [
        writeMomentReactorsSnapshot(params.currentUserId, momentId, {
          reactions: momentReactions,
          profilesByUserId: scopedProfiles,
        }),
        writeMomentCommentsSnapshot(params.currentUserId, momentId, {
          comments: momentComments,
          profilesByUserId: scopedProfiles,
        }),
      ];
    }),
  );
}

export function useMoments({ currentUserId, currentUserProfile }: UseMomentsParams) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, MomentProfile>>({});
  const [offlineMediaByMomentId, setOfflineMediaByMomentId] = useState<Record<string, string>>({});
  const [currentUserMediaOverride, setCurrentUserMediaOverride] = useState<{
    avatar_url: string | null;
    photos: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const profilesByIdRef = useRef<Record<string, MomentProfile>>({});
  const lastPrimedVisibleMomentIdsKeyRef = useRef<string | null>(null);
  const refreshAfterReconnectRef = useRef(false);
  const currentUserProfileId = currentUserProfile?.id ? String(currentUserProfile.id) : null;
  const currentUserProfileName = currentUserProfile?.full_name ?? null;
  const rawCurrentUserProfileAvatarUrl = currentUserProfile?.avatar_url ?? null;
  const rawCurrentUserProfilePhotos = useMemo(
    () =>
      Array.isArray(currentUserProfile?.photos)
        ? currentUserProfile.photos.filter((photo): photo is string => typeof photo === 'string')
        : [],
    [currentUserProfile?.photos],
  );
  const currentUserProfileAvatarUrl =
    currentUserMediaOverride?.avatar_url ?? rawCurrentUserProfileAvatarUrl;
  const currentUserProfilePhotos = currentUserMediaOverride?.photos ?? rawCurrentUserProfilePhotos;
  const currentUserProfilePhotosSignature = useMemo(
    () => currentUserProfilePhotos.join('|'),
    [currentUserProfilePhotos],
  );
  const loadCurrentUserMediaOverride = useCallback(async () => {
    if (!currentUserProfileId) {
      setCurrentUserMediaOverride(null);
      return null;
    }
    const snapshot = await readMeProfileSnapshot(currentUserProfileId);
    const nextAvatarUrl =
      typeof snapshot?.avatarUrl === 'string' && snapshot.avatarUrl.trim().length > 0
        ? snapshot.avatarUrl
        : null;
    const nextPhotos = Array.isArray(snapshot?.photos)
      ? snapshot.photos.filter((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0)
      : [];
    const nextValue =
      nextAvatarUrl || nextPhotos.length > 0
        ? {
            avatar_url: nextAvatarUrl,
            photos: nextPhotos,
          }
        : null;
    setCurrentUserMediaOverride(nextValue);
    return nextValue;
  }, [currentUserProfileId]);
  const currentUserProfileSnapshot = useMemo(
    () => ({
      id: currentUserProfileId,
      full_name: currentUserProfileName,
      avatar_url: currentUserProfileAvatarUrl,
      photos: currentUserProfilePhotos,
      city: currentUserProfile?.city ?? null,
      region: currentUserProfile?.region ?? null,
      current_country: currentUserProfile?.current_country ?? null,
      current_country_code: currentUserProfile?.current_country_code ?? null,
      locality_geoname_id: currentUserProfile?.locality_geoname_id ?? null,
      locality_district: currentUserProfile?.locality_district ?? null,
      roots_visibility: currentUserProfile?.roots_visibility ?? null,
      roots_region: currentUserProfile?.roots_region ?? null,
      roots_locality: currentUserProfile?.roots_locality ?? null,
      roots_locality_geoname_id: currentUserProfile?.roots_locality_geoname_id ?? null,
    }),
    [
      currentUserProfile?.city,
      currentUserProfile?.current_country,
      currentUserProfile?.current_country_code,
      currentUserProfile?.locality_district,
      currentUserProfile?.locality_geoname_id,
      currentUserProfile?.region,
      currentUserProfile?.roots_locality,
      currentUserProfile?.roots_locality_geoname_id,
      currentUserProfile?.roots_region,
      currentUserProfile?.roots_visibility,
      currentUserProfileAvatarUrl,
      currentUserProfileId,
      currentUserProfileName,
      currentUserProfilePhotosSignature,
    ],
  );

  useEffect(() => {
    void loadCurrentUserMediaOverride();
  }, [loadCurrentUserMediaOverride]);

  // Offline-store first: hydrate last known feed quickly, then refresh in background.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      const cached = await readMomentsFeedSnapshot(currentUserId);
      if (cancelled || !cached) return;
      if (Array.isArray(cached.moments) && cached.moments.length > 0) {
        setMoments((prev) => (prev.length === 0 ? (cached.moments as Moment[]) : prev));
      }
      if (cached.profilesById && Object.keys(cached.profilesById).length > 0) {
        profilesByIdRef.current = cached.profilesById;
        setProfilesById((prev) => (Object.keys(prev).length === 0 ? cached.profilesById : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const refresh = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const latestCurrentUserMediaOverride = await loadCurrentUserMediaOverride();
      const effectiveCurrentUserProfileSnapshot = latestCurrentUserMediaOverride
        ? {
            ...currentUserProfileSnapshot,
            avatar_url: latestCurrentUserMediaOverride.avatar_url,
            photos: latestCurrentUserMediaOverride.photos,
          }
        : currentUserProfileSnapshot;
      const { data, error } = await supabase
        .from('moments')
        .select('id,user_id,type,media_url,metadata,thumbnail_url,text_body,caption,created_at,expires_at,visibility,is_deleted')
        .eq('is_deleted', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error || !data) {
        if (isLikelyNetworkError(error)) {
          refreshAfterReconnectRef.current = true;
        } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[useMoments] fetch error', error);
        }
        return;
      }

      const cleaned = (data as Moment[]).filter((m) => !m.is_deleted);
      const reconciled = await reconcileMomentRowsWithOfflineMutations({
        currentUserId,
        moments: cleaned,
      });
      setMoments(reconciled.moments);
      const visibleMomentIdsKey = reconciled.moments.map((moment) => moment.id).join('|');

      const userIds = Array.from(new Set(reconciled.moments.map((m) => m.user_id))).filter(
        (id) => id && id !== currentUserId,
      );
      if (userIds.length === 0) {
        profilesByIdRef.current = {};
        setProfilesById({});
        setMoments(reconciled.moments);
        await writeMomentsFeedSnapshot(currentUserId, { moments: reconciled.moments, profilesById: {} });
        lastPrimedVisibleMomentIdsKeyRef.current = visibleMomentIdsKey;
        return;
      }

      const existingProfiles = profilesByIdRef.current;
      const missingUserIds = userIds.filter((id) => {
        const profile = existingProfiles[id];
        return !hasUsableMomentProfileSnapshot(profile) || !hasMomentLocationSnapshot(profile);
      });
      const nextProfiles: Record<string, MomentProfile> = {};
      userIds.forEach((userId) => {
        const existing = existingProfiles[userId];
        if (hasUsableMomentProfileSnapshot(existing)) nextProfiles[userId] = existing;
      });

      const affinityMap: Record<
        string,
        {
          reason_code?: string | null;
          strength?: number | null;
          short_text?: string | null;
          long_text?: string | null;
        }
      > = {};

      if (missingUserIds.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, user_id, full_name, avatar_url, photos, city, region, current_country, current_country_code, locality_geoname_id, locality_district, roots_visibility, roots_region, roots_locality, roots_locality_geoname_id')
          .in('user_id', missingUserIds);

        if (profilesErr) {
          console.log('[useMoments] profiles fetch error', profilesErr);
          return;
        }

        (profiles || []).forEach((p: any) => {
          if (!p.user_id) return;
          nextProfiles[p.user_id] = {
            id: p.id,
            full_name: p.full_name ?? null,
            avatar_url: resolveMomentAvatarUrl(p),
            photos: Array.isArray(p.photos) ? p.photos : null,
            city: p.city ?? null,
            region: p.region ?? null,
            current_country: p.current_country ?? null,
            current_country_code: p.current_country_code ?? null,
            locality_geoname_id: p.locality_geoname_id ?? null,
            locality_district: p.locality_district ?? null,
            roots_visibility: p.roots_visibility ?? null,
            roots_region: p.roots_region ?? null,
            roots_locality: p.roots_locality ?? null,
            roots_locality_geoname_id: p.roots_locality_geoname_id ?? null,
          };
        });
      }

      if (currentUserProfileId && userIds.length > 0) {
        const { data: affinityRows, error: affinityErr } = await supabase.rpc(
          'compute_location_affinities' as any,
          {
            p_viewer_profile_id: currentUserProfileId,
            p_candidate_profile_ids: userIds,
          } as any,
        );

        if (affinityErr) {
          console.log('[useMoments] location affinity fetch error', affinityErr);
        } else if (Array.isArray(affinityRows)) {
          (affinityRows as any[]).forEach((row) => {
            if (!row?.profile_id) return;
            affinityMap[String(row.profile_id)] = {
              reason_code: row.reason_code ?? null,
              strength:
                typeof row.strength === 'number'
                  ? row.strength
                  : typeof row.strength === 'string'
                    ? Number(row.strength)
                    : null,
              short_text: row.short_text ?? null,
              long_text: row.long_text ?? null,
            };
          });
        }
      }

      userIds.forEach((userId) => {
        const profile = nextProfiles[userId];
        if (!profile) return;
        const affinity = affinityMap[userId];
        nextProfiles[userId] = {
          ...profile,
          location_affinity_reason_code:
            affinity?.reason_code ?? profile.location_affinity_reason_code ?? null,
          location_affinity_strength:
            affinity?.strength ?? profile.location_affinity_strength ?? null,
          location_affinity_short_text:
            affinity?.short_text ?? profile.location_affinity_short_text ?? null,
          location_affinity_long_text:
            affinity?.long_text ?? profile.location_affinity_long_text ?? null,
        };
      });

      profilesByIdRef.current = nextProfiles;
      setProfilesById(nextProfiles);
      setMoments(reconciled.moments);
      await writeMomentsFeedSnapshot(currentUserId, { moments: reconciled.moments, profilesById: nextProfiles });
      if (lastPrimedVisibleMomentIdsKeyRef.current !== visibleMomentIdsKey) {
        lastPrimedVisibleMomentIdsKeyRef.current = visibleMomentIdsKey;
        await primeInteractedMomentSnapshots({
          currentUserId,
          currentUserProfile: effectiveCurrentUserProfileSnapshot,
          moments: reconciled.moments,
          profilesById: nextProfiles,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentUserProfileSnapshot, loadCurrentUserMediaOverride]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!currentUserId) return;
    return addNetInfoListener((state) => {
      const isReachable =
        state.isConnected !== false && state.isInternetReachable !== false;
      if (!isReachable || !refreshAfterReconnectRef.current) return;
      refreshAfterReconnectRef.current = false;
      void refresh();
    });
  }, [currentUserId, refresh]);

  useEffect(() => {
    if (!currentUserId) return;
    return subscribeMomentsRealtime(currentUserId, () => void refresh());
  }, [currentUserId, refresh]);

  useEffect(() => {
    if (!currentUserId) return;
    return subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind === 'moment_text_create' ||
        event.mutation.kind === 'moment_media_create' ||
        event.mutation.kind === 'moment_delete'
      ) {
        void refresh();
      }
    });
  }, [currentUserId, refresh]);

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

  const momentsByUser = useMemo(() => {
    const map: Record<string, Moment[]> = {};
    moments.forEach((m) => {
      if (!map[m.user_id]) map[m.user_id] = [];
      map[m.user_id].push(m);
    });
    Object.keys(map).forEach((userId) => {
      map[userId].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return map;
  }, [moments]);

  const momentUsers = useMemo<MomentUser[]>(() => {
    const list: MomentUser[] = [];

    if (currentUserId) {
      const ownMoments = momentsByUser[currentUserId] || [];
      list.push({
        userId: currentUserId,
        profileId: currentUserProfileSnapshot.id,
        name: currentUserProfileSnapshot.full_name || 'You',
        avatarUrl: resolveMomentAvatarUrl(currentUserProfileSnapshot),
        moments: ownMoments,
        latestMoment: ownMoments[0],
        isOwn: true,
      });
    }

    const others = Object.keys(momentsByUser)
      .filter((id) => id !== currentUserId)
      .map((id) => {
        const profile = profilesById[id];
        const userMoments = momentsByUser[id] || [];
        return {
          userId: id,
          profileId: profile?.id ? String(profile.id) : null,
          name: profile?.full_name || 'Member',
          avatarUrl: profile?.avatar_url || null,
          moments: userMoments,
          latestMoment: userMoments[0],
          isOwn: false,
          locationInsight: currentUserProfileSnapshot
            ? getLocationConnectionInsight(currentUserProfileSnapshot, profile, 'moment')
            : null,
          locationAffinityScore: currentUserProfileSnapshot
            ? getLocationAffinityStrength(currentUserProfileSnapshot, profile)
            : 0,
        };
      })
      .sort((a, b) => {
        const aFeedScore = getMomentFreshnessScore(a.latestMoment) + (a.locationAffinityScore ?? 0);
        const bFeedScore = getMomentFreshnessScore(b.latestMoment) + (b.locationAffinityScore ?? 0);
        if (Math.abs(bFeedScore - aFeedScore) > 0.15) {
          return bFeedScore - aFeedScore;
        }
        const aTime = a.latestMoment ? new Date(a.latestMoment.created_at).getTime() : 0;
        const bTime = b.latestMoment ? new Date(b.latestMoment.created_at).getTime() : 0;
        return bTime - aTime;
      });

    return [...list, ...others];
  }, [currentUserId, currentUserProfileSnapshot, momentsByUser, profilesById]);

  return {
    moments,
    momentsByUser,
    momentUsers,
    offlineMediaByMomentId,
    loading,
    refresh,
    setMoments,
  };
}
