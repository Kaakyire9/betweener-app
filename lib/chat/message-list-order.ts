export type ChronologicalListMetrics = {
  contentHeight: number;
  layoutHeight: number;
  offsetY: number;
};

/**
 * Chat data and FlashList share chronological indexes. FlashList starts from
 * the bottom, so reply jumps never need an inverted-index conversion.
 */
export const chronologicalIndexToListIndex = (chronologicalIndex: number): number =>
  chronologicalIndex;

export const getChronologicalListDistanceToBottom = ({
  contentHeight,
  layoutHeight,
  offsetY,
}: ChronologicalListMetrics): number =>
  Math.max(0, contentHeight - layoutHeight - offsetY);
