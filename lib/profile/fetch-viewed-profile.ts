import { isDistanceLabel, parseDistanceKmFromLabel } from '@/lib/profile/distance';
import { getAuthoritativePresenceDisplay } from '@/lib/presence';
import { getInterestEmoji } from '@/lib/profile/interest-emoji';
import { getProfileCardContext } from '@/lib/profile-interest';
import { supabase } from '@/lib/supabase';
import { fetchUserPresence, overlayPresence } from '@/lib/user-presence';
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
    'id, user_id, full_name, age, region, city, location, avatar_url, photos, profile_video, occupation, education, bio, tribe, roots, roots_note, roots_visibility, religion, personality_type, height, looking_for, love_language, languages_spoken, current_country, current_country_code, origin_country, origin_country_code, exercise_frequency, smoking, drinking, has_children, wants_children, location_precision, is_active, online, last_active, verification_level, created_at';
  const selectMinimal =
    'id, user_id, full_name, age, region, city, location, avatar_url, bio, tribe, roots, roots_note, roots_visibility, religion, personality_type, love_language, is_active, online, last_active, verification_level, current_country_code, origin_country, origin_country_code, created_at';

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

  const presenceResult =
    typeof data?.user_id === 'string' && data.user_id.length > 0
      ? await fetchUserPresence(data.user_id)
      : { data: null, error: null };
  const profileWithPresence = overlayPresence(data, (presenceResult.data as any) ?? null);

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

  const photos = Array.isArray((profileWithPresence as any).photos)
    ? (profileWithPresence as any).photos
    : profileWithPresence.avatar_url
      ? [profileWithPresence.avatar_url]
      : [];
  const computedFallbackKm =
    typeof fallbackDistanceKm === 'number'
      ? fallbackDistanceKm
      : fallbackDistanceLabel
        ? parseDistanceKmFromLabel(fallbackDistanceLabel)
        : undefined;

  const presence = getAuthoritativePresenceDisplay(
    profileWithPresence.online,
    profileWithPresence.last_active ?? null,
  );
  let premiumPlan: 'FREE' | 'SILVER' | 'GOLD' | undefined;
  let isNewHere = false;

  try {
    const [context] = await getProfileCardContext([viewedProfileId]);
    const resolvedPlan = String(
      (context as any)?.premium_plan ?? (context as any)?.premiumPlan ?? '',
    ).trim().toUpperCase();
    premiumPlan =
      resolvedPlan === 'FREE' || resolvedPlan === 'SILVER' || resolvedPlan === 'GOLD'
        ? (resolvedPlan as 'FREE' | 'SILVER' | 'GOLD')
        : undefined;
    isNewHere = Boolean((context as any)?.is_new_here ?? (context as any)?.isNewHere);
  } catch {
    const createdAtMs = Date.parse(String((profileWithPresence as any)?.created_at || ''));
    isNewHere = Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= 14 * 24 * 60 * 60 * 1000;
  }

  const mapped: UserProfile = {
    id: profileWithPresence.id,
    userId: profileWithPresence.user_id || undefined,
    name: profileWithPresence.full_name || 'Profile',
    age: profileWithPresence.age || 0,
    createdAt: (profileWithPresence as any).created_at || undefined,
    location: profileWithPresence.location || profileWithPresence.region || '',
    city: profileWithPresence.city || undefined,
    region: profileWithPresence.region || undefined,
    latitude: typeof (profileWithPresence as any).latitude === 'number' ? (profileWithPresence as any).latitude : undefined,
    longitude: typeof (profileWithPresence as any).longitude === 'number' ? (profileWithPresence as any).longitude : undefined,
    profilePicture: profileWithPresence.avatar_url || photos[0] || '',
    photos,
    profileVideoPath: (profileWithPresence as any).profile_video || undefined,
    occupation: (profileWithPresence as any).occupation || '',
    education: (profileWithPresence as any).education || '',
    verified: !!profileWithPresence.verification_level,
    verificationLevel: typeof profileWithPresence.verification_level === 'number' ? profileWithPresence.verification_level : undefined,
    bio: profileWithPresence.bio || '',
    distance: isDistanceLabel(fallbackDistanceLabel) ? fallbackDistanceLabel || '' : profileWithPresence.region || profileWithPresence.location || '',
    distanceKm: computedFallbackKm,
    isActiveNow: presence.online || presence.activeNow,
    online: presence.online,
    lastActive: profileWithPresence.last_active ?? null,
    last_active: profileWithPresence.last_active ?? null,
    personalityType: (profileWithPresence as any).personality_type || undefined,
    height: (profileWithPresence as any).height || undefined,
    lookingFor: (profileWithPresence as any).looking_for || undefined,
    loveLanguage: profileWithPresence.love_language || undefined,
    languages: Array.isArray((profileWithPresence as any).languages_spoken) ? (profileWithPresence as any).languages_spoken : undefined,
    currentCountry: (profileWithPresence as any).current_country || undefined,
    currentCountryCode: (profileWithPresence as any).current_country_code || undefined,
    originCountry: (profileWithPresence as any).origin_country || undefined,
    originCountryCode: (profileWithPresence as any).origin_country_code || undefined,
    exerciseFrequency: (profileWithPresence as any).exercise_frequency || undefined,
    smoking: (profileWithPresence as any).smoking || undefined,
    drinking: (profileWithPresence as any).drinking || undefined,
    hasChildren: (profileWithPresence as any).has_children || undefined,
    wantsChildren: (profileWithPresence as any).wants_children || undefined,
    locationPrecision: (profileWithPresence as any).location_precision || undefined,
    compatibility: typeof (profileWithPresence as any).compatibility === 'number' ? (profileWithPresence as any).compatibility : 0,
    tribe: profileWithPresence.tribe || undefined,
    roots:
      Array.isArray((profileWithPresence as any).roots) && (profileWithPresence as any).roots.length > 0
        ? (profileWithPresence as any).roots.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : profileWithPresence.tribe
          ? [String(profileWithPresence.tribe)]
          : undefined,
    rootsNote: (profileWithPresence as any).roots_note || undefined,
    rootsVisibility: (profileWithPresence as any).roots_visibility || undefined,
    religion: profileWithPresence.religion || undefined,
    interests: interestsArr,
    promptAnswers,
    premiumPlan,
    isNewHere,
  };

  if ((!mapped.photos || mapped.photos.length === 0) && mapped.profilePicture) {
    mapped.photos = [mapped.profilePicture];
  }

  return mapped;
}
