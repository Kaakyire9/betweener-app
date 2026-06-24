import { supabase } from '@/lib/supabase';
import { buildLocationDisplay } from '@/lib/location/location-display';

export const CLOSURE_REFLECTION_OPTIONS = [
  { key: 'shared_values', label: 'Shared values' },
  { key: 'relationship_intent', label: 'Relationship Intent' },
  { key: 'personality', label: 'Personality' },
  { key: 'faith_family', label: 'Faith and family' },
  { key: 'interests_lifestyle', label: 'Interests and lifestyle' },
  { key: 'culture_location', label: 'Culture and location' },
] as const;

export type ClosureReflectionReason = (typeof CLOSURE_REFLECTION_OPTIONS)[number]['key'];
export type ClosureRecommendationLane = 'similar_spark' | 'better_timing' | 'fresh_perspective';

type SuggestedMoveRow = {
  id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  short_tags?: string[] | null;
  has_intro_video?: boolean | null;
  distance_km?: number | null;
  shared_interest_names?: string[] | null;
  shared_interest_count?: number | null;
  same_region?: boolean | null;
  same_religion?: boolean | null;
  same_looking_for?: boolean | null;
  active_now?: boolean | null;
  recently_active?: boolean | null;
  candidate_tier?: number | null;
  quality_band?: number | null;
};

export type ClosureProfileContext = {
  id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  city?: string | null;
  region?: string | null;
  current_country?: string | null;
  current_country_code?: string | null;
  religion?: string | null;
  looking_for?: string | null;
  wants_children?: string | null;
  love_language?: string | null;
  personality_type?: string | null;
  verification_level?: number | null;
  phone_verified?: boolean | null;
  interests: string[];
};

export type ClosureCandidate = ClosureProfileContext & SuggestedMoveRow;

export type ClosureRecommendation = {
  profileId: string;
  lane: ClosureRecommendationLane;
  laneLabel: string;
  name: string;
  age?: number | null;
  avatarUrl?: string | null;
  location?: string | null;
  verified: boolean;
  reasons: string[];
  defaultIntentType: 'connect' | 'like_with_note';
  opener: string;
};

export type ClosureCandidatePool = {
  target: ClosureProfileContext | null;
  candidates: ClosureCandidate[];
};

const normalize = (value?: string | null) => String(value ?? '').trim().toLowerCase();

const sameText = (left?: string | null, right?: string | null) => {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && a === b);
};

const intersect = (left: string[], right: string[]) => {
  const rightSet = new Set(right.map(normalize).filter(Boolean));
  return left.filter((value) => rightSet.has(normalize(value)));
};

const pushReason = (reasons: string[], value?: string | null) => {
  const next = String(value ?? '').trim();
  if (!next || reasons.some((reason) => reason.toLowerCase() === next.toLowerCase())) return;
  reasons.push(next);
};

const formatLocation = (profile: ClosureProfileContext) =>
  buildLocationDisplay(profile as Record<string, any>, { surface: 'vibes' }).withFlag || null;

const buildOpener = (candidate: ClosureCandidate) => {
  const firstName = String(candidate.full_name || 'there').trim().split(/\s+/)[0] || 'there';
  const sharedInterest = candidate.shared_interest_names?.find(Boolean);
  if (sharedInterest) {
    return `Hi ${firstName} - I noticed we both enjoy ${sharedInterest}. What drew you to it?`;
  }
  if (candidate.same_looking_for) {
    return `Hi ${firstName} - it looks like we may want something similar here. What kind of connection matters most to you?`;
  }
  return `Hi ${firstName} - your profile stood out to me. What are you hoping to build here?`;
};

const buildLaneReasons = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const reasons: string[] = [];
  const targetSharedInterests = target ? intersect(candidate.interests, target.interests) : [];

  if (lane === 'similar_spark') {
    if (
      (selectedReasons.includes('shared_values') || selectedReasons.includes('faith_family')) &&
      sameText(candidate.religion, target?.religion)
    ) {
      pushReason(reasons, 'Shared faith and values');
    }
    if (
      selectedReasons.includes('faith_family') &&
      sameText(candidate.wants_children, target?.wants_children)
    ) {
      pushReason(reasons, 'Similar family direction');
    }
    if (
      selectedReasons.includes('relationship_intent') &&
      sameText(candidate.looking_for, target?.looking_for)
    ) {
      pushReason(reasons, 'Similar relationship intentions');
    }
    if (selectedReasons.includes('interests_lifestyle') && targetSharedInterests[0]) {
      pushReason(reasons, `Shared interest in ${targetSharedInterests[0]}`);
    }
    if (
      selectedReasons.includes('culture_location') &&
      (sameText(candidate.region, target?.region) ||
        sameText(candidate.current_country, target?.current_country))
    ) {
      pushReason(reasons, 'Familiar culture and location context');
    }
    if (
      selectedReasons.includes('personality') &&
      (sameText(candidate.personality_type, target?.personality_type) ||
        sameText(candidate.love_language, target?.love_language))
    ) {
      pushReason(reasons, 'A similar communication rhythm');
    }
    if (reasons.length === 0 && candidate.same_looking_for) {
      pushReason(reasons, 'Aligned relationship direction');
    }
    if (reasons.length === 0 && candidate.shared_interest_names?.[0]) {
      pushReason(reasons, `You both enjoy ${candidate.shared_interest_names[0]}`);
    }
    pushReason(reasons, 'Keeps the qualities that felt meaningful');
  } else if (lane === 'better_timing') {
    if (candidate.active_now) {
      pushReason(reasons, 'Active now with a complete profile');
    } else if (candidate.recently_active) {
      pushReason(reasons, 'Recently active with fresh momentum');
    }
    if (candidate.same_looking_for) {
      pushReason(reasons, 'Looking for the same relationship direction');
    }
    if (candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0) {
      pushReason(reasons, 'Phone verified');
    }
    if (candidate.has_intro_video) {
      pushReason(reasons, 'A clearer introduction to start from');
    }
    pushReason(reasons, 'A stronger moment to connect');
  } else {
    if (candidate.same_looking_for) {
      pushReason(reasons, 'Shared Intent with a fresh perspective');
    }
    if (
      target &&
      !sameText(candidate.region, target.region) &&
      !sameText(candidate.current_country, target.current_country)
    ) {
      pushReason(reasons, 'Compatible direction, different background');
    } else if (target && !sameText(candidate.personality_type, target.personality_type)) {
      pushReason(reasons, 'Aligned values with different energy');
    }
    if (candidate.shared_interest_names?.[0]) {
      pushReason(reasons, `A familiar interest in ${candidate.shared_interest_names[0]}`);
    }
    pushReason(reasons, 'A wider path without losing alignment');
  }

  return reasons.slice(0, 2);
};

const scoreCandidate = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const targetSharedInterests = target ? intersect(candidate.interests, target.interests).length : 0;
  const quality = Number(candidate.quality_band ?? 0) * 2 + Number(candidate.candidate_tier ?? 0);

  if (lane === 'similar_spark') {
    let score = quality + targetSharedInterests * 3;
    if (sameText(candidate.looking_for, target?.looking_for)) {
      score += selectedReasons.includes('relationship_intent') ? 8 : 3;
    }
    if (sameText(candidate.religion, target?.religion)) {
      score += selectedReasons.includes('shared_values') || selectedReasons.includes('faith_family') ? 7 : 2;
    }
    if (sameText(candidate.wants_children, target?.wants_children)) {
      score += selectedReasons.includes('faith_family') ? 6 : 1;
    }
    if (
      sameText(candidate.personality_type, target?.personality_type) ||
      sameText(candidate.love_language, target?.love_language)
    ) {
      score += selectedReasons.includes('personality') ? 6 : 1;
    }
    if (
      sameText(candidate.region, target?.region) ||
      sameText(candidate.current_country, target?.current_country)
    ) {
      score += selectedReasons.includes('culture_location') ? 5 : 1;
    }
    return score;
  }

  if (lane === 'better_timing') {
    return (
      quality +
      (candidate.active_now ? 9 : candidate.recently_active ? 5 : 0) +
      (candidate.same_looking_for ? 5 : 0) +
      (candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0 ? 3 : 0) +
      (candidate.has_intro_video ? 2 : 0)
    );
  }

  const meaningfulDifference = target
    ? Number(!sameText(candidate.region, target.region)) +
      Number(!sameText(candidate.personality_type, target.personality_type)) +
      Number(!sameText(candidate.religion, target.religion))
    : 1;
  return (
    quality +
    (candidate.same_looking_for ? 6 : 0) +
    Number(candidate.shared_interest_count ?? 0) * 2 +
    Math.min(meaningfulDifference, 2) * 4 -
    targetSharedInterests
  );
};

export function classifyClosureRecommendations(
  pool: ClosureCandidatePool,
  selectedReasons: ClosureReflectionReason[],
): ClosureRecommendation[] {
  const lanes: { key: ClosureRecommendationLane; label: string }[] = [
    { key: 'similar_spark', label: 'Similar Spark' },
    { key: 'better_timing', label: 'Better Timing' },
    { key: 'fresh_perspective', label: 'Fresh Perspective' },
  ];
  const used = new Set<string>();

  return lanes.flatMap(({ key, label }) => {
    const candidate = pool.candidates
      .filter((item) => !used.has(item.id))
      .map((item) => ({
        item,
        score: scoreCandidate(key, item, pool.target, selectedReasons),
      }))
      .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))[0]?.item;

    if (!candidate) return [];
    used.add(candidate.id);
    return [{
      profileId: candidate.id,
      lane: key,
      laneLabel: label,
      name: candidate.full_name?.trim() || 'Someone',
      age: candidate.age,
      avatarUrl: candidate.avatar_url,
      location: formatLocation(candidate),
      verified: Boolean(candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0),
      reasons: buildLaneReasons(key, candidate, pool.target, selectedReasons),
      defaultIntentType:
        Number(candidate.shared_interest_count ?? 0) > 0 ? 'like_with_note' : 'connect',
      opener: buildOpener(candidate),
    }];
  });
}

export async function loadClosureCandidatePool(
  viewerProfileId: string,
  targetProfileId: string,
): Promise<ClosureCandidatePool> {
  const { data: suggestedData, error: suggestedError } = await supabase.rpc(
    'rpc_get_suggested_moves',
    {
      p_profile_id: viewerProfileId,
      p_limit: 18,
    },
  );
  if (suggestedError) throw suggestedError;

  const suggestedRows = ((suggestedData ?? []) as SuggestedMoveRow[])
    .filter((row) => row?.id && row.id !== targetProfileId);
  const profileIds = Array.from(new Set([targetProfileId, ...suggestedRows.map((row) => row.id)]));
  if (profileIds.length === 0) {
    return { target: null, candidates: [] };
  }

  const [{ data: profileData, error: profileError }, { data: interestData, error: interestError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id,full_name,age,avatar_url,city,region,current_country,current_country_code,religion,looking_for,wants_children,love_language,personality_type,verification_level,phone_verified',
        )
        .in('id', profileIds),
      supabase
        .from('profile_interests')
        .select('profile_id, interests!inner(name)')
        .in('profile_id', profileIds),
    ]);

  if (profileError) throw profileError;
  if (interestError) throw interestError;

  const interestsByProfile: Record<string, string[]> = {};
  (interestData ?? []).forEach((row: any) => {
    const profileId = String(row?.profile_id ?? '');
    if (!profileId) return;
    const names = Array.isArray(row.interests)
      ? row.interests.map((interest: any) => interest?.name).filter(Boolean)
      : row.interests?.name
        ? [row.interests.name]
        : [];
    interestsByProfile[profileId] = [
      ...(interestsByProfile[profileId] ?? []),
      ...names.map(String),
    ];
  });

  const profiles = new Map(
    ((profileData ?? []) as Omit<ClosureProfileContext, 'interests'>[]).map((profile) => [
      profile.id,
      {
        ...profile,
        interests: interestsByProfile[profile.id] ?? [],
      } satisfies ClosureProfileContext,
    ]),
  );

  return {
    target: profiles.get(targetProfileId) ?? null,
    candidates: suggestedRows.flatMap((row) => {
      const profile = profiles.get(row.id);
      if (!profile) return [];
      return [{ ...row, ...profile } satisfies ClosureCandidate];
    }),
  };
}

export async function getIntentReflection(intentRequestId: string) {
  const { data, error } = await supabase.rpc('rpc_get_intent_reflection' as any, {
    p_intent_request_id: intentRequestId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter((reason): reason is ClosureReflectionReason =>
    CLOSURE_REFLECTION_OPTIONS.some((option) => option.key === reason),
  );
}

export async function saveIntentReflection(params: {
  intentRequestId: string;
  targetProfileId: string;
  source: 'expired_request' | 'passed_profile';
  selectedReasons: ClosureReflectionReason[];
}) {
  const { data, error } = await supabase.rpc('rpc_save_intent_reflection' as any, {
    p_intent_request_id: params.intentRequestId,
    p_target_profile_id: params.targetProfileId,
    p_source: params.source,
    p_selected_reasons: params.selectedReasons.slice(0, 2),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter((reason): reason is ClosureReflectionReason =>
    CLOSURE_REFLECTION_OPTIONS.some((option) => option.key === reason),
  );
}
