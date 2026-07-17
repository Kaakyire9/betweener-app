import { buildLocationDisplay } from '@/lib/location/location-display';
import { supabase } from '@/lib/supabase';

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

type ClosureCandidateRow = {
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
  interests?: string[] | null;
  short_tags?: string[] | null;
  has_intro_video?: boolean | null;
  distance_km?: number | null;
  shared_interest_names?: string[] | null;
  shared_interest_count?: number | null;
  prompt_title?: string | null;
  prompt_answer?: string | null;
  bio_snippet?: string | null;
  same_region?: boolean | null;
  same_religion?: boolean | null;
  same_looking_for?: boolean | null;
  active_now?: boolean | null;
  recently_active?: boolean | null;
  candidate_tier?: number | null;
  quality_band?: number | null;
  closure_similarity_score?: number | null;
  closure_timing_score?: number | null;
  closure_freshness_score?: number | null;
  closure_rank_score?: number | null;
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

export type ClosureCandidate = ClosureProfileContext & ClosureCandidateRow;

export type ClosureRecommendation = {
  profileId: string;
  lane: ClosureRecommendationLane;
  laneLabel: string;
  laneSupport: string;
  name: string;
  age?: number | null;
  avatarUrl?: string | null;
  location?: string | null;
  verified: boolean;
  reasons: string[];
  chips: string[];
  support: string;
  opener: string;
  openerLabel: string;
  defaultIntentType: 'connect' | 'like_with_note';
  actionLabel: string;
};

export type ClosureCandidatePool = {
  target: ClosureProfileContext | null;
  candidates: ClosureCandidate[];
};

export type ClosurePoolDiagnostics = {
  request_id: string;
  request_status: string;
  viewer_profile_id: string;
  viewer_gender?: string | null;
  target_profile_id: string;
  target_gender?: string | null;
  counts: {
    discoverable_pool_count: number;
    blocked_by_existing_intent_count: number;
    blocked_by_match_count: number;
    blocked_by_block_count: number;
    blocked_by_swipe_pass_count: number;
    post_safety_pool_count: number;
    blocked_by_viewer_gender_count: number;
    blocked_by_target_gender_count: number;
    blocked_by_gender_after_safety_count: number;
    post_gender_pool_count: number;
    blocked_by_viewer_age_count: number;
    blocked_by_target_age_count: number;
    final_eligible_count: number;
    tier_0_count: number;
    tier_1_count: number;
    tier_2_count: number;
    tier_3_count: number;
  };
  samples?: {
    final_candidate_ids?: string[];
  };
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

const pushUnique = (items: string[], value?: string | null) => {
  const next = String(value ?? '').trim();
  if (!next || items.some((item) => item.toLowerCase() === next.toLowerCase())) return;
  items.push(next);
};

const formatLocation = (profile: ClosureProfileContext) =>
  buildLocationDisplay(profile as Record<string, any>, { surface: 'vibes' }).withFlag || null;

const getReasonLabel = (reason: ClosureReflectionReason) =>
  CLOSURE_REFLECTION_OPTIONS.find((option) => option.key === reason)?.label ?? 'What mattered';

const getMeaningfulDifferenceCount = (
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
) => {
  if (!target) return 1;
  return (
    Number(!sameText(candidate.region, target.region)) +
    Number(!sameText(candidate.current_country, target.current_country)) +
    Number(!sameText(candidate.personality_type, target.personality_type)) +
    Number(!sameText(candidate.religion, target.religion))
  );
};

const hasSharedFamilyDirection = (candidate: ClosureCandidate, target: ClosureProfileContext | null) =>
  sameText(candidate.wants_children, target?.wants_children);

const hasSharedPersonalityRhythm = (candidate: ClosureCandidate, target: ClosureProfileContext | null) =>
  sameText(candidate.personality_type, target?.personality_type) ||
  sameText(candidate.love_language, target?.love_language);

const hasSharedCultureContext = (candidate: ClosureCandidate, target: ClosureProfileContext | null) =>
  sameText(candidate.region, target?.region) ||
  sameText(candidate.current_country, target?.current_country);

const getLaneSupport = (lane: ClosureRecommendationLane) => {
  switch (lane) {
    case 'similar_spark':
      return 'Keeps the qualities that first felt right, without replaying the same outcome.';
    case 'better_timing':
      return 'The fit is still there, but the momentum and readiness look stronger now.';
    case 'fresh_perspective':
      return 'Preserves alignment while introducing a healthier difference in energy or background.';
    default:
      return 'A thoughtful next step built from what mattered.';
  }
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
      pushUnique(reasons, 'Shared faith and values');
    }
    if (selectedReasons.includes('faith_family') && hasSharedFamilyDirection(candidate, target)) {
      pushUnique(reasons, 'Similar family direction');
    }
    if (
      selectedReasons.includes('relationship_intent') &&
      sameText(candidate.looking_for, target?.looking_for)
    ) {
      pushUnique(reasons, 'Aligned relationship intentions');
    }
    if (selectedReasons.includes('interests_lifestyle') && targetSharedInterests[0]) {
      pushUnique(reasons, `Shared interest in ${targetSharedInterests[0]}`);
    }
    if (selectedReasons.includes('personality') && hasSharedPersonalityRhythm(candidate, target)) {
      pushUnique(reasons, 'A similar communication rhythm');
    }
    if (selectedReasons.includes('culture_location') && hasSharedCultureContext(candidate, target)) {
      pushUnique(reasons, 'Familiar culture and location context');
    }
    if (!reasons.length && candidate.same_looking_for) {
      pushUnique(reasons, 'Aligned relationship direction');
    }
    if (!reasons.length && candidate.shared_interest_names?.[0]) {
      pushUnique(reasons, `You both enjoy ${candidate.shared_interest_names[0]}`);
    }
    pushUnique(reasons, 'Feels familiar in the right way');
  } else if (lane === 'better_timing') {
    if (candidate.active_now) {
      pushUnique(reasons, 'Active now with strong momentum');
    } else if (candidate.recently_active) {
      pushUnique(reasons, 'Recently active with fresh energy');
    }
    if (candidate.same_looking_for) {
      pushUnique(reasons, 'Looking for the same kind of connection');
    }
    if (candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0) {
      pushUnique(reasons, 'Verified and easier to trust');
    }
    if (candidate.has_intro_video) {
      pushUnique(reasons, 'Has a clearer introduction');
    }
    pushUnique(reasons, 'The timing looks warmer now');
  } else {
    if (candidate.same_looking_for) {
      pushUnique(reasons, 'Shared intent without the same exact profile pattern');
    }
    if (getMeaningfulDifferenceCount(candidate, target) >= 2) {
      pushUnique(reasons, 'Different energy, still compatible');
    } else if (target && !sameText(candidate.personality_type, target.personality_type)) {
      pushUnique(reasons, 'Aligned values with a different rhythm');
    }
    if (candidate.shared_interest_names?.[0]) {
      pushUnique(reasons, `A familiar bridge through ${candidate.shared_interest_names[0]}`);
    }
    pushUnique(reasons, 'Wider path, without losing alignment');
  }

  return reasons.slice(0, 3);
};

const buildRecommendationChips = (
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const chips: string[] = [];
  const sharedInterests = target ? intersect(candidate.interests, target.interests) : [];
  if (sharedInterests[0]) pushUnique(chips, sharedInterests[0]);
  if (selectedReasons.includes('relationship_intent') && candidate.same_looking_for) {
    pushUnique(chips, 'Same intent');
  }
  if (selectedReasons.includes('faith_family') && sameText(candidate.religion, target?.religion)) {
    pushUnique(chips, 'Shared faith');
  }
  if (selectedReasons.includes('personality') && hasSharedPersonalityRhythm(candidate, target)) {
    pushUnique(chips, 'Easy rhythm');
  }
  if (selectedReasons.includes('culture_location') && hasSharedCultureContext(candidate, target)) {
    pushUnique(chips, 'Familiar context');
  }
  if (candidate.active_now) pushUnique(chips, 'Active now');
  else if (candidate.recently_active) pushUnique(chips, 'Recently active');
  if (candidate.has_intro_video) pushUnique(chips, 'Intro');
  if (candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0) {
    pushUnique(chips, 'Verified');
  }
  return chips.slice(0, 4);
};

const buildLaneSupportBody = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const targetSharedInterests = target ? intersect(candidate.interests, target.interests) : [];
  const firstSharedInterest = targetSharedInterests[0] ?? candidate.shared_interest_names?.[0] ?? null;

  if (lane === 'similar_spark') {
    if (selectedReasons.includes('interests_lifestyle') && firstSharedInterest) {
      return `This keeps the familiar spark through ${firstSharedInterest} while giving you a new conversation to build from.`;
    }
    if (selectedReasons.includes('relationship_intent') && candidate.same_looking_for) {
      return 'This keeps the relationship direction that mattered, but gives it a cleaner next chance.';
    }
    return 'This person preserves the qualities that first felt meaningful, without simply repeating the same story.';
  }

  if (lane === 'better_timing') {
    if (candidate.active_now) {
      return 'The fit looks good, and the timing is warmer because they are active right now.';
    }
    if (candidate.has_intro_video) {
      return 'The fit is supported by clearer profile storytelling, which lowers hesitation on the first move.';
    }
    return 'The qualities are still aligned, but the readiness and responsiveness look stronger here.';
  }

  if (firstSharedInterest) {
    return `The alignment is still visible, but the difference in tone or background may open a healthier conversation through ${firstSharedInterest}.`;
  }
  return 'This one keeps enough alignment to feel intentional, while introducing a fresher kind of chemistry.';
};

const buildOpener = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const firstName = String(candidate.full_name || 'there').trim().split(/\s+/)[0] || 'there';
  const sharedInterests = target ? intersect(candidate.interests, target.interests) : [];
  const sharedInterest = sharedInterests[0] ?? candidate.shared_interest_names?.find(Boolean);

  if (lane === 'similar_spark') {
    if (selectedReasons.includes('interests_lifestyle') && sharedInterest) {
      return `Hi ${firstName} - I noticed we both enjoy ${sharedInterest}. What usually draws you deeper into it?`;
    }
    if (selectedReasons.includes('relationship_intent') && candidate.same_looking_for) {
      return `Hi ${firstName} - it feels like we may want a similar kind of connection here. What matters most to you when something starts well?`;
    }
    if (selectedReasons.includes('faith_family') && sameText(candidate.religion, target?.religion)) {
      return `Hi ${firstName} - I noticed we may share a similar faith or family direction. How does that shape what you are looking for here?`;
    }
    if (selectedReasons.includes('personality') && hasSharedPersonalityRhythm(candidate, target)) {
      return `Hi ${firstName} - your profile feels calm in a way I connect with. What kind of pace or energy usually feels best to you?`;
    }
  }

  if (lane === 'better_timing') {
    if (candidate.active_now) {
      return `Hi ${firstName} - your profile caught me at the right moment. What kind of connection are you most open to right now?`;
    }
    if (candidate.has_intro_video) {
      return `Hi ${firstName} - your intro made you feel easy to understand. What part of your profile feels most true to who you are?`;
    }
    return `Hi ${firstName} - your profile feels thoughtful and well-timed. What are you hoping this season of connection leads to?`;
  }

  if (sharedInterest) {
    return `Hi ${firstName} - we seem to share ${sharedInterest}, but your profile still feels different in a good way. What do you think people usually misunderstand about you at first?`;
  }
  if (candidate.same_looking_for) {
    return `Hi ${firstName} - it feels like we may want a similar direction, even if we come at it differently. What tends to make a connection feel worth exploring for you?`;
  }
  return `Hi ${firstName} - your profile feels different from what I usually notice, but still aligned in a good way. What kind of connection tends to feel most natural to you?`;
};

const getLaneEligibilityBonus = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const targetSharedInterests = target ? intersect(candidate.interests, target.interests).length : 0;

  if (lane === 'similar_spark') {
    let bonus = 0;
    if (candidate.same_looking_for) bonus += 8;
    if (targetSharedInterests > 0) bonus += 7 + targetSharedInterests;
    if (
      (selectedReasons.includes('shared_values') || selectedReasons.includes('faith_family')) &&
      sameText(candidate.religion, target?.religion)
    ) {
      bonus += 7;
    }
    if (selectedReasons.includes('faith_family') && hasSharedFamilyDirection(candidate, target)) {
      bonus += 6;
    }
    if (selectedReasons.includes('personality') && hasSharedPersonalityRhythm(candidate, target)) {
      bonus += 6;
    }
    if (selectedReasons.includes('culture_location') && hasSharedCultureContext(candidate, target)) {
      bonus += 4;
    }
    return bonus;
  }

  if (lane === 'better_timing') {
    return (
      (candidate.active_now ? 10 : candidate.recently_active ? 5 : 0) +
      (candidate.has_intro_video ? 4 : 0) +
      (candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0 ? 4 : 0) +
      (candidate.same_looking_for ? 4 : 0) +
      (candidate.shared_interest_count ? 2 : 0)
    );
  }

  const differenceCount = getMeaningfulDifferenceCount(candidate, target);
  return (
    (candidate.same_looking_for ? 7 : 0) +
    Math.min(differenceCount, 3) * 4 +
    Math.min(Number(candidate.shared_interest_count ?? 0), 2) * 2 -
    Math.min(targetSharedInterests, 2)
  );
};

const scoreCandidate = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const quality = Number(candidate.quality_band ?? 0) * 2 + Number(candidate.candidate_tier ?? 0);
  const sharedInterestCount = Number(candidate.shared_interest_count ?? 0);

  return (
    Number(candidate.closure_rank_score ?? 0) +
    Number(candidate.closure_similarity_score ?? 0) * 0.45 +
    Number(candidate.closure_timing_score ?? 0) * 0.28 +
    Number(candidate.closure_freshness_score ?? 0) * 0.22 +
    quality +
    getLaneEligibilityBonus(lane, candidate, target, selectedReasons) +
    sharedInterestCount * 1.5 +
    (candidate.same_region ? 0.4 : 0) +
    (candidate.same_religion ? 0.5 : 0) +
    (candidate.prompt_answer ? 0.8 : 0) +
    (candidate.bio_snippet ? 0.5 : 0)
  );
};

const isStrongForLane = (
  lane: ClosureRecommendationLane,
  candidate: ClosureCandidate,
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const sharedInterestCount = Number(candidate.shared_interest_count ?? 0);

  if (lane === 'similar_spark') {
    return (
      candidate.same_looking_for ||
      sharedInterestCount > 0 ||
      ((selectedReasons.includes('shared_values') || selectedReasons.includes('faith_family')) &&
        sameText(candidate.religion, target?.religion)) ||
      (selectedReasons.includes('faith_family') && hasSharedFamilyDirection(candidate, target)) ||
      (selectedReasons.includes('personality') && hasSharedPersonalityRhythm(candidate, target)) ||
      (selectedReasons.includes('culture_location') && hasSharedCultureContext(candidate, target))
    );
  }

  if (lane === 'better_timing') {
    return Boolean(
      candidate.active_now ||
        candidate.recently_active ||
        candidate.has_intro_video ||
        candidate.phone_verified ||
        Number(candidate.verification_level ?? 0) > 0,
    );
  }

  return (
    (candidate.same_looking_for || sharedInterestCount > 0) &&
    getMeaningfulDifferenceCount(candidate, target) > 0
  );
};

const getLaneCandidates = (
  lane: ClosureRecommendationLane,
  candidates: ClosureCandidate[],
  target: ClosureProfileContext | null,
  selectedReasons: ClosureReflectionReason[],
) => {
  const strong = candidates.filter((candidate) => isStrongForLane(lane, candidate, target, selectedReasons));
  return strong.length > 0 ? strong : candidates;
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
    const candidate = getLaneCandidates(key, pool.candidates, pool.target, selectedReasons)
      .filter((item) => !used.has(item.id))
      .map((item) => ({
        item,
        score: scoreCandidate(key, item, pool.target, selectedReasons),
      }))
      .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))[0]?.item;

    if (!candidate) return [];
    used.add(candidate.id);

    const reasons = buildLaneReasons(key, candidate, pool.target, selectedReasons);
    const support = buildLaneSupportBody(key, candidate, pool.target, selectedReasons);
    const chips = buildRecommendationChips(candidate, pool.target, selectedReasons);
    const defaultIntentType =
      key === 'similar_spark' && (Number(candidate.shared_interest_count ?? 0) > 0 || reasons.some((reason) => /shared/i.test(reason)))
        ? 'like_with_note'
        : key === 'better_timing' && candidate.has_intro_video
          ? 'connect'
          : Number(candidate.shared_interest_count ?? 0) > 0
            ? 'like_with_note'
            : 'connect';

    return [{
      profileId: candidate.id,
      lane: key,
      laneLabel: label,
      laneSupport: getLaneSupport(key),
      name: candidate.full_name?.trim() || 'Someone',
      age: candidate.age,
      avatarUrl: candidate.avatar_url,
      location: formatLocation(candidate),
      verified: Boolean(candidate.phone_verified || Number(candidate.verification_level ?? 0) > 0),
      reasons,
      chips,
      support,
      opener: buildOpener(key, candidate, pool.target, selectedReasons),
      openerLabel:
        defaultIntentType === 'like_with_note'
          ? `A softer opener shaped by ${getReasonLabel(selectedReasons[0] ?? 'relationship_intent').toLowerCase()}`
          : 'A direct opener with clearer timing',
      defaultIntentType,
      actionLabel: defaultIntentType === 'like_with_note' ? 'Send Like with message' : 'Send Intent',
    }];
  });
}

export async function loadClosureCandidatePool(
  intentRequestId: string,
  targetProfileId: string,
): Promise<ClosureCandidatePool> {
  const { data: candidateData, error: candidateError } = await supabase.rpc(
    'rpc_get_closure_to_clarity_candidates' as any,
    {
      p_intent_request_id: intentRequestId,
      p_limit: 28,
    },
  );
  if (candidateError) throw candidateError;

  const candidates = ((candidateData ?? []) as ClosureCandidateRow[])
    .filter((row) => row?.id && row.id !== targetProfileId);

  console.log('[closure] candidate_rpc_count', {
    requestId: intentRequestId,
    targetProfileId,
    count: candidates.length,
    sampleIds: candidates.slice(0, 6).map((candidate) => candidate.id),
  });

  const [{ data: profileData, error: profileError }, { data: interestData, error: interestError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id,full_name,age,avatar_url,city,region,current_country,current_country_code,religion,looking_for,wants_children,love_language,personality_type,verification_level,phone_verified',
        )
        .eq('id', targetProfileId)
        .maybeSingle(),
      supabase
        .from('profile_interests')
        .select('profile_id, interests!inner(name)')
        .eq('profile_id', targetProfileId),
    ]);

  if (profileError) throw profileError;
  if (interestError) throw interestError;

  const targetInterests = (interestData ?? []).flatMap((row: any) => {
    if (Array.isArray(row.interests)) {
      return row.interests.map((interest: any) => String(interest?.name ?? '')).filter(Boolean);
    }
    return row.interests?.name ? [String(row.interests.name)] : [];
  });

  const target =
    profileData && profileData.id
      ? ({
          ...profileData,
          interests: targetInterests,
        } satisfies ClosureProfileContext)
      : null;

  return {
    target,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      interests: candidate.interests ?? [],
    })) as ClosureCandidate[],
  };
}

export async function getClosurePoolDiagnostics(intentRequestId: string) {
  const { data, error } = await supabase.rpc('rpc_debug_closure_to_clarity_pool' as any, {
    p_intent_request_id: intentRequestId,
  });
  if (error) throw error;
  return (data ?? null) as ClosurePoolDiagnostics | null;
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
