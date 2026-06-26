import * as Linking from 'expo-linking';

import {
  type MeProfileStatsSnapshot,
} from '@/lib/offline/me-store';
import {
  type OfflineProfileInsightsGiftItem,
} from '@/lib/offline/profile-insights-store';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';

export type AuthCallbackParams = Record<string, string | undefined>;

export type ReceivedGiftItem = {
  id: string;
  senderId: string;
  senderProfileId?: string | null;
  senderName: string;
  senderAvatar?: string | null;
  senderGender?: string | null;
  giftType: string;
  createdAt: string;
  openedAt?: string | null;
  revealedAt?: string | null;
  archivedAt?: string | null;
};

const PROFILE_COMPLETION_MIN_INTERESTS = 3;
const BIO_MIN_PUBLIC_CHARS = 20;
const LOOKING_FOR_MIN_CHARS = 10;

export const mergeAuthParamsFromUrl = (target: AuthCallbackParams, url: string) => {
  try {
    const parsed = Linking.parse(url);
    const query = parsed.queryParams ?? {};
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'string') target[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') target[key] = value[0];
    });
  } catch {
    // ignore malformed urls
  }

  if (url.includes('#')) {
    const fragment = url.split('#')[1] || '';
    const params = new URLSearchParams(fragment);
    params.forEach((value, key) => {
      target[key] = value;
    });
  }
};

export const formatProfileDetailValue = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const mapOfflineInsightGiftToReceivedGift = (
  gift: OfflineProfileInsightsGiftItem,
): ReceivedGiftItem => ({
  id: gift.id,
  senderId: gift.senderProfileId ?? gift.id,
  senderProfileId: gift.senderProfileId ?? null,
  senderName: gift.senderName,
  senderAvatar: gift.senderAvatar ?? null,
  senderGender: gift.senderGender ?? null,
  giftType: gift.giftType,
  createdAt: gift.createdAt,
  openedAt: gift.openedAt ?? null,
  revealedAt: gift.revealedAt ?? null,
  archivedAt: gift.archivedAt ?? null,
});

export const normalizeGiftType = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || '';
};

export const normalizeMeProfileStatsSnapshot = (
  stats: Partial<MeProfileStatsSnapshot>,
): MeProfileStatsSnapshot => ({
  likesCount: Math.max(0, Number(stats.likesCount) || 0),
  matchesCount: Math.max(0, Number(stats.matchesCount) || 0),
  chatsCount: Math.max(0, Number(stats.chatsCount) || 0),
  matchQuality: typeof stats.matchQuality === 'number' && Number.isFinite(stats.matchQuality)
    ? Math.max(0, Math.min(100, Math.round(stats.matchQuality)))
    : null,
});

export const mergeUniqueMediaUris = (...groups: (string[] | null | undefined)[]) =>
  Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((item) => normalizeProfilePhotoUri(item))
        .filter(Boolean),
    ),
  );

export const sanitizeLinkedProviderList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item || '').trim().toLowerCase())
            .filter((item) => item === 'email' || item === 'google' || item === 'apple'),
        ),
      )
    : [];

export const formatMembershipDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

export const computeProfileCompletion = (
  profile: any,
  interests: string[],
  promptCount: number,
  photoCount: number,
) => {
  if (!profile) {
    return { percent: 0, missing: [] as string[] };
  }

  const hasName = !!(profile.full_name || '').trim();
  const hasAge = typeof profile.age === 'number' && profile.age >= 18;
  const hasGender = !!(profile.gender || '').toString().trim();
  const hasBio = (profile.bio || '').trim().length >= BIO_MIN_PUBLIC_CHARS;
  const hasRegion = !!(profile.region || '').trim();
  const hasRoots =
    (Array.isArray((profile as any).roots) && (profile as any).roots.filter(Boolean).length > 0)
    || !!(profile.tribe || '').trim();
  const hasOccupation = !!(profile.occupation || '').trim();
  const hasEducation = !!(profile.education || '').trim();
  const hasIntent = (profile.looking_for || '').trim().length >= LOOKING_FOR_MIN_CHARS;
  const hasExercise = !!(profile.exercise_frequency || '').trim();
  const hasSmoking = !!(profile.smoking || '').trim();
  const hasDrinking = !!(profile.drinking || '').trim();
  const hasChildren = !!(profile.has_children || '').trim();
  const wantsChildren = !!(profile.wants_children || '').trim();
  const hasPersonality = !!(profile.personality_type || '').trim();
  const hasLoveLanguage = !!(profile.love_language || '').trim();
  const hasLivingSituation = !!(profile.living_situation || '').trim();
  const hasPets = !!(profile.pets || '').trim();
  const hasLanguages =
    Array.isArray(profile.languages_spoken) && profile.languages_spoken.filter(Boolean).length > 0;
  const hasInterests = Array.isArray(interests) && interests.length >= PROFILE_COMPLETION_MIN_INTERESTS;
  const hasPhotos = photoCount >= 2 || (Array.isArray(profile.photos) && profile.photos.filter(Boolean).length >= 2);
  const hasAvatar = !!(profile.avatar_url || '').trim();
  const hasVideo = !!(profile.profile_video || '').trim();
  const hasHeight = !!(profile.height || '').trim();
  const hasPrompts = promptCount > 0;

  const checks: { label: string; ok: boolean }[] = [
    { label: 'Add your name', ok: hasName },
    { label: 'Add your age', ok: hasAge },
    { label: 'Add your gender', ok: hasGender },
    { label: 'Share a little about you', ok: hasBio },
    { label: 'Add your region', ok: hasRegion },
    { label: 'Add your roots or ethnicity', ok: hasRoots },
    { label: 'Add your occupation', ok: hasOccupation },
    { label: 'Add your education', ok: hasEducation },
    { label: "Express what you're here for", ok: hasIntent },
    { label: 'Add exercise frequency', ok: hasExercise },
    { label: 'Add smoking preference', ok: hasSmoking },
    { label: 'Add drinking preference', ok: hasDrinking },
    { label: 'Add children status', ok: hasChildren },
    { label: 'Add family plans', ok: wantsChildren },
    { label: 'Add personality type', ok: hasPersonality },
    { label: 'Add love language', ok: hasLoveLanguage },
    { label: 'Add living situation', ok: hasLivingSituation },
    { label: 'Add pets preference', ok: hasPets },
    { label: 'Add languages spoken', ok: hasLanguages },
    { label: 'Add your interests', ok: hasInterests },
    { label: 'Add at least 2 photos', ok: hasPhotos },
    { label: 'Add a profile photo', ok: hasAvatar },
    { label: 'Add a profile video', ok: hasVideo },
    { label: 'Add your height', ok: hasHeight },
    { label: 'Answer a prompt', ok: hasPrompts },
  ];

  const total = checks.length || 1;
  const earned = checks.reduce((sum, c) => sum + (c.ok ? 1 : 0), 0);
  const percent = Math.max(0, Math.min(100, Math.round((earned / total) * 100)));
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);

  return { percent, missing };
};
