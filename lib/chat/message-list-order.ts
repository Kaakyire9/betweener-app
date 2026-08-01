/**
 * Chat messages are stored chronologically, but rendered newest-first inside
 * an inverted list so the latest message is always the first mounted cell.
 */
export const toNewestFirstMessageOrder = <T>(messages: readonly T[]): T[] =>
  [...messages].reverse();

export const chronologicalIndexToInvertedIndex = (
  messageCount: number,
  chronologicalIndex: number,
): number => messageCount - 1 - chronologicalIndex;

export const invertedIndexToChronologicalIndex = (
  messageCount: number,
  invertedIndex: number,
): number => messageCount - 1 - invertedIndex;
