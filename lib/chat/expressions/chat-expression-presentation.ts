import type { ChatExpressionMediaKind } from './chat-gif-provider';

const KINDS = new Set<ChatExpressionMediaKind>([
  'giphy_gif',
  'giphy_sticker',
  'giphy_emoji',
  'giphy_text',
]);

export const parseChatExpressionMediaKind = (
  value: unknown,
): ChatExpressionMediaKind | null => (
  typeof value === 'string' && KINDS.has(value as ChatExpressionMediaKind)
    ? value as ChatExpressionMediaKind
    : null
);

export const isTransparentChatExpression = (kind: unknown) => (
  kind === 'giphy_sticker' || kind === 'giphy_emoji' || kind === 'giphy_text'
);

export const isChatExpression = (kind: unknown): kind is ChatExpressionMediaKind => (
  KINDS.has(kind as ChatExpressionMediaKind)
);

export const getChatExpressionPreviewLabel = (kind: unknown) => {
  switch (parseChatExpressionMediaKind(kind)) {
    case 'giphy_gif':
      return 'GIF';
    case 'giphy_sticker':
      return 'Sticker';
    case 'giphy_emoji':
      return 'Animated emoji';
    case 'giphy_text':
      return 'Animated text';
    default:
      return null;
  }
};

export const getChatExpressionFrame = ({
  kind,
  sourceWidth,
  sourceHeight,
  availableWidth,
}: {
  kind: ChatExpressionMediaKind;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  availableWidth: number;
}) => {
  const maxWidth = Math.min(availableWidth, kind === 'giphy_gif'
    ? 244
    : kind === 'giphy_text'
      ? 196
      : kind === 'giphy_sticker'
        ? 172
        : 136);
  const rawRatio = Number(sourceWidth) > 0 && Number(sourceHeight) > 0
    ? Number(sourceWidth) / Number(sourceHeight)
    : 1;
  const ratio = Math.max(0.72, Math.min(rawRatio, 1.65));
  const rawHeight = maxWidth / ratio;
  const maxHeight = kind === 'giphy_gif' ? 260 : maxWidth;
  const minHeight = kind === 'giphy_gif' ? 132 : Math.min(96, maxWidth);
  return {
    width: Math.round(maxWidth),
    height: Math.round(Math.max(minHeight, Math.min(rawHeight, maxHeight))),
  };
};
