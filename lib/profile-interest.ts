import { supabase } from '@/lib/supabase';
import type { PremiumPlan } from '@/lib/subscriptions';

export type ProfileInterestMetrics = {
  profile_visits: number;
  unique_visitors: number;
  profile_visit_events: number;
  intro_watches: number;
  intro_watch_events: number;
  profile_saves: number;
  full_opens: number;
  full_open_events: number;
  repeat_visits: number;
  repeat_visit_events: number;
  intent_opens: number;
  intent_open_events: number;
};

export type ProfileInterestPerson = {
  profile_id: string;
  name: string;
  avatar_url?: string | null;
  last_signal_at: string;
  last_signal_type?: string;
  visit_count: number;
  profile_open_count: number;
  full_open_count: number;
  intro_play_count: number;
  intro_complete_count: number;
  intro_watch_count: number;
  profile_save_count: number;
  profile_unsave_count: number;
  intent_open_count: number;
  repeat_visit_count: number;
  watched_intro: boolean;
  saved_profile: boolean;
  opened_intent: boolean;
  dominant_signal?: string;
  interest_score: number;
  ranking_score?: number;
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

export type SavedProfileSummary = {
  profile_id: string;
  saved_at: string;
  full_name: string | null;
  age?: number | null;
  avatar_url?: string | null;
  city?: string | null;
  region?: string | null;
  current_country?: string | null;
  current_country_code?: string | null;
  premium_plan?: 'FREE' | 'SILVER' | 'GOLD' | null;
  is_new_here?: boolean;
};

const INCLUDE_SANDBOX_BADGE_PREVIEW = typeof __DEV__ !== 'undefined' && __DEV__;

export type ProfileInterestSummary = {
  plan: PremiumPlan;
  window_days: number;
  metrics: ProfileInterestMetrics;
  people: ProfileInterestPerson[];
  timeline: ProfileInterestTimelineItem[];
};

const EMPTY_METRICS: ProfileInterestMetrics = {
  profile_visits: 0,
  unique_visitors: 0,
  profile_visit_events: 0,
  intro_watches: 0,
  intro_watch_events: 0,
  profile_saves: 0,
  full_opens: 0,
  full_open_events: 0,
  repeat_visits: 0,
  repeat_visit_events: 0,
  intent_opens: 0,
  intent_open_events: 0,
};

export async function getMyProfileInterest(): Promise<ProfileInterestSummary> {
  const { data, error } = await supabase.rpc('rpc_get_my_profile_interest' as any);
  if (error) throw error;

  const payload = (data ?? {}) as Partial<ProfileInterestSummary>;
  return {
    plan: payload.plan === 'SILVER' || payload.plan === 'GOLD' ? payload.plan : 'FREE',
    window_days: typeof payload.window_days === 'number' ? payload.window_days : 7,
    metrics: { ...EMPTY_METRICS, ...(payload.metrics ?? {}) },
    people: Array.isArray(payload.people)
      ? payload.people.map((person: any) => ({
          profile_id: String(person?.profile_id ?? ''),
          name: typeof person?.name === 'string' ? person.name : 'Someone',
          avatar_url: typeof person?.avatar_url === 'string' ? person.avatar_url : null,
          last_signal_at: typeof person?.last_signal_at === 'string' ? person.last_signal_at : '',
          last_signal_type: typeof person?.last_signal_type === 'string' ? person.last_signal_type : undefined,
          visit_count: Number(person?.visit_count ?? 0),
          profile_open_count: Number(person?.profile_open_count ?? 0),
          full_open_count: Number(person?.full_open_count ?? 0),
          intro_play_count: Number(person?.intro_play_count ?? 0),
          intro_complete_count: Number(person?.intro_complete_count ?? 0),
          intro_watch_count: Number(person?.intro_watch_count ?? 0),
          profile_save_count: Number(person?.profile_save_count ?? 0),
          profile_unsave_count: Number(person?.profile_unsave_count ?? 0),
          intent_open_count: Number(person?.intent_open_count ?? 0),
          repeat_visit_count: Number(person?.repeat_visit_count ?? 0),
          watched_intro: Boolean(person?.watched_intro),
          saved_profile: Boolean(person?.saved_profile),
          opened_intent: Boolean(person?.opened_intent),
          dominant_signal: typeof person?.dominant_signal === 'string' ? person.dominant_signal : undefined,
          interest_score: Number(person?.interest_score ?? 0),
          ranking_score: Number(person?.ranking_score ?? 0),
          interest_level:
            person?.interest_level === 'High Interest' ||
            person?.interest_level === 'Medium Interest' ||
            person?.interest_level === 'Low Interest'
              ? person.interest_level
              : 'Low Interest',
          shared_values: Array.isArray(person?.shared_values) ? person.shared_values : undefined,
        }))
      : [],
    timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
  };
}

export async function getProfileCardContext(profileIds: string[]) {
  if (profileIds.length === 0) return [];
  const { data, error } = await supabase.rpc('rpc_get_profile_card_context' as any, {
    p_profile_ids: profileIds,
    p_include_sandbox_preview: INCLUDE_SANDBOX_BADGE_PREVIEW,
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

export async function getMySavedProfiles(): Promise<SavedProfileSummary[]> {
  const { data, error } = await supabase.rpc('rpc_get_my_saved_profiles' as any, {
    p_include_sandbox_preview: INCLUDE_SANDBOX_BADGE_PREVIEW,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
