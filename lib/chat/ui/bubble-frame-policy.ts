import type { MessageType } from '../../../components/chat/types';

export const CHAT_BUBBLE_FRAME_ACCENTS = {
  teal: '#35C3C7',
  lavender: '#A79AE8',
  rose: '#CF839F',
} as const;

export type ChatBubbleAccentFamily = keyof typeof CHAT_BUBBLE_FRAME_ACCENTS;
export type ChatBubbleFrameRole = 'none' | 'text' | 'media' | 'quiet';
export type ChatBubbleDeliveryTone = 'settled' | 'pending' | 'failed';

export type ChatBubbleFramePolicy = {
  role: ChatBubbleFrameRole;
  accentFamily: ChatBubbleAccentFamily;
  accentColor: string;
  deliveryTone: ChatBubbleDeliveryTone;
  ownsOuterFrame: boolean;
  glow: boolean;
};

const FRAME_ACCENT_SALT = 'betweener-chat-frame-v1';
const TRANSPARENT_EXPRESSION_KINDS = new Set([
  'giphy_sticker',
  'giphy_emoji',
  'giphy_text',
]);

const hashIdentity = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** Stable weighted selection: teal 45%, lavender 40%, rose 15%. */
export const getChatBubbleAccentFamily = (identity: string): ChatBubbleAccentFamily => {
  const bucket = hashIdentity(`${FRAME_ACCENT_SALT}:${identity}`) % 100;
  if (bucket < 45) return 'teal';
  if (bucket < 85) return 'lavender';
  return 'rose';
};

export const getChatBubbleFrameIdentity = (message: MessageType) => (
  message.clientMessageId || message.mediaGroupId || message.id
);

const getDeliveryTone = (status: MessageType['status']): ChatBubbleDeliveryTone => {
  if (status === 'failed') return 'failed';
  if (status === 'queued' || status === 'sending') return 'pending';
  return 'settled';
};

export const getChatBubbleFramePolicy = ({
  message,
  emojiOnly = false,
}: {
  message: MessageType;
  emojiOnly?: boolean;
}): ChatBubbleFramePolicy => {
  const accentFamily = getChatBubbleAccentFamily(getChatBubbleFrameIdentity(message));
  const deliveryTone = getDeliveryTone(message.status);
  const transparentExpression = TRANSPARENT_EXPRESSION_KINDS.has(message.mediaKind ?? '');

  let role: ChatBubbleFrameRole;
  if (
    message.type === 'system' ||
    message.isSystem ||
    emojiOnly ||
    message.type === 'mood_sticker' ||
    transparentExpression
  ) {
    role = 'none';
  } else if (
    (message.type === 'image' || message.type === 'video') &&
    !message.isViewOnce
  ) {
    role = 'media';
  } else if (message.type === 'text') {
    role = 'text';
  } else {
    role = 'quiet';
  }

  return {
    role,
    accentFamily,
    accentColor: CHAT_BUBBLE_FRAME_ACCENTS[accentFamily],
    deliveryTone,
    ownsOuterFrame: role === 'text' || role === 'quiet',
    glow: role === 'media' && deliveryTone === 'settled',
  };
};
