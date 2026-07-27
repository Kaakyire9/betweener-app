export type ChatListEnrichmentPlan = {
  peerUserIds: string[];
  missingProfileUserIds: string[];
  reusedProfileCount: number;
};

export const buildChatListEnrichmentPlan = (
  peerUserIds: string[],
  reusableProfileUserIds: Iterable<string>,
): ChatListEnrichmentPlan => {
  const normalizedPeerUserIds = Array.from(
    new Set(
      peerUserIds.filter(
        (peerUserId) => typeof peerUserId === 'string' && peerUserId.trim().length > 0,
      ),
    ),
  );
  const reusableProfileIds = new Set(
    Array.from(reusableProfileUserIds).filter(
      (peerUserId) => typeof peerUserId === 'string' && peerUserId.trim().length > 0,
    ),
  );
  const missingProfileUserIds = normalizedPeerUserIds.filter(
    (peerUserId) => !reusableProfileIds.has(peerUserId),
  );

  return {
    peerUserIds: normalizedPeerUserIds,
    missingProfileUserIds,
    reusedProfileCount: normalizedPeerUserIds.length - missingProfileUserIds.length,
  };
};

export const getPeerUserIdsNeedingLocalHistory = (
  peerUserIds: string[],
  knownMessagedPeerUserIds: ReadonlySet<string>,
) =>
  Array.from(new Set(peerUserIds.filter(Boolean))).filter(
    (peerUserId) => !knownMessagedPeerUserIds.has(peerUserId),
  );
