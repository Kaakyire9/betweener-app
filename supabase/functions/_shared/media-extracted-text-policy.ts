import { assessPrivateMessageRules, type ContentSafetyAssessment } from './content-safety.ts';

export type MediaTextSurface = 'public_profile_media' | 'private_chat_media';

export type MediaTextPolicyDecision = {
  decision: 'ALLOW' | 'BLOCK';
  categories: string[];
  normalizedText: string;
};

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/gu;
const KEYCAPS = /([0-9])\uFE0F?\u20E3/gu;
const SPACES = /\s+/gu;

const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export const normalizeMediaExtractedText = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .replace(ZERO_WIDTH, '')
  .replace(KEYCAPS, '$1')
  .replace(/[٠-٩۰-۹]/gu, (digit) => DIGIT_MAP[digit] ?? digit)
  .replace(SPACES, ' ')
  .trim()
  .toLowerCase();

const PUBLIC_RULES: ReadonlyArray<{ category: string; pattern: RegExp }> = [
  { category: 'PHONE_CONTACT', pattern: /(?:\+?\d[\s().-]*){7,15}/u },
  { category: 'EMAIL_CONTACT', pattern: /\b[a-z0-9._%+-]+\s*(?:@|\bat\b)\s*[a-z0-9.-]+\s*(?:\.|\bdot\b)\s*[a-z]{2,}\b/iu },
  { category: 'EXTERNAL_URL', pattern: /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|link|ly|uk)\b)/iu },
  { category: 'SOCIAL_HANDLE', pattern: /(?:^|\s)@[a-z0-9._-]{2,32}\b/iu },
  { category: 'EXTERNAL_PLATFORM', pattern: /\b(?:whats?app|telegram|signal|snapchat|instagram|insta|tiktok|onlyfans)\b/iu },
  { category: 'COMMERCIAL_SOLICITATION', pattern: /\b(?:subscribe|subscription|book\s+me|paid\s+page|private\s+page|premium\s+content|cashapp|paypal|send\s+money)\b/iu },
];

export function assessMediaExtractedText(
  value: unknown,
  surface: MediaTextSurface,
): MediaTextPolicyDecision {
  const normalizedText = normalizeMediaExtractedText(value);
  if (!normalizedText) return { decision: 'ALLOW', categories: [], normalizedText };

  if (surface === 'private_chat_media') {
    const assessment = assessPrivateMessageRules(normalizedText);
    return {
      decision: assessment.decision === 'BLOCK' ? 'BLOCK' : 'ALLOW',
      categories: assessment.categories,
      normalizedText,
    };
  }

  const categories = PUBLIC_RULES
    .filter((rule) => rule.pattern.test(normalizedText))
    .map((rule) => rule.category);
  return {
    decision: categories.length ? 'BLOCK' : 'ALLOW',
    categories: [...new Set(categories)],
    normalizedText,
  };
}

export function mergeExtractedTextPolicy(
  assessment: ContentSafetyAssessment,
  policy: MediaTextPolicyDecision,
): ContentSafetyAssessment {
  if (policy.decision === 'ALLOW') return assessment;
  return {
    ...assessment,
    decision: 'BLOCK',
    categories: [...new Set([...assessment.categories, ...policy.categories])],
    riskScore: Math.max(assessment.riskScore, 1),
    extractedText: assessment.extractedText || policy.normalizedText,
    scores: { ...assessment.scores, deterministic_contact_guard: 1 },
    failureReason: null,
  };
}
