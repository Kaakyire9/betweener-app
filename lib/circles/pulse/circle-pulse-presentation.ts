import type { CirclePulseItem, CirclePulseItemType } from './circle-pulse-types';

export const CIRCLE_PULSE_VISIBLE_ITEM_LIMIT = 8;

export type CirclePulseLaneKey = 'host_note' | 'prompt' | 'gathering' | 'love_seat' | 'media' | 'welcome';

export type CirclePulseLaneDefinition = {
  key: Exclude<CirclePulseLaneKey, 'host_note' | 'welcome'>;
  eyebrow: string;
  title: string;
  description: string;
  type: Exclude<CirclePulseItemType, 'host_note' | 'welcome'>;
};

export const CIRCLE_PULSE_LANES: readonly CirclePulseLaneDefinition[] = [
  {
    key: 'prompt',
    eyebrow: 'IN CONVERSATION',
    title: 'Questions worth staying for',
    description: 'A thoughtful invitation to join the conversation.',
    type: 'prompt',
  },
  {
    key: 'gathering',
    eyebrow: 'COME TOGETHER',
    title: 'Gatherings on the horizon',
    description: 'Upcoming ways to meet, take part and belong.',
    type: 'gathering',
  },
  {
    key: 'love_seat',
    eyebrow: 'FEATURED CONNECTION',
    title: 'The Love Seat',
    description: 'A consent-led member feature with shared Circle context.',
    type: 'love_seat',
  },
  {
    key: 'media',
    eyebrow: 'FROM THE CIRCLE',
    title: 'Moments worth opening',
    description: 'Photos, films and stories shared with this community.',
    type: 'media',
  },
] as const;

export const sortCirclePulseItems = (entries: readonly CirclePulseItem[]) => (
  [...entries].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    const leftStartsAt = left.startsAt ? new Date(left.startsAt).getTime() : Number.NEGATIVE_INFINITY;
    const rightStartsAt = right.startsAt ? new Date(right.startsAt).getTime() : Number.NEGATIVE_INFINITY;
    if (leftStartsAt !== rightStartsAt) return rightStartsAt - leftStartsAt;
    const leftExpiresAt = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    const rightExpiresAt = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftExpiresAt !== rightExpiresAt) return leftExpiresAt - rightExpiresAt;
    return left.id.localeCompare(right.id);
  })
);

export const getCirclePulseLaneKey = (item: CirclePulseItem): CirclePulseLaneKey => item.type;

export const getCirclePulseHeroEyebrow = (item: CirclePulseItem, isLiveGathering: boolean) => {
  if (isLiveGathering) return 'RIGHT NOW';
  if (item.type === 'gathering') return 'COMING UP';
  if (item.type === 'prompt') return 'QUESTION OF THE MOMENT';
  if (item.type === 'love_seat') return 'FEATURED MEMBER';
  if (item.type === 'media') return 'NEW FROM THE CIRCLE';
  return 'FEATURED';
};

export const resolveCirclePulsePresentation = (
  entries: readonly CirclePulseItem[],
  liveGatheringIds: ReadonlySet<string> = new Set<string>(),
) => {
  const orderedItems = sortCirclePulseItems(entries);
  const welcomeItems = orderedItems.filter((item) => item.type === 'welcome');
  const hostNoteItems = orderedItems.filter((item) => item.type === 'host_note').slice(0, 1);
  const editorialCapacity = CIRCLE_PULSE_VISIBLE_ITEM_LIMIT - hostNoteItems.length;
  const editorialItems = orderedItems
    .filter((item) => item.type !== 'welcome' && item.type !== 'host_note')
    .slice(0, editorialCapacity);
  const liveHero = editorialItems.find((item) => item.gatheringId && liveGatheringIds.has(item.gatheringId));
  const heroItem = liveHero ?? editorialItems[0] ?? null;
  const supportingItems = editorialItems.filter((item) => item.id !== heroItem?.id);
  const groups = CIRCLE_PULSE_LANES.flatMap((definition) => {
    const items = supportingItems.filter((item) => item.type === definition.type);
    return items.length > 0 ? [{ ...definition, items }] : [];
  });

  return {
    orderedItems,
    welcomeItems,
    hostNoteItems,
    heroItem,
    groups,
  };
};

export const reorderCirclePulseLane = (
  entries: readonly CirclePulseItem[],
  itemId: string,
  direction: -1 | 1,
) => {
  const ordered = sortCirclePulseItems(entries);
  const item = ordered.find((entry) => entry.id === itemId);
  if (!item) return ordered.map((entry) => entry.id);
  const laneItems = ordered.filter((entry) => getCirclePulseLaneKey(entry) === getCirclePulseLaneKey(item));
  const laneIndex = laneItems.findIndex((entry) => entry.id === itemId);
  const target = laneItems[laneIndex + direction];
  if (!target) return ordered.map((entry) => entry.id);

  const itemIndex = ordered.findIndex((entry) => entry.id === item.id);
  const targetIndex = ordered.findIndex((entry) => entry.id === target.id);
  [ordered[itemIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[itemIndex]];
  return ordered.map((entry) => entry.id);
};

export const promoteCirclePulseHero = (entries: readonly CirclePulseItem[], itemId: string) => {
  const ordered = sortCirclePulseItems(entries);
  const selected = ordered.find((item) => item.id === itemId);
  if (!selected || selected.type === 'host_note' || selected.type === 'welcome') {
    return ordered.map((item) => item.id);
  }
  return [selected.id, ...ordered.filter((item) => item.id !== selected.id).map((item) => item.id)];
};
