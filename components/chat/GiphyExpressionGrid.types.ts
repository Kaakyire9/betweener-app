import type { ChatGifResult } from '@/lib/chat/expressions/chat-gif-provider';

export type GiphyExpressionMode = 'gifs' | 'animated-text';

export type GiphyExpressionGridProps = {
  apiKey: string;
  query: string;
  mode: GiphyExpressionMode;
  isDark: boolean;
  tint: string;
  textColor: string;
  mutedTextColor: string;
  onSelect: (gif: ChatGifResult) => void;
};
