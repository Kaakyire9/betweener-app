import { normalizeGalleryPhotoList, normalizeProfilePhotoUri } from '@/lib/profile/media';

export const MAX_PROFILE_GALLERY_ITEMS = 6;

export type ProfileMediaDraft = {
  avatarUrl: string;
  gallery: string[];
  heroImageUrl: string | null;
  profileVideoUrl: string;
};

export type MediaCuratorNote = {
  id: string;
  tone: 'good' | 'suggestion';
  title: string;
  body: string;
};

export type MediaStoryStatus = {
  tone: 'strong' | 'steady' | 'needs_work';
  title: string;
  body: string;
  scoreLabel: string;
};

export type MediaStudioSlot = {
  id: 'avatar' | 'hero' | 'video' | 'gallery';
  title: string;
  eyebrow: string;
  body: string;
  filled: boolean;
  emphasis?: 'primary' | 'secondary';
};

const uniqueMedia = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = normalizeProfilePhotoUri(item);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

export const resolveProfileMediaDraft = (input: {
  avatarUrl?: string | null;
  photos?: unknown;
  heroImageUrl?: string | null;
  profileVideoUrl?: string | null;
}): ProfileMediaDraft => {
  const avatarUrl = normalizeProfilePhotoUri(input.avatarUrl);
  const gallery = normalizeGalleryPhotoList(input.photos, avatarUrl).slice(0, MAX_PROFILE_GALLERY_ITEMS);
  const explicitHeroImageUrl = normalizeProfilePhotoUri(input.heroImageUrl);
  return {
    avatarUrl,
    gallery,
    heroImageUrl: explicitHeroImageUrl || gallery[0] || avatarUrl || null,
    profileVideoUrl: String(input.profileVideoUrl || '').trim(),
  };
};

export const appendGalleryMedia = (
  current: string[],
  incoming: string[],
  avatarUrl?: string | null,
) => {
  const merged = uniqueMedia([
    ...normalizeGalleryPhotoList(current, avatarUrl),
    ...normalizeGalleryPhotoList(incoming, avatarUrl),
  ]);
  return merged.slice(0, MAX_PROFILE_GALLERY_ITEMS);
};

export const removeGalleryMediaAt = (current: string[], index: number) =>
  current.filter((_, currentIndex) => currentIndex !== index);

export const moveGalleryMedia = (current: string[], fromIndex: number, toIndex: number) => {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= current.length ||
    toIndex >= current.length ||
    fromIndex === toIndex
  ) {
    return current;
  }

  const next = [...current];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

export const promoteGalleryMediaToHero = (current: string[], index: number) =>
  moveGalleryMedia(current, index, 0);

export const promoteGalleryMediaToAvatar = (
  currentAvatarUrl: string | null | undefined,
  current: string[],
  index: number,
) => {
  const selected = current[index];
  if (!selected) {
    return {
      avatarUrl: normalizeProfilePhotoUri(currentAvatarUrl),
      gallery: current,
    };
  }

  const normalizedPreviousAvatar = normalizeProfilePhotoUri(currentAvatarUrl);
  const remaining = current.filter((_, currentIndex) => currentIndex !== index);
  const nextGallery = normalizedPreviousAvatar
    ? appendGalleryMedia([normalizedPreviousAvatar, ...remaining], [], selected)
    : appendGalleryMedia(remaining, [], selected);

  return {
    avatarUrl: normalizeProfilePhotoUri(selected),
    gallery: nextGallery,
  };
};

export const buildMediaCuratorNotes = (draft: ProfileMediaDraft): MediaCuratorNote[] => {
  const notes: MediaCuratorNote[] = [];

  if (!draft.avatarUrl) {
    notes.push({
      id: 'avatar-missing',
      tone: 'suggestion',
      title: 'Lead with a clear profile photo',
      body: 'Your avatar is still empty. Add one strong face-forward image so trust lands immediately.',
    });
  } else {
    notes.push({
      id: 'avatar-ready',
      tone: 'good',
      title: 'Avatar is doing its job',
      body: 'You already have a lead image. Keep it crisp and recognisable.',
    });
  }

  if (!draft.heroImageUrl || draft.heroImageUrl === draft.avatarUrl) {
    notes.push({
      id: 'hero-suggestion',
      tone: 'suggestion',
      title: 'Give the hero its own scene',
      body: 'Use a second image for the hero so the profile opens with more depth than a repeated portrait.',
    });
  } else {
    notes.push({
      id: 'hero-ready',
      tone: 'good',
      title: 'Hero image feels distinct',
      body: 'A separate hero frame makes the profile feel more editorial and premium.',
    });
  }

  if (draft.gallery.length < 3) {
    notes.push({
      id: 'gallery-depth',
      tone: 'suggestion',
      title: 'Add more story to the gallery',
      body: `You have ${draft.gallery.length}/6 gallery images. Three or more usually makes the profile feel fuller and more intentional.`,
    });
  } else {
    notes.push({
      id: 'gallery-healthy',
      tone: 'good',
      title: 'Gallery depth is healthy',
      body: `${draft.gallery.length}/6 images gives people more reasons to stay, notice details, and respond.`,
    });
  }

  if (!draft.profileVideoUrl) {
    notes.push({
      id: 'video-missing',
      tone: 'suggestion',
      title: 'An intro video still lifts trust',
      body: 'A short intro adds warmth and usually helps the profile feel more real than photos alone.',
    });
  } else {
    notes.push({
      id: 'video-ready',
      tone: 'good',
      title: 'Intro video is ready',
      body: 'Your intro video adds voice, movement, and more confidence to first impressions.',
    });
  }

  return notes.slice(0, 4);
};

export const buildMediaStoryStatus = (draft: ProfileMediaDraft): MediaStoryStatus => {
  let score = 0;
  if (draft.avatarUrl) score += 1;
  if (draft.heroImageUrl && draft.heroImageUrl !== draft.avatarUrl) score += 1;
  if (draft.gallery.length >= 3) score += 1;
  if (draft.profileVideoUrl) score += 1;

  if (score >= 4) {
    return {
      tone: 'strong',
      title: 'Editorial opening is ready',
      body: 'Avatar, hero, gallery, and intro video are all working together. This profile should open with real depth.',
      scoreLabel: '4/4 story layers',
    };
  }

  if (score >= 2) {
    return {
      tone: 'steady',
      title: 'The story is taking shape',
      body: 'You already have enough media to feel real. One stronger hero or intro layer would make it feel more premium.',
      scoreLabel: `${score}/4 story layers`,
    };
  }

  return {
    tone: 'needs_work',
    title: 'Build a stronger first impression',
    body: 'Right now the profile still looks sparse. Add clearer lead media before you save so the opening lands with confidence.',
    scoreLabel: `${score}/4 story layers`,
  };
};

export const buildMediaStudioSlots = (draft: ProfileMediaDraft): MediaStudioSlot[] => {
  const hasDistinctHero = Boolean(draft.heroImageUrl && draft.heroImageUrl !== draft.avatarUrl);
  return [
    {
      id: 'avatar',
      eyebrow: 'Lead trust',
      title: 'Avatar',
      body: draft.avatarUrl
        ? 'Face-forward and recognisable. This is the image people anchor on first.'
        : 'Still empty. Add one crisp portrait so trust lands immediately.',
      filled: Boolean(draft.avatarUrl),
      emphasis: 'primary',
    },
    {
      id: 'hero',
      eyebrow: 'Opening scene',
      title: 'Hero',
      body: hasDistinctHero
        ? 'Distinct from the avatar, which gives the profile a more cinematic opening.'
        : 'Currently repeating the avatar or still missing. Promote a second scene to add depth.',
      filled: Boolean(draft.heroImageUrl),
      emphasis: hasDistinctHero ? 'primary' : 'secondary',
    },
    {
      id: 'video',
      eyebrow: 'Warmth layer',
      title: 'Intro video',
      body: draft.profileVideoUrl
        ? 'Ready to carry voice, movement, and more confidence into the profile opening.'
        : 'Optional, but still one of the strongest trust upgrades for a premium-feeling profile.',
      filled: Boolean(draft.profileVideoUrl),
    },
    {
      id: 'gallery',
      eyebrow: 'Story depth',
      title: 'Gallery',
      body:
        draft.gallery.length >= 3
          ? `${draft.gallery.length}/6 scenes staged. You have enough variety for the profile to feel intentional.`
          : `${draft.gallery.length}/6 scenes staged. Add more lifestyle or context images so the story feels fuller.`,
      filled: draft.gallery.length > 0,
      emphasis: draft.gallery.length >= 3 ? 'primary' : 'secondary',
    },
  ];
};
