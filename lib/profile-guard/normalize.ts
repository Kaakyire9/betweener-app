export type NormalizedProfileText = {
  originalText: string;
  normalizedText: string;
  compactText: string;
  digitNormalizedText: string;
};

const digitMap: Record<string, string> = {
  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',
  '\u06f0': '0', '\u06f1': '1', '\u06f2': '2', '\u06f3': '3', '\u06f4': '4',
  '\u06f5': '5', '\u06f6': '6', '\u06f7': '7', '\u06f8': '8', '\u06f9': '9',
};

export const normalizeProfileText = (value: string | null | undefined): NormalizedProfileText => {
  const originalText = value ?? '';
  const normalizedText = originalText
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\uFE0F\u20E3]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
    .replace(/[•·‧]/g, '.')
    .replace(/[–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const digitNormalizedText = normalizedText.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (char) => digitMap[char] ?? char);
  return {
    originalText,
    normalizedText,
    compactText: digitNormalizedText.replace(/[\s.\-_/()\[\]{}]+/g, ''),
    digitNormalizedText,
  };
};
