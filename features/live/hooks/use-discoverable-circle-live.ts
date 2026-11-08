import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type DiscoverableCircleLivePreview = {
  sessionId: string;
  circleId: string;
  circleName: string;
  circleSlug: string | null;
  title: string;
  description: string | null;
  status: string;
  scheduledStart: string | null;
  posterPath: string | null;
  reachScope: string;
  accessPolicy: string;
  countryCode: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  memberCount: number;
  viewerMembershipStatus: string | null;
};

const mapPreview = (row: any): DiscoverableCircleLivePreview => ({
  sessionId: String(row.session_id),
  circleId: String(row.circle_id),
  circleName: String(row.circle_name ?? 'Circle'),
  circleSlug: row.circle_slug ? String(row.circle_slug) : null,
  title: String(row.live_title ?? 'Circle Live'),
  description: row.live_description ? String(row.live_description) : null,
  status: String(row.live_status ?? 'scheduled'),
  scheduledStart: row.scheduled_start ? String(row.scheduled_start) : null,
  posterPath: row.poster_path ? String(row.poster_path) : null,
  reachScope: String(row.reach_scope ?? 'country'),
  accessPolicy: String(row.access_policy ?? 'open'),
  countryCode: row.country_code ? String(row.country_code) : null,
  countryName: row.country_name ? String(row.country_name) : null,
  region: row.region ? String(row.region) : null,
  city: row.city ? String(row.city) : null,
  memberCount: Number(row.member_count ?? 0),
  viewerMembershipStatus: row.viewer_membership_status ? String(row.viewer_membership_status) : null,
});

export const useDiscoverableCircleLive = () => {
  const { authStatus } = useAuth();
  const [previews, setPreviews] = useState<DiscoverableCircleLivePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authStatus !== 'authenticated') {
      setPreviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc(
        'rpc_list_discoverable_circle_live_previews',
        { p_limit: 24 },
      );
      if (rpcError) throw rpcError;
      setPreviews((data ?? []).map(mapPreview));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'circle_live_previews_unavailable');
    } finally {
      setLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { previews, loading, error, refresh };
};
