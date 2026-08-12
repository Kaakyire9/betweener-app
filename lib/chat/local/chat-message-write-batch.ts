export const CHAT_MESSAGE_WRITE_COLUMN_COUNT = 21;
export const CHAT_MESSAGE_WRITE_BATCH_SIZE = 20;
export const CHAT_MESSAGE_CLEANUP_BATCH_SIZE = 100;

export const chunkChatMessageWrites = <T>(
  values: T[],
  batchSize = CHAT_MESSAGE_WRITE_BATCH_SIZE,
): T[][] => {
  if (values.length === 0) return [];
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += safeBatchSize) {
    batches.push(values.slice(index, index + safeBatchSize));
  }
  return batches;
};

export const buildChatMessageValueGroups = (
  rowCount: number,
  columnCount = CHAT_MESSAGE_WRITE_COLUMN_COUNT,
) => {
  const safeRowCount = Math.max(0, Math.floor(rowCount));
  const safeColumnCount = Math.max(1, Math.floor(columnCount));
  const group = `(${Array.from({ length: safeColumnCount }, () => '?').join(', ')})`;
  return Array.from({ length: safeRowCount }, () => group).join(', ');
};

export const buildCanonicalMessageCleanupPredicates = (rowCount: number) =>
  Array.from(
    { length: Math.max(0, Math.floor(rowCount)) },
    () => '(local_id = ? and id <> ?)',
  ).join(' or ');
