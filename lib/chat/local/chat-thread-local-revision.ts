/** Creates a stable content revision for coalescing equivalent local snapshots. */
export const buildChatThreadLocalRevision = <Message>(
  messages: Message[],
  hasMore: boolean,
  oldestTimestamp: Date | null,
  getMessageRevisionKey: (message: Message) => string,
) =>
  [
    hasMore ? 'more' : 'complete',
    oldestTimestamp?.getTime() ?? '',
    ...messages.map(getMessageRevisionKey),
  ].join('\u001e');
