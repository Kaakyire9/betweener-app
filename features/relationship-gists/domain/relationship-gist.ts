export const RELATIONSHIP_GIST_PERSPECTIVES = [
  'general',
  'christian',
  'muslim',
  'culture',
  'safety',
  'communication',
] as const;

export type RelationshipGistPerspective = typeof RELATIONSHIP_GIST_PERSPECTIVES[number];

export type RelationshipGist = {
  id: string;
  title: string;
  short_body?: string | null;
  body: string;
  perspective?: string | null;
  circle_id?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
};

export type RelationshipGistReaderSection = {
  id: string;
  title: string | null;
  body: string;
};

const normalizeCopy = (value?: string | null) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export const getPreferredRelationshipGistPerspective = (religion?: string | null) => {
  const normalized = String(religion ?? '').trim().toUpperCase();
  if (normalized === 'CHRISTIAN') return 'christian';
  if (normalized === 'MUSLIM') return 'muslim';
  return 'general';
};

export const getEligibleRelationshipGistPerspectiveOrder = (religion?: string | null) => {
  const preferred = getPreferredRelationshipGistPerspective(religion);
  if (preferred === 'christian') return ['christian', 'general', 'culture', 'safety'] as const;
  if (preferred === 'muslim') return ['muslim', 'general', 'culture', 'safety'] as const;
  return ['general', 'culture', 'safety', 'communication'] as const;
};

export const buildVisibleRelationshipGistPerspectives = (
  available: string[],
  religion?: string | null,
) => {
  const eligible = getEligibleRelationshipGistPerspectiveOrder(religion);
  const visible = eligible.filter((item) => available.includes(item));
  if (visible.length) return visible;
  if (available.includes('general')) return ['general'];
  return available.slice(0, 1);
};

export const buildExplicitRelationshipGistPerspectives = (available: string[]) => {
  const supported = new Set<string>(RELATIONSHIP_GIST_PERSPECTIVES);
  const normalized = Array.from(new Set(
    available.map((item) => String(item ?? '').trim().toLowerCase()),
  )).filter((item) => supported.has(item));
  return RELATIONSHIP_GIST_PERSPECTIVES.filter((item) => normalized.includes(item));
};

export const buildExplicitRelationshipGistSelectionOrder = (
  selectedPerspective: string,
  available: string[],
) => Array.from(new Set([
  selectedPerspective,
  'general',
  ...buildExplicitRelationshipGistPerspectives(available),
]));

export const buildRelationshipGistSelectionOrder = (
  selectedPerspective: string,
  religion?: string | null,
) => Array.from(new Set([
  selectedPerspective,
  ...getEligibleRelationshipGistPerspectiveOrder(religion),
  'general',
  'culture',
  'safety',
  'communication',
]));

export const getRelationshipGistReadTimeLabel = (
  gist?: Pick<RelationshipGist, 'body'> | null,
) => {
  const words = String(gist?.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 180))} min read`;
};

export const getRelationshipGistLensSupport = (value?: string | null) => {
  switch (String(value ?? 'general').toLowerCase()) {
    case 'christian':
      return 'Read this through a Christian lens that values clarity, character, and consistency.';
    case 'muslim':
      return 'Read this through a Muslim lens that values intention, adab, and emotional steadiness.';
    case 'culture':
      return 'Read this through a cultural lens that respects family context, timing, and shared norms.';
    case 'safety':
      return 'Read this through a safety lens that centers boundaries, pacing, and emotional protection.';
    case 'communication':
      return 'Read this through a communication lens that favours directness, listening, and consistency.';
    default:
      return 'Read this as broad relationship guidance designed to protect clarity before attachment deepens.';
  }
};

export const buildRelationshipGistReaderContent = (
  gist: RelationshipGist | null,
  perspective: string,
) => {
  const lead = gist?.short_body?.trim() || gist?.body?.trim() || 'No guidance yet.';
  const paragraphs = String(gist?.body ?? '')
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const contentParagraphs = paragraphs.length && normalizeCopy(paragraphs[0]) === normalizeCopy(lead)
    ? paragraphs.slice(1)
    : paragraphs;
  let sections: RelationshipGistReaderSection[] = contentParagraphs.map((paragraph, index) => {
    const headingMatch = paragraph.match(/^([^:]{3,56}):\s+(.+)$/s);
    return {
      id: `${index}:${paragraph.slice(0, 24)}`,
      title: headingMatch ? headingMatch[1].trim() : null,
      body: headingMatch ? headingMatch[2].trim() : paragraph,
    };
  });
  const finalSection = sections[sections.length - 1];
  const finalHeading = normalizeCopy(finalSection?.title);
  const hasEditorialTakeaway = ['takeaway', 'remember', 'carry this with you'].includes(finalHeading);
  const takeaway = hasEditorialTakeaway ? finalSection.body : null;
  if (hasEditorialTakeaway) sections = sections.slice(0, -1);

  return {
    lead,
    sections,
    takeaway,
    framing: getRelationshipGistLensSupport(perspective),
  };
};

export const calculateRelationshipGistProgress = ({
  offsetY,
  contentHeight,
  viewportHeight,
}: {
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
}) => {
  if (contentHeight <= viewportHeight + 1) return 1;
  const maxOffset = contentHeight - viewportHeight;
  return Math.max(0, Math.min(1, offsetY / maxOffset));
};

export type RelationshipGistProgressSignal = {
  progress: number;
  scrollCompleted: boolean;
  needsReadAcknowledgement: boolean;
};

export const calculateRelationshipGistReaderProgress = ({
  offsetY,
  contentHeight,
  viewportHeight,
  previousProgress = 0,
  layoutReady,
  readAcknowledged = false,
}: {
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
  previousProgress?: number;
  layoutReady: boolean;
  readAcknowledged?: boolean;
}): RelationshipGistProgressSignal => {
  const previous = Math.max(0, Math.min(1, previousProgress));
  if (!layoutReady || contentHeight <= 0 || viewportHeight <= 0) {
    return { progress: previous, scrollCompleted: false, needsReadAcknowledgement: false };
  }
  if (readAcknowledged) {
    return { progress: 1, scrollCompleted: false, needsReadAcknowledgement: false };
  }
  if (contentHeight <= viewportHeight + 1) {
    return {
      progress: Math.min(previous, 0.99),
      scrollCompleted: false,
      needsReadAcknowledgement: true,
    };
  }

  const maxOffset = contentHeight - viewportHeight;
  const progress = Math.max(previous, Math.max(0, Math.min(1, offsetY / maxOffset)));
  const scrollCompleted = progress >= 0.995;
  return {
    progress: scrollCompleted ? 1 : progress,
    scrollCompleted,
    needsReadAcknowledgement: false,
  };
};

export const findRelationshipGistReadingAnchor = (
  offsetY: number,
  sectionOffsets: Record<string, number>,
) => Object.entries(sectionOffsets)
  .filter(([, top]) => Number.isFinite(top) && top <= offsetY + 24)
  .sort((left, right) => right[1] - left[1])[0] ?? null;

export const resolveRelationshipGistResumeOffset = ({
  anchor,
  anchorOffset,
  progress,
  sectionOffsets,
  contentHeight,
  viewportHeight,
}: {
  anchor: string | null;
  anchorOffset: number | null;
  progress: number;
  sectionOffsets: Record<string, number>;
  contentHeight: number;
  viewportHeight: number;
}) => {
  if (contentHeight <= 0 || viewportHeight <= 0) return null;
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  if (anchor) {
    const anchorTop = sectionOffsets[anchor];
    if (!Number.isFinite(anchorTop)) return null;
    return Math.max(0, Math.min(maxOffset, anchorTop + Math.max(0, anchorOffset ?? 0)));
  }
  return maxOffset * Math.max(0, Math.min(1, progress));
};
