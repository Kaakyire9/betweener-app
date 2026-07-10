import { buildLocationDisplay } from '@/lib/location/location-display';
import { parseDistanceKmFromLabel } from '@/lib/profile/distance';
import { normalizeProfileVideoUri } from '@/lib/profile/media';
import { getViewedProfilePremiumCopy } from '@/lib/viewed-profile-premium';
import { getAuthoritativePresenceDisplay } from '@/lib/presence';
import { isGuessPrompt } from '@/lib/prompts/guess-prompts';
import type { UserProfile } from '@/types/user-profile';

export type ProfileImageTag = 'intro' | 'lifestyle' | 'prompts' | 'values';

export type PremiumImage = {
  id: string;
  uri: string;
  tag: ProfileImageTag;
  isVideo?: boolean;
  reactionUri?: string;
};

export type PremiumSection = {
  id: string;
  tag: ProfileImageTag;
  title: string;
  body: string;
  chips?: string[];
};

export type PremiumProfile = {
  id: string;
  name: string;
  age: number;
  location: string;
  verified: boolean;
  distanceKm?: number;
  images: PremiumImage[];
  sections: PremiumSection[];
};

const BIO_MEANINGFUL_MIN_CHARS = 40;
const BIO_MIN_PUBLIC_CHARS = 20;
const LOOKING_FOR_MEANINGFUL_MIN_CHARS = 10;
const INTERESTS_MEANINGFUL_MIN_COUNT = 3;

export function buildGuessResultMessage(name: string, tone: 'correct' | 'wrong') {
  if (tone === 'correct') return `Correct. Nice one. Want to know more about ${name}?`;
  return 'Close. Try again, or skip the game and send a message.';
}

export function formatProfileValue(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const formatDetailLine = (
  label: string,
  value?: string | null,
  formatter: (input?: string | null) => string = formatProfileValue,
) => {
  const formatted = formatter(value);
  return formatted ? `${label}: ${formatted}` : null;
};

export const normalizePremiumPlan = (value: unknown): 'SILVER' | 'GOLD' | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SILVER' || normalized === 'GOLD') return normalized;
  return null;
};

export function formatHeaderTitle(name: string, age: number) {
  if (!name) return '';
  if (!age) return name;
  return `${name} · ${age}`;
}

export function formatReminderTimeLeft(expiresAt?: string | null) {
  if (!expiresAt) return '48h window';
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return '48h window';
  const hours = Math.max(0, (ts - Date.now()) / 3600000);
  if (hours < 1) return 'Ending soon';
  return `${Math.ceil(hours)}h left`;
}

export function buildLocationLine(profile: UserProfile) {
  return buildLocationDisplay(profile as Record<string, any>, {
    surface: 'profile',
  }).withFlag;
}

export function hasMeaningfulText(profile: UserProfile) {
  const bio = (profile.bio || '').trim();
  const lookingFor = (profile.lookingFor || '').trim();
  const interestCount = Array.isArray(profile.interests) ? profile.interests.filter((i) => i?.name).length : 0;

  return (
    bio.length >= BIO_MEANINGFUL_MIN_CHARS ||
    lookingFor.length >= LOOKING_FOR_MEANINGFUL_MIN_CHARS ||
    interestCount >= INTERESTS_MEANINGFUL_MIN_COUNT
  );
}

export function shouldGateProfile(profile: UserProfile) {
  const hasAnyPhoto =
    !!profile.heroImageUrl ||
    (Array.isArray(profile.photos) && profile.photos.some(Boolean)) ||
    !!profile.profilePicture;
  const hasBio = (profile.bio || '').trim().length >= BIO_MIN_PUBLIC_CHARS;
  const hasPrompt = (profile.lookingFor || '').trim().length >= LOOKING_FOR_MEANINGFUL_MIN_CHARS;
  return !(hasAnyPhoto || hasBio || hasPrompt);
}

export function parseFallbackProfile(rawParam?: string | string[]): UserProfile | null {
  const raw = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (!raw) return null;

  const candidates = [raw, (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })()];

  for (const cand of candidates) {
    try {
      const parsed = JSON.parse(cand || '{}');
      const rawHeroImageUrl =
        (typeof parsed.heroImageUrl === 'string' ? parsed.heroImageUrl : '') ||
        (typeof parsed.hero_image_url === 'string' ? parsed.hero_image_url : '');
      const photos = Array.isArray(parsed.photos)
        ? parsed.photos
        : rawHeroImageUrl
          ? [rawHeroImageUrl]
          : parsed.avatar_url
            ? [parsed.avatar_url]
            : [];
      const fallbackPresence = getAuthoritativePresenceDisplay(
        parsed.online,
        parsed.last_active || parsed.lastActive,
      );
      return {
        id: parsed.id || 'preview',
        userId: parsed.user_id || parsed.userId || undefined,
        name: parsed.name || parsed.full_name || 'Profile',
        age: parsed.age || 0,
        location: parsed.location || parsed.region || '',
        city: parsed.city,
        region: parsed.region,
        latitude: typeof parsed.latitude === 'number' ? parsed.latitude : undefined,
        longitude: typeof parsed.longitude === 'number' ? parsed.longitude : undefined,
        heroImageUrl:
          (typeof parsed.heroImageUrl === 'string' ? parsed.heroImageUrl : '') ||
          (typeof parsed.hero_image_url === 'string' ? parsed.hero_image_url : '') ||
          parsed.avatar_url ||
          photos[0] ||
          '',
        profilePicture: parsed.avatar_url || photos[0] || '',
        photos,
        profileVideo:
          typeof parsed.profileVideo === 'string'
            ? normalizeProfileVideoUri(parsed.profileVideo)
            : undefined,
        profileVideoPath: typeof parsed.profile_video === 'string' ? parsed.profile_video : undefined,
        occupation: parsed.occupation || '',
        education: parsed.education || '',
        verified: !!(parsed.verified || parsed.verification_level),
        bio: parsed.bio || '',
        distance: parsed.distance || '',
        distanceKm:
          typeof parsed.distanceKm === 'number'
            ? parsed.distanceKm
            : typeof parsed.distance_km === 'number'
              ? parsed.distance_km
              : parseDistanceKmFromLabel(parsed.distance),
        isActiveNow: fallbackPresence.online || fallbackPresence.activeNow,
        online: fallbackPresence.online,
        lastActive: parsed.lastActive || parsed.last_active || null,
        last_active: parsed.last_active || parsed.lastActive || null,
        tribe: parsed.tribe,
        religion: parsed.religion,
        personalityType: parsed.personality_type,
        height: parsed.height,
        lookingFor: parsed.looking_for,
        loveLanguage: parsed.love_language,
        languages: Array.isArray(parsed.languages_spoken) ? parsed.languages_spoken : undefined,
        currentCountry: parsed.current_country,
        currentCountryCode: parsed.current_country_code,
        exerciseFrequency: parsed.exercise_frequency,
        smoking: parsed.smoking,
        drinking: parsed.drinking,
        hasChildren: parsed.has_children,
        wantsChildren: parsed.wants_children,
        locationPrecision: parsed.location_precision,
        compatibility: typeof parsed.compatibility === 'number' ? parsed.compatibility : 0,
        verificationLevel:
          typeof parsed.verification_level === 'number'
            ? parsed.verification_level
            : typeof parsed.verificationLevel === 'number'
              ? parsed.verificationLevel
              : undefined,
        interests: Array.isArray(parsed.interests)
          ? parsed.interests
              .map((raw: any) => {
                if (typeof raw === 'string') return raw;
                if (raw && typeof raw === 'object' && typeof raw.name === 'string') return raw.name;
                return null;
              })
              .filter((n: string | null): n is string => !!n)
              .map((name: string, idx: number) => ({
                id: `int-${idx}`,
                name,
                category: 'Interest',
                emoji: '*',
              }))
          : [],
      };
    } catch {
      // ignore
    }
  }

  return null;
}

export function pickTaggedImages(profile: UserProfile): PremiumImage[] {
  const tags: ProfileImageTag[] = ['intro', 'lifestyle', 'prompts', 'values'];
  const uris = Array.isArray(profile.photos) ? profile.photos.filter(Boolean) : [];
  const orderedUris = [
    profile.heroImageUrl,
    profile.profilePicture,
    ...uris,
  ]
    .filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0)
    .filter((uri, index, arr) => arr.findIndex((item) => item === uri) === index);

  return orderedUris.map((uri, index) => ({
    id: `img-${index}`,
    uri,
    tag: tags[index % tags.length],
  }));
}

export function buildRootsSection(profile: UserProfile, isOwnProfile: boolean): PremiumSection | null {
  const roots = Array.isArray(profile.roots)
    ? profile.roots.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const rootsVisibility = String(profile.rootsVisibility || 'VISIBLE').trim().toUpperCase();
  const rootsNote = String(profile.rootsNote || '').trim();

  if (roots.length === 0) return null;
  if (rootsVisibility === 'HIDDEN' && !isOwnProfile) return null;

  if (rootsVisibility === 'MATCHES_ONLY' && !isOwnProfile) {
    return {
      id: 'sec-roots',
      tag: 'values',
      title: 'Roots & Heritage',
      body: 'Shared after a mutual match.',
    };
  }

  return {
    id: 'sec-roots',
    tag: 'values',
    title: 'Roots & Heritage',
    body:
      rootsNote ||
      (roots.length === 1 ? `${roots[0]} heritage.` : 'Cultural roots shared with intention.'),
    chips: roots,
  };
}

export function buildSections(
  profile: UserProfile,
  isOwnProfile: boolean,
  formatReligionLabel: (input?: string | null) => string,
): PremiumSection[] {
  const chipsFromInterests = (profile.interests || []).slice(0, 6).map((i) => i.name);
  const languageNames = Array.isArray(profile.languages)
    ? profile.languages.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const allPrompts = profile.promptAnswers || [];
  const topPrompt = allPrompts[0];
  const promptEntries = (profile.promptAnswers || [])
    .filter((item) => !isGuessPrompt(item?.promptType) && item?.answer?.trim())
    .map((item) => ({
      title: item.promptTitle?.trim() || 'Prompt',
      answer: item.answer.trim(),
    }));
  const remainingPrompts =
    topPrompt && !isGuessPrompt(topPrompt.promptType) && topPrompt.answer?.trim()
      ? promptEntries.slice(1, 3)
      : promptEntries.slice(0, 2);

  const premiumCopy = getViewedProfilePremiumCopy(profile.name);
  const identityLines = [
    formatDetailLine('Faith', profile.religion, formatReligionLabel),
    formatDetailLine('Personality', profile.personalityType),
    formatDetailLine('Love language', profile.loveLanguage),
    languageNames.length ? `Languages: ${languageNames.join(', ')}` : null,
  ].filter(Boolean);

  const sections: PremiumSection[] = [
    {
      id: 'sec-intro',
      tag: 'intro',
      title: `About ${profile.name}`,
      body: (profile.bio || '').trim() ? profile.bio : premiumCopy.aboutEmpty,
      chips: chipsFromInterests.length ? chipsFromInterests : undefined,
    },
    {
      id: 'sec-details',
      tag: 'values',
      title: 'Identity & Values',
      body: identityLines.length ? identityLines.join('\n') : premiumCopy.basicsEmpty,
    },
    {
      id: 'sec-lifestyle',
      tag: 'lifestyle',
      title: 'Lifestyle',
      body: (() => {
        const text = [
          formatDetailLine('Work', profile.occupation, (value) => String(value || '').trim()),
          formatDetailLine('Education', profile.education, (value) => String(value || '').trim()),
          formatDetailLine('Height', profile.height, (value) => String(value || '').trim()),
          formatDetailLine('Exercise', profile.exerciseFrequency),
          formatDetailLine('Smoking', profile.smoking),
          formatDetailLine('Drinking', profile.drinking),
        ]
          .filter(Boolean)
          .join('\n');
        return text || premiumCopy.lifestyleEmpty;
      })(),
    },
    {
      id: 'sec-values',
      tag: 'values',
      title: 'Looking For',
      body: (() => {
        const text = [
          profile.lookingFor ? formatProfileValue(profile.lookingFor) : null,
          formatDetailLine('Has children', profile.hasChildren),
          formatDetailLine('Wants children', profile.wantsChildren),
        ]
          .filter(Boolean)
          .join('\n');
        return text || premiumCopy.valuesEmpty;
      })(),
    },
  ];

  const rootsSection = buildRootsSection(profile, isOwnProfile);
  if (rootsSection) {
    sections.splice(1, 0, rootsSection);
  }

  if (remainingPrompts.length) {
    sections.splice(2, 0, {
      id: 'sec-prompts',
      tag: 'prompts',
      title: remainingPrompts.length > 1 ? 'More prompts' : 'Prompt',
      body: remainingPrompts
        .map((item) => `${item.title}\n${item.answer}`)
        .join('\n\n'),
    });
  }

  return sections;
}

export function buildAutoSectionsIfNeeded(
  profile: UserProfile,
  existing: PremiumSection[],
  formatReligionLabel: (input?: string | null) => string,
): PremiumSection[] {
  if (existing.length > 0) return existing;
  const premiumCopy = getViewedProfilePremiumCopy(profile.name);

  const basics = [
    formatDetailLine('Height', profile.height, (value) => String(value || '').trim()),
    formatDetailLine('Work', profile.occupation, (value) => String(value || '').trim()),
    formatDetailLine('Education', profile.education, (value) => String(value || '').trim()),
    formatDetailLine('Faith', profile.religion, formatReligionLabel),
    formatDetailLine('Heritage', profile.tribe, (value) => String(value || '').trim()),
    formatDetailLine('Personality', profile.personalityType),
  ].filter(Boolean);

  const intentions = [
    formatDetailLine('Looking for', profile.lookingFor),
    formatDetailLine('Has children', profile.hasChildren),
    formatDetailLine('Wants children', profile.wantsChildren),
  ].filter(Boolean);

  const lifestyle = [
    formatDetailLine('Exercise', profile.exerciseFrequency),
    formatDetailLine('Smoking', profile.smoking),
    formatDetailLine('Drinking', profile.drinking),
  ].filter(Boolean);

  const interests = (profile.interests || []).map((i) => i.name).filter(Boolean);

  const generated: PremiumSection[] = [
    {
      id: 'auto-basics',
      tag: 'intro',
      title: 'Basics',
      body: basics.length ? basics.join('\n') : premiumCopy.basicsEmpty,
    },
    {
      id: 'auto-intentions',
      tag: 'values',
      title: 'Intentions',
      body: intentions.length ? intentions.join('\n') : premiumCopy.valuesEmpty,
      chips: interests.slice(0, 6),
    },
    {
      id: 'auto-lifestyle',
      tag: 'lifestyle',
      title: 'Lifestyle',
      body: lifestyle.length ? lifestyle.join('\n') : premiumCopy.lifestyleEmpty,
    },
    {
      id: 'auto-ask',
      tag: 'prompts',
      title: 'Ask Me Anything',
      body: premiumCopy.askAnything,
    },
  ];

  return generated;
}

export function adaptToPremiumProfile(profile: UserProfile, isOwnProfile: boolean): PremiumProfile {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    location: profile.location,
    verified: profile.verified,
    distanceKm: profile.distanceKm,
    images: pickTaggedImages(profile),
    sections: buildSections(profile, isOwnProfile, () => ''),
  };
}
