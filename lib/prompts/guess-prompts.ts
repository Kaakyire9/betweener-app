import type { GuessMode } from '@/types/user-profile';

export const DEFAULT_GUESS_REVEAL_POLICY = 'never' as const;

export function normalizeGuessText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

export function sanitizeGuessOptions(options: string[], correctAnswer: string) {
  const normalizedCorrect = normalizeGuessText(correctAnswer);
  const seen = new Set<string>();
  const cleaned = [correctAnswer, ...options]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = normalizeGuessText(item);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  if (!cleaned.some((item) => normalizeGuessText(item) === normalizedCorrect)) {
    cleaned.unshift(correctAnswer.trim());
  }

  return cleaned;
}

export function shuffleOptions(options: string[]) {
  const next = [...options];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function isGuessPrompt(mode?: string | null) {
  return mode === 'guess';
}

export function isMultipleChoiceGuess(mode?: GuessMode | null) {
  return mode === 'multiple_choice';
}
