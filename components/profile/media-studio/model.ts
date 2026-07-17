import { Colors } from '@/constants/theme';
import { MAX_PROFILE_GALLERY_ITEMS, type ProfileMediaDraft } from '@/lib/profile/media-studio';

export type StudioTheme = typeof Colors.light;

export type PreviewMode = 'card' | 'full' | 'detail';
export type LayerState = 'ready' | 'missing' | 'improve' | 'optional';
export type LayerKey = 'avatar' | 'hero' | 'video' | 'gallery';

export type ProfileStoryLayer = {
  key: LayerKey;
  label: string;
  state: LayerState;
  value?: string;
  description: string;
  actionLabel: string;
};

export type StudioNote = {
  id: string;
  status: 'ready' | 'improve' | 'optional';
  title: string;
  body: string;
};

export const PREVIEW_MODES: { key: PreviewMode; label: string }[] = [
  { key: 'card', label: 'Card' },
  { key: 'full', label: 'Full preview' },
  { key: 'detail', label: 'Detail' },
];

export const withAlpha = (hex: string, alpha: string) => `${hex}${alpha}`;

export const slotIconName = (slotId: LayerKey) => {
  switch (slotId) {
    case 'avatar':
      return 'face-man-profile';
    case 'hero':
      return 'image-filter-hdr';
    case 'video':
      return 'video-vintage';
    case 'gallery':
      return 'image-multiple';
    default:
      return 'star-four-points-outline';
  }
};

export const layerStateLabel = (layer: ProfileStoryLayer) => {
  if (layer.value) return layer.value;
  switch (layer.state) {
    case 'ready':
      return 'Ready';
    case 'missing':
      return 'Needed';
    case 'improve':
      return 'Improve';
    case 'optional':
      return 'Optional';
    default:
      return '';
  }
};

export const layerStateAccent = (theme: StudioTheme, state: LayerState) => {
  switch (state) {
    case 'ready':
      return theme.tint;
    case 'improve':
      return theme.accent;
    case 'missing':
      return theme.danger;
    case 'optional':
      return theme.textMuted;
    default:
      return theme.textMuted;
  }
};

export const buildStoryLayers = (draft: ProfileMediaDraft): ProfileStoryLayer[] => {
  const hasAvatar = Boolean(draft.avatarUrl);
  const hasDistinctHero = Boolean(draft.heroImageUrl && draft.heroImageUrl !== draft.avatarUrl);
  const galleryCount = draft.gallery.length;
  return [
    {
      key: 'avatar',
      label: 'Avatar',
      state: hasAvatar ? 'ready' : 'missing',
      description: 'Your avatar is the face people recognise first.',
      actionLabel: hasAvatar ? 'Change avatar' : 'Add avatar',
    },
    {
      key: 'hero',
      label: 'Hero',
      state: hasDistinctHero ? 'ready' : draft.heroImageUrl ? 'improve' : 'missing',
      description: 'Your hero scene sets the mood of your profile.',
      actionLabel: hasDistinctHero ? 'Set hero' : 'Choose hero',
    },
    {
      key: 'video',
      label: 'Video',
      state: draft.profileVideoUrl ? 'ready' : 'optional',
      description: 'A short intro video adds voice, movement, and warmth.',
      actionLabel: draft.profileVideoUrl ? 'Edit video' : 'Add intro video',
    },
    {
      key: 'gallery',
      label: 'Gallery',
      state: galleryCount >= 4 ? 'ready' : galleryCount >= 2 ? 'improve' : 'missing',
      value: `${galleryCount}/${MAX_PROFILE_GALLERY_ITEMS}`,
      description: 'Your gallery adds more scenes and texture.',
      actionLabel: 'Import media',
    },
  ];
};

export const buildStudioNotes = (draft: ProfileMediaDraft): StudioNote[] => {
  const notes: StudioNote[] = [];
  const hasDistinctHero = Boolean(draft.heroImageUrl && draft.heroImageUrl !== draft.avatarUrl);

  notes.push(
    draft.avatarUrl
      ? {
          id: 'avatar-ready',
          status: 'ready',
          title: 'Avatar is clear',
          body: 'Your face is easy to recognise.',
        }
      : {
          id: 'avatar-missing',
          status: 'improve',
          title: 'Add an avatar',
          body: 'A clear face-forward photo builds trust faster.',
        },
  );

  notes.push(
    hasDistinctHero
      ? {
          id: 'hero-ready',
          status: 'ready',
          title: 'Hero feels distinct',
          body: 'Your opening scene adds personality beyond the avatar.',
        }
      : {
          id: 'hero-improve',
          status: 'improve',
          title: 'Give the hero its own scene',
          body: 'Use a different image so the opening feels more intentional.',
        },
  );

  if (!draft.profileVideoUrl) {
    notes.push({
      id: 'video-optional',
      status: 'optional',
      title: 'Video can lift warmth',
      body: 'A short intro makes the first impression feel more alive.',
    });
  } else {
    notes.push({
      id: 'video-ready',
      status: 'ready',
      title: 'Video adds presence',
      body: 'Voice and movement are already working for you.',
    });
  }

  if (draft.gallery.length < 3) {
    notes.push({
      id: 'gallery-improve',
      status: 'improve',
      title: 'Gallery needs more range',
      body: 'Add more scenes so people see more than one version of you.',
    });
  } else {
    notes.push({
      id: 'gallery-ready',
      status: 'ready',
      title: 'Gallery has depth',
      body: 'You have enough variety for a fuller story.',
    });
  }

  return notes.slice(0, 3);
};
