// @ts-nocheck
import {
  classifyClosureRecommendations,
  type ClosureCandidatePool,
} from '@/lib/intents/closure-to-clarity';

jest.mock('@/lib/supabase', () => ({
  supabase: {},
}));

const candidate = (
  id: string,
  overrides: Partial<ClosureCandidatePool['candidates'][number]> = {},
): ClosureCandidatePool['candidates'][number] => ({
  id,
  full_name: id,
  age: 30,
  avatar_url: null,
  city: 'Accra',
  region: 'Greater Accra',
  current_country: 'Ghana',
  religion: 'Christian',
  looking_for: 'Marriage',
  wants_children: 'Yes',
  love_language: 'Quality time',
  personality_type: 'INFJ',
  verification_level: 1,
  phone_verified: true,
  interests: ['Faith', 'Music'],
  short_tags: [],
  has_intro_video: true,
  distance_km: null,
  shared_interest_names: ['Music'],
  shared_interest_count: 1,
  same_region: true,
  same_religion: true,
  same_looking_for: true,
  active_now: false,
  recently_active: true,
  candidate_tier: 2,
  quality_band: 2,
  ...overrides,
});

const pool: ClosureCandidatePool = {
  target: {
    id: 'closed-profile',
    full_name: 'Closed profile',
    city: 'Accra',
    region: 'Greater Accra',
    current_country: 'Ghana',
    religion: 'Christian',
    looking_for: 'Marriage',
    wants_children: 'Yes',
    love_language: 'Quality time',
    personality_type: 'INFJ',
    verification_level: 1,
    phone_verified: true,
    interests: ['Faith', 'Music'],
  },
  candidates: [
    candidate('similar'),
    candidate('timely', {
      religion: 'Muslim',
      personality_type: 'ENTP',
      active_now: true,
      recently_active: true,
      quality_band: 3,
    }),
    candidate('fresh', {
      city: 'London',
      region: 'England',
      current_country: 'United Kingdom',
      religion: 'Spiritual',
      personality_type: 'ENFP',
      active_now: false,
      recently_active: false,
      shared_interest_names: ['Music'],
    }),
  ],
};

describe('Closure to Clarity recommendations', () => {
  it('returns one unique profile for each available lane', () => {
    const recommendations = classifyClosureRecommendations(pool, ['shared_values']);

    expect(recommendations.map((item) => item.lane)).toEqual([
      'similar_spark',
      'better_timing',
      'fresh_perspective',
    ]);
    expect(new Set(recommendations.map((item) => item.profileId)).size).toBe(3);
  });

  it('uses private reflection choices to explain the Similar Spark result', () => {
    const [recommendation] = classifyClosureRecommendations(pool, [
      'relationship_intent',
      'faith_family',
    ]);

    expect(recommendation.lane).toBe('similar_spark');
    expect(recommendation.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/family|relationship/i),
      ]),
    );
  });

  it('degrades safely when fewer than three candidates are available', () => {
    const recommendations = classifyClosureRecommendations(
      { ...pool, candidates: pool.candidates.slice(0, 1) },
      [],
    );

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].reasons.length).toBeGreaterThan(0);
  });
});
