export type ViewOnceStatus = {
  viewedByMe: boolean;
  viewedByPeer: boolean;
};

export type ViewOnceStatusMap = Record<string, ViewOnceStatus>;

const EMPTY_VIEW_ONCE_STATUS: ViewOnceStatus = {
  viewedByMe: false,
  viewedByPeer: false,
};

/** View-once receipts are irreversible and must only move forward. */
export const mergeViewOnceStatus = (
  current: ViewOnceStatus | undefined,
  incoming: Partial<ViewOnceStatus> | undefined,
): ViewOnceStatus => ({
  viewedByMe: Boolean(current?.viewedByMe || incoming?.viewedByMe),
  viewedByPeer: Boolean(current?.viewedByPeer || incoming?.viewedByPeer),
});

export const mergeViewOnceStatusMaps = (
  current: ViewOnceStatusMap,
  incoming: ViewOnceStatusMap,
): ViewOnceStatusMap => {
  if (Object.keys(incoming).length === 0) return current;

  let changed = false;
  const next = { ...current };
  Object.entries(incoming).forEach(([messageId, status]) => {
    const merged = mergeViewOnceStatus(current[messageId], status);
    const previous = current[messageId] ?? EMPTY_VIEW_ONCE_STATUS;
    if (
      !current[messageId] ||
      merged.viewedByMe !== previous.viewedByMe ||
      merged.viewedByPeer !== previous.viewedByPeer
    ) {
      next[messageId] = merged;
      changed = true;
    }
  });
  return changed ? next : current;
};

export const buildViewOnceStatusFromReceipts = (args: {
  receipts: { message_id?: string | null; viewer_id?: string | null }[];
  currentUserId: string;
  peerUserId: string;
}): ViewOnceStatusMap => {
  const statuses: ViewOnceStatusMap = {};
  args.receipts.forEach((receipt) => {
    if (!receipt.message_id || !receipt.viewer_id) return;
    statuses[receipt.message_id] = mergeViewOnceStatus(statuses[receipt.message_id], {
      viewedByMe: receipt.viewer_id === args.currentUserId,
      viewedByPeer: receipt.viewer_id === args.peerUserId,
    });
  });
  return statuses;
};

export const isViewOnceAlreadyConsumedError = (error: unknown) => {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return `${String(candidate?.code ?? '')} ${String(candidate?.message ?? '')}`
    .toLowerCase()
    .includes('view_once_already_consumed');
};
