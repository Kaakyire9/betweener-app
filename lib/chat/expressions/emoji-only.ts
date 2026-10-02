import emojiRegex from 'emoji-regex';

export type EmojiOnlyPresentation = {
  count: 1 | 2 | 3;
  fontSize: 64 | 52 | 44;
  lineHeight: 72 | 60 | 52;
  sequences: string[];
};

const ISOLATED_EMOJI_MODIFIER = /^\p{Emoji_Modifier}$/u;
const ISOLATED_REGIONAL_INDICATOR = /^\p{Regional_Indicator}$/u;
const PERMITTED_WHITESPACE = /^\s*$/u;

/**
 * Classifies complete Unicode emoji sequences without changing stored text.
 * `emoji-regex` supplies deterministic RGI sequence matching; the additional
 * guards reject fragments that the Unicode data exposes as standalone tokens.
 */
export const getEmojiOnlyPresentation = (
  value?: string | null,
): EmojiOnlyPresentation | null => {
  const text = String(value ?? '');
  if (!text.trim()) return null;

  const matcher = emojiRegex();
  const sequences: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const gap = text.slice(cursor, match.index);
    const sequence = match[0];
    if (
      !PERMITTED_WHITESPACE.test(gap)
      || ISOLATED_EMOJI_MODIFIER.test(sequence)
      || ISOLATED_REGIONAL_INDICATOR.test(sequence)
    ) {
      return null;
    }
    sequences.push(sequence);
    cursor = match.index + sequence.length;
  }

  if (!PERMITTED_WHITESPACE.test(text.slice(cursor))) return null;
  if (sequences.length < 1 || sequences.length > 3) return null;

  const count = sequences.length as 1 | 2 | 3;
  if (count === 1) return { count, fontSize: 64, lineHeight: 72, sequences };
  if (count === 2) return { count, fontSize: 52, lineHeight: 60, sequences };
  return { count, fontSize: 44, lineHeight: 52, sequences };
};

export const isEmojiOnlyMessage = (value?: string | null) => (
  getEmojiOnlyPresentation(value) !== null
);
