import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/persisted-cache';

export type MomentType = 'video' | 'photo' | 'text';
export type MomentVisibility = 'public' | 'matches' | 'vibe_check_approved' | 'private';

export type Moment = {
  id: string;
  user_id: string;
  type: MomentType;
  media_url: string | null;
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
};

export type MomentUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  moments: Moment[];
  latestMoment?: Moment;
  isOwn: boolean;
};

type UseMomentsParams = {
  currentUserId?: string | null;
  currentUserProfile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export function useMoments({ currentUserId, currentUserProfile }: UseMomentsParams) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, MomentProfile>>({});
  const [loading, setLoading] = useState(false);
  const cacheKey = currentUserId ? `cache:moments:v1:${currentUserId}` : null;

  // Cached-first: hydrate last known moments quickly, then refresh in background.
  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      const cached = await readCache<{ moments: Moment[]; profilesById: Record<string, MomentProfile> }>(cacheKey, 5 * 60_000);
      if (cancelled || !cached) return;
      if (Array.isArray(cached.moments) && cached.moments.length > 0) {
        setMoments((prev) => (prev.length === 0 ? cached.moments : prev));
      }
      if (cached.profilesById && Object.keys(cached.profilesById).length > 0) {
        setProfilesById((prev) => (Object.keys(prev).length === 0 ? cached.profilesById : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const refresh = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('moments')
        .select('id,user_id,type,media_url,thumbnail_url,text_body,caption,created_at,expires_at,visibility,is_deleted')
        .eq('is_deleted', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error || !data) {
        console.log('[useMoments] fetch error', error);
        return;
      }

      const cleaned = (data as Moment[]).filter((m) => !m.is_deleted);
      setMoments(cleaned);

      const userIds = Array.from(new Set(cleaned.map((m) => m.user_id))).filter((id) => id && id !== currentUserId);
      if (userIds.length === 0) {
        setProfilesById({});
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url')
        .in('user_id', userIds);

      if (profilesErr) {
        console.log('[useMoments] profiles fetch error', profilesErr);
        return;
      }

      const nextProfiles: Record<string, MomentProfile> = {};
      (profiles || []).forEach((p: any) => {
        if (!p.user_id) return;
        nextProfiles[p.user_id] = {
          id: p.id,
          full_name: p.full_name ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      });
      setProfilesById(nextProfiles);

      if (cacheKey) {
        void writeCache(cacheKey, { moments: cleaned, profilesById: nextProfiles });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, currentUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel('moments-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moments' },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refresh]);

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
        name: currentUserProfile?.full_name || 'You',
        avatarUrl: currentUserProfile?.avatar_url || null,
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
  }, [currentUserId, currentUserProfile?.avatar_url, currentUserProfile?.full_name, momentsByUser, profilesById]);

  return {
    moments,
    momentsByUser,
    momentUsers,
    loading,
    refresh,
    setMoments,
  };
}
