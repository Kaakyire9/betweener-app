import { useEffect, useRef, useState } from 'react';

import { mergeViewedProfileSnapshots, writeViewedProfileSnapshot } from '@/lib/offline/profile-store';
import { fetchViewedProfile } from '@/lib/profile/fetch-viewed-profile';
import { logger } from '@/lib/telemetry/logger';
import type { UserProfile } from '@/types/user-profile';

type Options = {
  profileId: string;
  viewerProfileId?: string | null;
  cachedProfile: UserProfile | null;
  fallbackProfile: UserProfile | null;
  useCache: boolean;
  retryNonce: number;
  onCacheUpdate: (profile: UserProfile) => void;
};

export function useViewedProfileFetch({
  profileId,
  viewerProfileId,
  cachedProfile,
  fallbackProfile,
  useCache,
  retryNonce,
  onCacheUpdate,
}: Options) {
  const [fetchedProfile, setFetchedProfile] = useState<UserProfile | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchWatchdogError, setFetchWatchdogError] = useState<Error | null>(null);
  const snapshots = useRef({ cachedProfile, fallbackProfile, onCacheUpdate });
  useEffect(() => {
    snapshots.current = { cachedProfile, fallbackProfile, onCacheUpdate };
  }, [cachedProfile, fallbackProfile, onCacheUpdate]);

  const fallbackDistanceLabel = fallbackProfile?.distance;
  const fallbackDistanceKm = fallbackProfile?.distanceKm;

  useEffect(() => {
    let active = true;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!profileId || profileId === 'preview') {
        setFetchedProfile(null);
        setFetching(false);
        setFetchWatchdogError(null);
        return;
      }
      setFetching(true);
      setFetchWatchdogError(null);
      watchdog = setTimeout(() => {
        if (!active) return;
        setFetchWatchdogError(new Error('profile_view_timeout'));
        setFetching(false);
        logger.warn('[profile-view] fetch timeout', { profileId });
      }, 12_000);
      try {
        const mapped = await fetchViewedProfile({
          viewedProfileId: profileId,
          viewerProfileId: viewerProfileId ?? null,
          fallbackDistanceLabel,
          fallbackDistanceKm,
        });
        if (!active) return;
        // Cache hydration and successful cache writes must not start another request.
        const latest = snapshots.current;
        const cached = useCache && latest.cachedProfile?.id === profileId ? latest.cachedProfile : null;
        const merged = mergeViewedProfileSnapshots(cached, latest.fallbackProfile, mapped) ?? mapped;
        setFetchedProfile(merged);
        if (useCache) {
          latest.onCacheUpdate(merged);
          void writeViewedProfileSnapshot(merged, { merge: false }).catch(() => {
            // The fetched profile remains usable if best-effort persistence fails.
          });
        }
        setFetchWatchdogError(null);
      } catch {
        if (active && !(useCache && snapshots.current.cachedProfile?.id === profileId)) {
          setFetchedProfile(null);
        }
      } finally {
        clearTimeout(watchdog);
        if (active) setFetching(false);
      }
    };
    void load();
    return () => {
      active = false;
      clearTimeout(watchdog);
    };
  }, [profileId, viewerProfileId, fallbackDistanceLabel, fallbackDistanceKm, retryNonce, useCache]);

  return { fetchedProfile, setFetchedProfile, fetching, fetchWatchdogError };
}
