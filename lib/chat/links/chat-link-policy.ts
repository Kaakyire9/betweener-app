export type ChatLinkMatch = {
  displayText: string;
  normalizedUrl: string;
  host: string;
  start: number;
  end: number;
  secure: boolean;
};

const CHAT_LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>{}\[\]"']+/giu;
const TRAILING_LINK_PUNCTUATION = /[.,!?;:]+$/u;

const trimUnbalancedClosingCharacters = (value: string) => {
  let result = value.replace(TRAILING_LINK_PUNCTUATION, '');
  const pairs = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ] as const;
  pairs.forEach(([open, close]) => {
    while (
      result.endsWith(close) &&
      result.split(close).length > result.split(open).length
    ) {
      result = result.slice(0, -1);
    }
  });
  return result;
};

export const normalizeChatLink = (rawValue: string): ChatLinkMatch | null => {
  const displayText = trimUnbalancedClosingCharacters(rawValue.trim());
  if (!displayText || displayText.length > 2048) return null;
  const candidate = displayText.toLowerCase().startsWith('www.')
    ? `https://${displayText}`
    : displayText;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return {
      displayText,
      normalizedUrl: parsed.toString(),
      host: parsed.hostname,
      start: 0,
      end: displayText.length,
      secure: parsed.protocol === 'https:',
    };
  } catch {
    return null;
  }
};

export const extractChatLinks = (text: string): ChatLinkMatch[] => {
  const matches: ChatLinkMatch[] = [];
  for (const result of text.matchAll(CHAT_LINK_PATTERN)) {
    if (typeof result.index !== 'number' || !result[0]) continue;
    const normalized = normalizeChatLink(result[0]);
    if (!normalized) continue;
    matches.push({
      ...normalized,
      start: result.index,
      end: result.index + normalized.displayText.length,
    });
  }
  return matches;
};
