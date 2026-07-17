let activeOwnerUserId: string | null = null;
let activePeerUserId: string | null = null;
let activeToken: symbol | null = null;

export const setActiveChatThread = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
) => {
  const token = Symbol("active-chat-thread");
  activeOwnerUserId = ownerUserId ?? null;
  activePeerUserId = peerUserId ?? null;
  activeToken = token;
  return token;
};

export const clearActiveChatThread = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
  token?: symbol | null,
) => {
  if (activeOwnerUserId !== (ownerUserId ?? null)) return;
  if (activePeerUserId !== (peerUserId ?? null)) return;
  if (token && activeToken !== token) return;
  activeOwnerUserId = null;
  activePeerUserId = null;
  activeToken = null;
};

export const isActiveChatThread = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
) =>
  Boolean(
    ownerUserId &&
      peerUserId &&
      activeOwnerUserId === ownerUserId &&
      activePeerUserId === peerUserId,
  );

export const resolveThreadUnreadCount = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
  unreadCount: number,
) => (isActiveChatThread(ownerUserId, peerUserId) ? 0 : Math.max(0, unreadCount));
