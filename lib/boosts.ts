import { supabase } from '@/lib/supabase';
import type { PremiumPlan } from '@/lib/subscriptions';

export type BoostType = 'manual' | 'smart';
export type BoostAudienceMode =
  | 'for_you'
  | 'nearby'
  | 'active_now'
  | 'intent_match'
  | 'second_look';
export type BoostFocusMode = 'profile' | 'intro' | 'intent';

export type BoostOption = {
  id: string;
  label: string;
  description: string;
};

export type BoostRecommendation = {
  plan: PremiumPlan;
  has_active_boost: boolean;
  active_boost_ends_at: string | null;
  recommended_start_at: string | null;
  recommended_audience_mode: BoostAudienceMode | null;
  recommended_focus_mode: BoostFocusMode | null;
  recommendation_reason: string | null;
  best_recent_recipe: null | {
    boost_type: BoostType;
    audience_mode: BoostAudienceMode;
    focus_mode: BoostFocusMode;
    headline: string;
    summary: string;
    confidence: 'proven' | 'emerging' | 'thin_sample';
    confidence_label: string;
    confidence_note: string;
    trusted_reach: number;
    views: number;
    intro_opens: number;
    unique_savers: number;
    unique_intent_viewers: number;
    accepted_matches: number;
    recipe_score: number;
    created_at: string;
  };
  last_used_recipe: null | {
    boost_type: BoostType;
    audience_mode: BoostAudienceMode;
    focus_mode: BoostFocusMode;
    headline: string;
    summary: string;
    created_at: string;
  };
  audience_options: BoostOption[];
  focus_options: BoostOption[];
  recent_metrics: {
    unique_viewers_7d: number;
    views_7d: number;
    intro_opens_7d: number;
    saves_7d: number;
    intent_opens_7d: number;
  };
};

export type BoostAnalytics = {
  has_boost: boolean;
  analytics_meta: {
    trust_filter: string;
    is_trust_filtered: boolean;
  };
  boost: null | {
    id: string;
    starts_at: string;
    ends_at: string;
    created_at: string;
    boost_type: BoostType;
    audience_mode: BoostAudienceMode;
    focus_mode: BoostFocusMode;
    status: 'active' | 'completed';
    is_active: boolean;
  };
  metrics: {
    unique_viewers: number;
    views: number;
    unique_intro_viewers: number;
    intro_opens: number;
    unique_savers: number;
    saves: number;
    unique_intent_viewers: number;
    intent_opens: number;
    likes: number;
    accepted_matches: number;
  };
};

export type CreateBoostInput = {
  boostType: BoostType;
  audienceMode: BoostAudienceMode;
  focusMode: BoostFocusMode;
  metadata?: Record<string, unknown>;
};

export type CreatedBoost = {
  plan: PremiumPlan;
  profile_id: string;
  id: string;
  starts_at: string;
  ends_at: string;
  boost_type: BoostType;
  audience_mode: BoostAudienceMode;
  focus_mode: BoostFocusMode;
  status: 'active' | 'completed';
};

const normalizePlan = (value: unknown): PremiumPlan => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SILVER' || normalized === 'GOLD') return normalized;
  return 'FREE';
};

export const formatBoostAudienceLabel = (mode: BoostAudienceMode | string | null | undefined) => {
  switch (mode) {
    case 'nearby':
      return 'Nearby';
    case 'active_now':
      return 'Active now';
    case 'intent_match':
      return 'Intent match';
    case 'second_look':
      return 'Second look';
    default:
      return 'For you';
  }
};

export const formatBoostFocusLabel = (mode: BoostFocusMode | string | null | undefined) => {
  switch (mode) {
    case 'intro':
      return 'Intro';
    case 'intent':
      return 'Intent';
    default:
      return 'Profile';
  }
};

export const formatBoostTypeLabel = (type: BoostType | string | null | undefined) => {
  return type === 'smart' ? 'Precision boost' : 'Manual boost';
};

export async function getBoostRecommendations(): Promise<BoostRecommendation> {
  const { data, error } = await supabase.rpc('rpc_get_profile_boost_recommendations' as any);
  if (error) throw error;

  const payload = (data ?? {}) as Record<string, any>;
  return {
    plan: normalizePlan(payload.plan),
    has_active_boost: Boolean(payload.has_active_boost),
    active_boost_ends_at:
      typeof payload.active_boost_ends_at === 'string' ? payload.active_boost_ends_at : null,
    recommended_start_at:
      typeof payload.recommended_start_at === 'string' ? payload.recommended_start_at : null,
    recommended_audience_mode:
      typeof payload.recommended_audience_mode === 'string'
        ? (payload.recommended_audience_mode as BoostAudienceMode)
        : null,
    recommended_focus_mode:
      typeof payload.recommended_focus_mode === 'string'
        ? (payload.recommended_focus_mode as BoostFocusMode)
        : null,
    recommendation_reason:
      typeof payload.recommendation_reason === 'string' ? payload.recommendation_reason : null,
    best_recent_recipe:
      payload.best_recent_recipe && typeof payload.best_recent_recipe === 'object'
        ? {
            boost_type: (payload.best_recent_recipe.boost_type ?? 'manual') as BoostType,
            audience_mode: (payload.best_recent_recipe.audience_mode ?? 'for_you') as BoostAudienceMode,
            focus_mode: (payload.best_recent_recipe.focus_mode ?? 'profile') as BoostFocusMode,
            headline: String(payload.best_recent_recipe.headline ?? ''),
            summary: String(payload.best_recent_recipe.summary ?? ''),
            confidence: (payload.best_recent_recipe.confidence ?? 'thin_sample') as 'proven' | 'emerging' | 'thin_sample',
            confidence_label: String(payload.best_recent_recipe.confidence_label ?? 'Thin sample'),
            confidence_note: String(payload.best_recent_recipe.confidence_note ?? ''),
            trusted_reach: Number(payload.best_recent_recipe.trusted_reach ?? 0),
            views: Number(payload.best_recent_recipe.views ?? 0),
            intro_opens: Number(payload.best_recent_recipe.intro_opens ?? 0),
            unique_savers: Number(payload.best_recent_recipe.unique_savers ?? 0),
            unique_intent_viewers: Number(payload.best_recent_recipe.unique_intent_viewers ?? 0),
            accepted_matches: Number(payload.best_recent_recipe.accepted_matches ?? 0),
            recipe_score: Number(payload.best_recent_recipe.recipe_score ?? 0),
            created_at: String(payload.best_recent_recipe.created_at ?? ''),
          }
        : null,
    last_used_recipe:
      payload.last_used_recipe && typeof payload.last_used_recipe === 'object'
        ? {
            boost_type: (payload.last_used_recipe.boost_type ?? 'manual') as BoostType,
            audience_mode: (payload.last_used_recipe.audience_mode ?? 'for_you') as BoostAudienceMode,
            focus_mode: (payload.last_used_recipe.focus_mode ?? 'profile') as BoostFocusMode,
            headline: String(payload.last_used_recipe.headline ?? ''),
            summary: String(payload.last_used_recipe.summary ?? ''),
            created_at: String(payload.last_used_recipe.created_at ?? ''),
          }
        : null,
    audience_options: Array.isArray(payload.audience_options) ? payload.audience_options : [],
    focus_options: Array.isArray(payload.focus_options) ? payload.focus_options : [],
    recent_metrics: {
      unique_viewers_7d: Number(payload?.recent_metrics?.unique_viewers_7d ?? 0),
      views_7d: Number(payload?.recent_metrics?.views_7d ?? 0),
      intro_opens_7d: Number(payload?.recent_metrics?.intro_opens_7d ?? 0),
      saves_7d: Number(payload?.recent_metrics?.saves_7d ?? 0),
      intent_opens_7d: Number(payload?.recent_metrics?.intent_opens_7d ?? 0),
    },
  };
}

export async function getRecentBoostAnalytics(): Promise<BoostAnalytics> {
  const { data, error } = await supabase.rpc('rpc_get_my_recent_boost_analytics' as any);
  if (error) throw error;

  const payload = (data ?? {}) as Record<string, any>;
  return {
    has_boost: Boolean(payload.has_boost),
    analytics_meta: {
      trust_filter: String(payload?.analytics_meta?.trust_filter ?? 'trusted_viewers_only'),
      is_trust_filtered: Boolean(payload?.analytics_meta?.is_trust_filtered ?? true),
    },
    boost:
      payload.boost && typeof payload.boost === 'object'
        ? {
            id: String(payload.boost.id ?? ''),
            starts_at: String(payload.boost.starts_at ?? ''),
            ends_at: String(payload.boost.ends_at ?? ''),
            created_at: String(payload.boost.created_at ?? ''),
            boost_type: (payload.boost.boost_type ?? 'manual') as BoostType,
            audience_mode: (payload.boost.audience_mode ?? 'for_you') as BoostAudienceMode,
            focus_mode: (payload.boost.focus_mode ?? 'profile') as BoostFocusMode,
            status: (payload.boost.status ?? 'completed') as 'active' | 'completed',
            is_active: Boolean(payload.boost.is_active),
          }
        : null,
    metrics: {
      unique_viewers: Number(payload?.metrics?.unique_viewers ?? 0),
      views: Number(payload?.metrics?.views ?? 0),
      unique_intro_viewers: Number(payload?.metrics?.unique_intro_viewers ?? 0),
      intro_opens: Number(payload?.metrics?.intro_opens ?? 0),
      unique_savers: Number(payload?.metrics?.unique_savers ?? 0),
      saves: Number(payload?.metrics?.saves ?? 0),
      unique_intent_viewers: Number(payload?.metrics?.unique_intent_viewers ?? 0),
      intent_opens: Number(payload?.metrics?.intent_opens ?? 0),
      likes: Number(payload?.metrics?.likes ?? 0),
      accepted_matches: Number(payload?.metrics?.accepted_matches ?? 0),
    },
  };
}

export async function createProfileBoostV2(input: CreateBoostInput): Promise<CreatedBoost> {
  const { boostType, audienceMode, focusMode, metadata = {} } = input;
  const { data, error } = await supabase.rpc('rpc_create_profile_boost_v2' as any, {
    p_boost_type: boostType,
    p_audience_mode: audienceMode,
    p_focus_mode: focusMode,
    p_metadata: {
      ...metadata,
      include_sandbox_preview: typeof __DEV__ !== 'undefined' && __DEV__,
    },
  });
  if (error) throw error;

  const payload = (data ?? {}) as Record<string, any>;
  return {
    plan: normalizePlan(payload.plan),
    profile_id: String(payload.profile_id ?? ''),
    id: String(payload.id ?? ''),
    starts_at: String(payload.starts_at ?? ''),
    ends_at: String(payload.ends_at ?? ''),
    boost_type: (payload.boost_type ?? 'manual') as BoostType,
    audience_mode: (payload.audience_mode ?? 'for_you') as BoostAudienceMode,
    focus_mode: (payload.focus_mode ?? 'profile') as BoostFocusMode,
    status: (payload.status ?? 'active') as 'active' | 'completed',
  };
}
