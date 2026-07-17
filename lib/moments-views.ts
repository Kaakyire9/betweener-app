import { supabase } from '@/lib/supabase';

const normalizeMomentIds = (momentIds: string[]) =>
  Array.from(new Set(momentIds.map((momentId) => String(momentId || '').trim()).filter(Boolean)));

export async function markMomentViewed(momentId: string): Promise<boolean> {
  const normalizedMomentId = String(momentId || '').trim();
  if (!normalizedMomentId) return false;

  const { data, error } = await supabase.rpc('rpc_mark_moment_view', {
    p_moment_id: normalizedMomentId,
  });

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function fetchViewedMomentIds(momentIds: string[]): Promise<Set<string>> {
  const normalizedMomentIds = normalizeMomentIds(momentIds);
  if (normalizedMomentIds.length === 0) return new Set();

  const { data, error } = await supabase.rpc('rpc_get_viewed_moment_ids', {
    p_moment_ids: normalizedMomentIds,
  });

  if (error || !Array.isArray(data)) {
    return new Set();
  }

  return new Set(
    data
      .map((row: { moment_id?: string | null }) => String(row?.moment_id || '').trim())
      .filter(Boolean),
  );
}

export async function fetchMyMomentViewStats(
  momentIds: string[],
): Promise<Record<string, number> | null> {
  const normalizedMomentIds = normalizeMomentIds(momentIds);
  if (normalizedMomentIds.length === 0) return {};

  const { data, error } = await supabase.rpc('rpc_get_my_moment_view_stats', {
    p_moment_ids: normalizedMomentIds,
  });

  if (error || !Array.isArray(data)) {
    return null;
  }

  return data.reduce<Record<string, number>>((acc, row: { moment_id?: string | null; unique_viewers?: number | null }) => {
    const momentId = String(row?.moment_id || '').trim();
    if (!momentId) return acc;
    acc[momentId] = Number.isFinite(row?.unique_viewers) ? Number(row.unique_viewers) : 0;
    return acc;
  }, {});
}

export type MomentRecentViewer = {
  viewerUserId: string;
  viewedAt: string;
  profileId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  currentCountryCode: string | null;
  isMatch: boolean;
  viewedMomentCount: number;
  isRepeatViewer: boolean;
};

export type MomentViewerSegments = {
  totalViewers: number;
  matchedViewers: number;
  nonMatchViewers: number;
  ghanaViewers: number;
  abroadViewers: number;
  repeatViewers: number;
  firstTimeViewers: number;
};

export async function fetchMyMomentRecentViewers(
  momentId: string,
  limit = 40,
): Promise<MomentRecentViewer[] | null> {
  const normalizedMomentId = String(momentId || '').trim();
  if (!normalizedMomentId) return [];

  const { data, error } = await supabase.rpc('rpc_get_my_moment_recent_viewers', {
    p_moment_id: normalizedMomentId,
    p_limit: limit,
  });

  if (error || !Array.isArray(data)) {
    return null;
  }

  return data
    .map((row: {
      viewer_user_id?: string | null;
      viewed_at?: string | null;
      profile_id?: string | null;
      full_name?: string | null;
      avatar_url?: string | null;
      current_country_code?: string | null;
      is_match?: boolean | null;
      viewed_moment_count?: number | null;
      is_repeat_viewer?: boolean | null;
    }) => ({
      viewerUserId: String(row?.viewer_user_id || '').trim(),
      viewedAt: String(row?.viewed_at || '').trim(),
      profileId: row?.profile_id ? String(row.profile_id) : null,
      fullName: row?.full_name ?? null,
      avatarUrl: row?.avatar_url ?? null,
      currentCountryCode: row?.current_country_code ? String(row.current_country_code) : null,
      isMatch: Boolean(row?.is_match),
      viewedMomentCount: Number.isFinite(row?.viewed_moment_count) ? Number(row.viewed_moment_count) : 0,
      isRepeatViewer: Boolean(row?.is_repeat_viewer),
    }))
    .filter((row) => row.viewerUserId && row.viewedAt);
}

export async function fetchMyMomentViewerSegments(days = 30): Promise<MomentViewerSegments | null> {
  const { data, error } = await supabase.rpc('rpc_get_my_moment_viewer_segments', {
    p_days: days,
  });

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0] as {
    total_viewers?: number | null;
    matched_viewers?: number | null;
    non_match_viewers?: number | null;
    ghana_viewers?: number | null;
    abroad_viewers?: number | null;
    repeat_viewers?: number | null;
    first_time_viewers?: number | null;
  };

  return {
    totalViewers: Number.isFinite(row?.total_viewers) ? Number(row.total_viewers) : 0,
    matchedViewers: Number.isFinite(row?.matched_viewers) ? Number(row.matched_viewers) : 0,
    nonMatchViewers: Number.isFinite(row?.non_match_viewers) ? Number(row.non_match_viewers) : 0,
    ghanaViewers: Number.isFinite(row?.ghana_viewers) ? Number(row.ghana_viewers) : 0,
    abroadViewers: Number.isFinite(row?.abroad_viewers) ? Number(row.abroad_viewers) : 0,
    repeatViewers: Number.isFinite(row?.repeat_viewers) ? Number(row.repeat_viewers) : 0,
    firstTimeViewers: Number.isFinite(row?.first_time_viewers) ? Number(row.first_time_viewers) : 0,
  };
}
