import type { MessageType } from '../../../components/chat/types';

export const reconcileFetchedThreadRows =<TRow>({
  rows,
  previousMessages,
  hiddenMessageIds,
  isIncrementalFetch,
  mapRow,
  mergeOfflineMedia,
  mergeReceipt,
}: {
  rows: TRow[];
  previousMessages: MessageType[];
  hiddenMessageIds: ReadonlySet<string>;
  isIncrementalFetch: boolean;
  mapRow: (row: TRow) => MessageType;
  mergeOfflineMedia: (next: MessageType, previous?: MessageType) => MessageType;
  mergeReceipt: (previous: MessageType, next: MessageType) => MessageType;
}) => {
  const previousById = new Map(previousMessages.map((message) => [message.id, message] as const));
  const mapped = rows
    .map((row) => {
      const next = mapRow(row);
      const previous = previousById.get(next.id);
      const withOfflineMedia = mergeOfflineMedia(next, previous);
      return previous ? mergeReceipt(previous, withOfflineMedia) : withOfflineMedia;
    })
    .filter((message) => !hiddenMessageIds.has(message.id));
  return isIncrementalFetch ? mapped : mapped.reverse();
};
