import { supabase } from '@/lib/supabase';
import type { PremiumPlan } from '@/lib/subscriptions';

export type ProfileInterestMetrics = {
  profile_visits: number;
  intro_watches: number;
  profile_saves: number;
  full_opens: number;
  repeat_visits: number;
  intent_opens: number;
};

export type ProfileInterestPerson = {
  profile_id: string;
  name: string;
  avatar_url?: string | null;
  last_signal_at: string;
  visit_count: number;
  watched_intro: boolean;
  saved_profile: boolean;
  opened_intent: boolean;
  interest_score: number;
  interest_level: 'High Interest' | 'Medium Interest' | 'Low Interest';
  shared_values?: string[];
};

export type ProfileInterestTimelineItem = {
  id: string;
  profile_id: string;
  name: string;
  avatar_url?: string | null;
  signal: string;
  occurred_at: string;
};

export type ProfileInterestSummary = {
  plan: PremiumPlan;
  window_days: number;
  metrics: ProfileInterestMetrics;
  people: ProfileInterestPerson[];
  timeline: ProfileInterestTimelineItem[];
};

const EMPTY_METRICS: ProfileInterestMetrics = {
  profile_visits: 0,
  intro_watches: 0,
  profile_saves: 0,
  full_opens: 0,
  repeat_visits: 0,
  intent_opens: 0,
};

export async function getMyProfileInterest(): Promise<ProfileInterestSummary> {
  const { data, error } = await supabase.rpc('rpc_get_my_profile_interest' as any);
  if (error) throw error;

  const payload = (data ?? {}) as Partial<ProfileInterestSummary>;
  return {
    plan: payload.plan === 'SILVER' || payload.plan === 'GOLD' ? payload.plan : 'FREE',
    window_days: typeof payload.window_days === 'number' ? payload.window_days : 7,
    metrics: { ...EMPTY_METRICS, ...(payload.metrics ?? {}) },
    people: Array.isArray(payload.people) ? payload.people : [],
    timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
  };
}

export async function getProfileCardContext(profileIds: string[]) {
  if (profileIds.length === 0) return [];
  const { data, error } = await supabase.rpc('rpc_get_profile_card_context' as any, {
    p_profile_ids: profileIds,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function isProfileSaved(viewerProfileId: string, targetProfileId: string) {
  const { data, error } = await supabase.rpc('rpc_is_profile_saved' as any, {
    p_viewer_profile_id: viewerProfileId,
    p_target_profile_id: targetProfileId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function setProfileSaved(
  viewerProfileId: string,
  targetProfileId: string,
  saved: boolean,
) {
  const { data, error } = await supabase.rpc('rpc_set_profile_saved' as any, {
    p_viewer_profile_id: viewerProfileId,
    p_target_profile_id: targetProfileId,
    p_saved: saved,
  });
  if (error) throw error;
  return Boolean(data);
}
