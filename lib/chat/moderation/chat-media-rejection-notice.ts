export type ChatMediaRejectionReasonCategory =
  | 'MEDIA_POLICY_REJECTED'
  | 'CONTACT_OR_PROMOTION'
  | 'ILLEGAL_CONTENT'
  | 'UNSAFE_MEDIA';

export type ChatMediaRejectionNotice = {
  id: string;
  ownerUserId: string;
  threadId: string;
  localMessageId: string;
  attachmentType: 'image';
  reasonCategory: ChatMediaRejectionReasonCategory;
  viewOnce: boolean;
  createdAt: number;
};

type Listener = (notice: ChatMediaRejectionNotice) => void;

const listeners = new Set<Listener>();

export const publishChatMediaRejectionNotice = (
  notice: Omit<ChatMediaRejectionNotice, 'id' | 'createdAt'>,
) => {
  const event: ChatMediaRejectionNotice = {
    ...notice,
    id: `chat-media-rejection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  listeners.forEach((listener) => listener(event));
  return event;
};

export const subscribeChatMediaRejectionNotices = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
