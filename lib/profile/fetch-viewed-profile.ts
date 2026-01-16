import { isDistanceLabel, parseDistanceKmFromLabel } from '@/lib/profile/distance';
import { getInterestEmoji } from '@/lib/profile/interest-emoji';
import { normalizeAiScorePercent, toRoundedPercentInt } from '@/lib/profile/ai-score';
import { supabase } from '@/lib/supabase';
import type { Interest, UserProfile } from '@/types/user-profile';

export type FetchViewedProfileOptions = {
  viewedProfileId: string;
  fallbackDistanceLabel?: string;
  fallbackDistanceKm?: number;
};

/**
 * Shared fetch used by profile-view screens.
 * Extracted from app/profile-view.tsx so premium variants can reuse the exact same data shape.
 */
export async function fetchViewedProfile(options: FetchViewedProfileOptions): Promise<UserProfile> {
  const { viewedProfileId, fallbackDistanceLabel, fallbackDistanceKm } = options;

  const selectFull =
    'id, full_name, age, region, city, location, avatar_url, photos, profile_video, occupation, education, bio, tribe, religion, personality_type, height, looking_for, languages_spoken, current_country, current_country_code, diaspora_status, willing_long_distance, exercise_frequency, smoking, drinking, has_children, wants_children, location_precision, is_active, online, verification_level, ai_score';
  const selectMinimal =
    'id, full_name, age, region, city, location, avatar_url, bio, tribe, religion, personality_type, is_active, online, verification_level, ai_score, current_country_code';

  let data: any = null;
  let error: any = null;

  try {
    const res = await supabase.from('profiles').select(selectFull).eq('id', viewedProfileId).limit(1).single();
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  // Handle older DB schemas missing optional columns.
  if (error && (error.code === '42703' || String(error.message || '').includes('column'))) {
    const res2 = await supabase.from('profiles').select(selectMinimal).eq('id', viewedProfileId).limit(1).single();
    data = res2.data;
    error = res2.error;
  }

  if (error || !data) throw error || new Error('Profile not found');

  let interestsArr: Interest[] = [];
  try {
    const { data: piRows } = await supabase
      .from('profile_interests')
      .select('interest_id, interests!inner(name)')
      .eq('profile_id', viewedProfileId);

    if (Array.isArray(piRows) && piRows.length > 0) {
      const names = piRows.flatMap((r: any) =>
        Array.isArray(r.interests)
          ? r.interests.map((i: any) => i.name).filter(Boolean)
          : r.interests?.name
            ? [r.interests.name]
            : [],
      );
      interestsArr = names.map((n: string, idx: number) => ({
        id: `int-${idx}`,
        name: n,
        category: 'Interest',
        emoji: getInterestEmoji(n),
      }));
    }
  } catch {
    // non-fatal
  }

  const photos = Array.isArray((data as any).photos) ? (data as any).photos : data.avatar_url ? [data.avatar_url] : [];
  const aiScoreVal = normalizeAiScorePercent((data as any).ai_score);
  const aiScoreRounded = toRoundedPercentInt(aiScoreVal);

  const computedFallbackKm =
    typeof fallbackDistanceKm === 'number'
      ? fallbackDistanceKm
      : fallbackDistanceLabel
        ? parseDistanceKmFromLabel(fallbackDistanceLabel)
        : undefined;

  const mapped: UserProfile = {
    id: data.id,
    name: data.full_name || 'Profile',
    age: data.age || 0,
    location: data.location || data.region || '',
    city: data.city || undefined,
    region: data.region || undefined,
    latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
    longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
    profilePicture: data.avatar_url || photos[0] || '',
    photos,
    profileVideoPath: data.profile_video || undefined,
    occupation: data.occupation || '',
    education: data.education || '',
    verified: !!data.verification_level,
    bio: data.bio || '',
    distance: isDistanceLabel(fallbackDistanceLabel) ? fallbackDistanceLabel || '' : data.region || data.location || '',
    distanceKm: computedFallbackKm,
    isActiveNow: !!data.is_active || !!(data as any).online,
    personalityType: data.personality_type || undefined,
    height: data.height || undefined,
    lookingFor: data.looking_for || undefined,
    languages: Array.isArray((data as any).languages_spoken) ? (data as any).languages_spoken : undefined,
    currentCountry: data.current_country || undefined,
    currentCountryCode: data.current_country_code || undefined,
    diasporaStatus: data.diaspora_status || undefined,
    willingLongDistance: typeof data.willing_long_distance === 'boolean' ? data.willing_long_distance : undefined,
    exerciseFrequency: data.exercise_frequency || undefined,
    smoking: data.smoking || undefined,
    drinking: data.drinking || undefined,
    hasChildren: data.has_children || undefined,
    wantsChildren: data.wants_children || undefined,
    locationPrecision: data.location_precision || undefined,
    compatibility:
      typeof aiScoreRounded === 'number'
        ? aiScoreRounded
        : typeof (data as any).compatibility === 'number'
          ? (data as any).compatibility
          : 75,
    aiScore: aiScoreVal,
    tribe: data.tribe || undefined,
    religion: data.religion || undefined,
    interests: interestsArr,
  };

  if ((!mapped.photos || mapped.photos.length === 0) && mapped.profilePicture) {
    mapped.photos = [mapped.profilePicture];
  }

  return mapped;
}
