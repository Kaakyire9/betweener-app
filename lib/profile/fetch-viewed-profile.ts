import { isDistanceLabel, parseDistanceKmFromLabel } from '@/lib/profile/distance';
import { getInterestEmoji } from '@/lib/profile/interest-emoji';
import { supabase } from '@/lib/supabase';
import type { Interest, ProfilePromptAnswer, UserProfile } from '@/types/user-profile';

export type FetchViewedProfileOptions = {
  viewedProfileId: string;
  viewerProfileId?: string | null;
  fallbackDistanceLabel?: string;
  fallbackDistanceKm?: number;
};

/**
 * Shared fetch used by profile-view screens.
 * Extracted from app/profile-view.tsx so premium variants can reuse the exact same data shape.
 */
export async function fetchViewedProfile(options: FetchViewedProfileOptions): Promise<UserProfile> {
  const { viewedProfileId, viewerProfileId, fallbackDistanceLabel, fallbackDistanceKm } = options;

  const selectFull =
    'id, user_id, full_name, age, region, city, location, avatar_url, photos, profile_video, occupation, education, bio, tribe, roots, roots_note, roots_visibility, religion, personality_type, height, looking_for, love_language, languages_spoken, current_country, current_country_code, exercise_frequency, smoking, drinking, has_children, wants_children, location_precision, is_active, online, verification_level';
  const selectMinimal =
    'id, user_id, full_name, age, region, city, location, avatar_url, bio, tribe, roots, roots_note, roots_visibility, religion, personality_type, love_language, is_active, online, verification_level, current_country_code';

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
  let promptAnswers: ProfilePromptAnswer[] = [];
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

  try {
    const { data: promptRows } = await supabase.rpc('get_viewed_profile_prompts', {
      p_profile_id: viewedProfileId,
      p_viewer_profile_id: viewerProfileId ?? null,
    });

    if (Array.isArray(promptRows) && promptRows.length > 0) {
      promptAnswers = promptRows
        .map((row: any) => ({
          id: row.id,
          promptKey: row.prompt_key || undefined,
          promptTitle: row.prompt_title || null,
          answer: typeof row?.answer === 'string' ? row.answer : '',
          promptType: row.prompt_type || 'standard',
          guessMode: row.guess_mode || null,
          guessOptions: Array.isArray(row.guess_options)
            ? row.guess_options.filter((item: unknown) => typeof item === 'string')
            : null,
          hintText: row.hint_text || null,
          revealPolicy: row.reveal_policy || 'never',
          viewerGuess: row.viewer_guess || null,
          viewerGuessIsCorrect:
            typeof row?.viewer_guess_is_correct === 'boolean' ? row.viewer_guess_is_correct : null,
          createdAt: row.created_at || undefined,
        }));
    }
  } catch {
    // non-fatal
  }

  const photos = Array.isArray((data as any).photos) ? (data as any).photos : data.avatar_url ? [data.avatar_url] : [];
  const computedFallbackKm =
    typeof fallbackDistanceKm === 'number'
      ? fallbackDistanceKm
      : fallbackDistanceLabel
        ? parseDistanceKmFromLabel(fallbackDistanceLabel)
        : undefined;

  const mapped: UserProfile = {
    id: data.id,
    userId: data.user_id || undefined,
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
    verificationLevel: typeof data.verification_level === 'number' ? data.verification_level : undefined,
    bio: data.bio || '',
    distance: isDistanceLabel(fallbackDistanceLabel) ? fallbackDistanceLabel || '' : data.region || data.location || '',
    distanceKm: computedFallbackKm,
    isActiveNow: !!data.is_active || !!(data as any).online,
    personalityType: data.personality_type || undefined,
    height: data.height || undefined,
    lookingFor: data.looking_for || undefined,
    loveLanguage: data.love_language || undefined,
    languages: Array.isArray((data as any).languages_spoken) ? (data as any).languages_spoken : undefined,
    currentCountry: data.current_country || undefined,
    currentCountryCode: data.current_country_code || undefined,
    exerciseFrequency: data.exercise_frequency || undefined,
    smoking: data.smoking || undefined,
    drinking: data.drinking || undefined,
    hasChildren: data.has_children || undefined,
    wantsChildren: data.wants_children || undefined,
    locationPrecision: data.location_precision || undefined,
    compatibility: typeof (data as any).compatibility === 'number' ? (data as any).compatibility : 0,
    tribe: data.tribe || undefined,
    roots:
      Array.isArray((data as any).roots) && (data as any).roots.length > 0
        ? (data as any).roots.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : data.tribe
          ? [String(data.tribe)]
          : undefined,
    rootsNote: (data as any).roots_note || undefined,
    rootsVisibility: (data as any).roots_visibility || undefined,
    religion: data.religion || undefined,
    interests: interestsArr,
    promptAnswers,
  };

  if ((!mapped.photos || mapped.photos.length === 0) && mapped.profilePicture) {
    mapped.photos = [mapped.profilePicture];
  }

  return mapped;
}
