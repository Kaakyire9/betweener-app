export type ProfileDisplayContext =
  | 'global-dating'
  | 'circle-discover'
  | 'circle-community'
  | 'intent'
  | 'chat';

const CONTEXTS = new Set<ProfileDisplayContext>([
  'global-dating',
  'circle-discover',
  'circle-community',
  'intent',
  'chat',
]);

export function parseProfileDisplayContext(
  value: string | string[] | undefined,
  source?: string,
): ProfileDisplayContext {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? '').trim().toLowerCase();
  if (CONTEXTS.has(normalized as ProfileDisplayContext)) return normalized as ProfileDisplayContext;
  if (String(source ?? '').toLowerCase() === 'circle_people') return 'circle-community';
  if (String(source ?? '').toLowerCase() === 'circle_discover') return 'circle-discover';
  return 'global-dating';
}

export const isCommunityProfileContext = (context: ProfileDisplayContext) =>
  context === 'circle-community';
