// @ts-nocheck
import {
  getCirclePulseHeroEyebrow,
  promoteCirclePulseHero,
  reorderCirclePulseLane,
  resolveCirclePulsePresentation,
} from '@/lib/circles/pulse/circle-pulse-presentation';
import type { CirclePulseItem, CirclePulseItemType } from '@/lib/circles/pulse/circle-pulse-types';

const makeItem = (id: string, type: CirclePulseItemType, priority: number): CirclePulseItem => ({
  id,
  circleId: 'circle-1',
  type,
  title: id,
  subtitle: null,
  body: null,
  imageUrl: null,
  mediaUrl: null,
  mediaType: null,
  promptId: type === 'prompt' ? `${id}-prompt` : null,
  gatheringId: type === 'gathering' ? `${id}-gathering` : null,
  momentId: null,
  loveSeatId: type === 'love_seat' ? `${id}-seat` : null,
  featuredProfileId: null,
  featuredProfileName: null,
  featuredProfileAge: null,
  featuredProfileAvatarUrl: null,
  featuredProfileLocation: null,
  featuredProfileBadge: null,
  loveSeatQuote: null,
  welcomeProfiles: [],
  status: 'active',
  priority,
  startsAt: null,
  expiresAt: null,
  commentCount: 0,
  discussionCta: null,
  discussionSummary: null,
  gatheringStartsAt: null,
  gatheringCity: null,
  gatheringType: null,
  gatheringPresentationMode: null,
  gatheringSeatContext: null,
  gatheringHostCreatedForMember: false,
  gatheringIsPartnerVenue: false,
  gatheringSafeFirstDateSpace: false,
  gatheringAttendeeCount: 0,
  sourceAvailable: true,
});

describe('Circle Pulse presentation', () => {
  const hostNote = makeItem('host-note', 'host_note', 100);
  const promptOne = makeItem('prompt-one', 'prompt', 90);
  const promptTwo = makeItem('prompt-two', 'prompt', 60);
  const gathering = makeItem('gathering', 'gathering', 70);
  const loveSeat = makeItem('love-seat', 'love_seat', 50);
  const media = makeItem('media', 'media', 40);

  it('keeps the host note separate and resolves supporting lanes in product order', () => {
    const result = resolveCirclePulsePresentation([media, loveSeat, gathering, promptTwo, promptOne, hostNote]);

    expect(result.hostNoteItems.map((item) => item.id)).toEqual(['host-note']);
    expect(result.heroItem?.id).toBe('prompt-one');
    expect(result.groups.map((group) => group.key)).toEqual(['prompt', 'gathering', 'love_seat', 'media']);
  });

  it('lets a live gathering temporarily override the pinned editorial hero', () => {
    const result = resolveCirclePulsePresentation(
      [promptOne, gathering],
      new Set([gathering.gatheringId!]),
    );

    expect(result.heroItem?.id).toBe('gathering');
    expect(getCirclePulseHeroEyebrow(result.heroItem!, true)).toBe('RIGHT NOW');
  });

  it('reorders only within an item lane', () => {
    const ids = reorderCirclePulseLane([promptOne, gathering, promptTwo, media], promptTwo.id, -1);

    expect(ids).toEqual(['prompt-two', 'gathering', 'prompt-one', 'media']);
  });

  it('promotes an eligible item while keeping the opening note out of hero selection', () => {
    const ids = promoteCirclePulseHero([hostNote, promptOne, gathering], gathering.id);

    expect(ids).toEqual(['gathering', 'host-note', 'prompt-one']);
  });

  it('keeps the member-facing editorial journal intentionally finite', () => {
    const manyPrompts = Array.from({ length: 10 }, (_, index) => makeItem(`prompt-${index}`, 'prompt', 90 - index));
    const result = resolveCirclePulsePresentation([hostNote, ...manyPrompts]);
    const visibleEditorialCount = (result.heroItem ? 1 : 0)
      + result.groups.reduce((count, group) => count + group.items.length, 0)
      + result.hostNoteItems.length;

    expect(visibleEditorialCount).toBe(8);
  });
});
