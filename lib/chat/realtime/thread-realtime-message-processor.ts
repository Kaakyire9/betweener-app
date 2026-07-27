export const processThreadRealtimeMessage = async <TRow, TMessage>({
  row,
  hydrate,
  map,
  persist,
  markSyncSucceeded,
  getCursor,
}: {
  row: TRow;
  hydrate: (row: TRow) => Promise<TRow>;
  map: (row: TRow) => TMessage;
  persist: (message: TMessage) => Promise<void>;
  markSyncSucceeded: (cursor: string | null | undefined) => Promise<void> | void;
  getCursor: (row: TRow) => string | null | undefined;
}) => {
  const canonicalRow = await hydrate(row);
  const message = map(canonicalRow);
  await Promise.all([
    persist(message),
    markSyncSucceeded(getCursor(canonicalRow)),
  ]);
  return { canonicalRow, message };
};
