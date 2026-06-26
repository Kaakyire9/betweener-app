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
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import { supabase } from '@/lib/supabase';
import type { MomentMetadata } from '@/lib/moment-text-style';

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
};

export type MomentUser = {
  userId: string;
  profileId: string | null;
  name: string;
  avatarUrl: string | null;
  moments: Moment[];
  latestMoment?: Moment;
  isOwn: boolean;
};

type UseMomentsParams = {
  currentUserId?: string | null;
  currentUserProfile?: {
    id?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    photos?: string[] | null;
  } | null;
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
      .select('id,user_id,full_name,avatar_url,photos')
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
    }),
    [currentUserProfileAvatarUrl, currentUserProfileId, currentUserProfileName, currentUserProfilePhotosSignature],
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
        console.log('[useMoments] fetch error', error);
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
      const missingUserIds = userIds.filter((id) => !hasUsableMomentProfileSnapshot(existingProfiles[id]));
      const nextProfiles: Record<string, MomentProfile> = {};
      userIds.forEach((userId) => {
        const existing = existingProfiles[userId];
        if (hasUsableMomentProfileSnapshot(existing)) nextProfiles[userId] = existing;
      });

      if (missingUserIds.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, user_id, full_name, avatar_url, photos')
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
          };
        });
      }

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
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        void refresh();
      }, 350);
    };

    const channel = supabase
      .channel(`moments-updates:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moments' },
        scheduleRefresh,
      );

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
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
        };
      })
      .sort((a, b) => {
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
