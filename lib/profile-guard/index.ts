import { normalizeProfileText } from './normalize.ts';
import type { ModerationSignal, ProfileModerationResult } from './types.ts';

const numberWords: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
};

const signal = (category: ModerationSignal['category'], confidence: number, detector: ModerationSignal['detector'], evidenceCode: string): ModerationSignal => ({ category, confidence, detector, evidenceCode });

function containsObfuscatedPhone(text: string): boolean {
  const tokens = text.match(/[a-z]+|\d/g) ?? [];
  let run = '';
  for (const token of tokens) {
    const digit = numberWords[token] ?? (/^\d$/.test(token) ? token : '');
    if (digit) {
      run += digit;
      if (run.length >= 9) return true;
    } else {
      run = '';
    }
  }
  return false;
}

/** Lightweight UX pre-check. PostgreSQL is the authoritative enforcement layer. */
export const moderatePublicProfileText = (value: string | null | undefined): ProfileModerationResult => {
  const text = normalizeProfileText(value);
  const signals: ModerationSignal[] = [];
  const digits = text.digitNormalizedText.replace(/[^\d]/g, '');
  if ((/(^|\D)\+?\d[\d .()\-/]{7,}\d($|\D)/.test(text.digitNormalizedText) && digits.length >= 9) || containsObfuscatedPhone(text.normalizedText)) {
    signals.push(signal('PHONE_CONTACT', 0.98, 'deterministic', 'CONTACT_NUMBER'));
  }
  if (/\b[\w.+-]+\s*(?:@|\[?at\]?)\s*[\w-]+\s*(?:\.|\[?dot\]?)\s*[a-z]{2,}\b/i.test(text.normalizedText)) {
    signals.push(signal('EMAIL_CONTACT', 0.98, 'deterministic', 'EMAIL_ADDRESS'));
  }
  if (/\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co\.uk|me|app|link)\b/i.test(text.normalizedText)) {
    signals.push(signal('URL_REDIRECTION', 0.96, 'deterministic', 'EXTERNAL_URL'));
  }
  const contactCta = /\b(?:message|text|contact|reach|find|follow|dm|signal|whats\s*app|telegram|snap(?:chat)?|insta(?:gram)?)\s+me\b|\bi\s*(?:do not|don't)\s+reply\s+here\b|\bsame username everywhere\b/.test(text.normalizedText)
    || /(?:whatsapp|telegram|snapchat|signal|instagram|insta)me/.test(text.compactText);
  const messaging = /(?:whatsapp|telegram|snapchat|signal|instagram|insta)/.test(text.compactText) || /\b(?:green app|paper plane app|elsewhere)\b/.test(text.normalizedText);
  const messagingPresence = /\b(?:i(?:'m| am)|im)\s+(?:online|available)?\s*(?:on|via)\s+(?:whats\s*app|telegram|snap(?:chat)?|signal|insta(?:gram)?)\b|\b(?:find|reach|contact|message|text|dm)\s+me\s+(?:on|via)\s+(?:whats\s*app|telegram|snap(?:chat)?|signal|insta(?:gram)?)\b/i.test(text.normalizedText);
  if (messaging && (contactCta || messagingPresence)) signals.push(signal('EXTERNAL_MESSAGING', 0.9, 'deterministic', 'EXTERNAL_CONTACT_CTA'));
  if (/@[a-z0-9_.]{2,}/.test(text.normalizedText) && contactCta) signals.push(signal('SOCIAL_REDIRECTION', 0.82, 'deterministic', 'SOCIAL_HANDLE_CTA'));
  if (/\b(?:exclusive|premium|private|uncensored|spicy)\s+(?:content|page|access)\b|\b(?:subscribe|pay)\b.{0,35}\b(?:content|page|access)\b/i.test(text.normalizedText)) {
    signals.push(signal('PAID_CONTENT_PROMOTION', 0.84, 'deterministic', 'PAID_PRIVATE_CONTENT_CTA'));
  }
  const commerceCta = /\b(?:sell(?:ing)?|buy|purchase|unlock|join|subscribe|support|book(?:ing)?|ask)\b.{0,55}\b(?:private\s+)?(?:memberships?|subscriptions?|photos?|pics?|content|gallery|access|page)\b/i.test(text.normalizedText)
    || /\b(?:private\s+)?(?:memberships?|subscriptions?|photos?|pics?|content|gallery|access|page)\b.{0,55}\b(?:sell(?:ing)?|buy|purchase|unlock|join|subscribe|support|book(?:ing)?|ask)\b/i.test(text.normalizedText);
  if (commerceCta) {
    signals.push(signal('PAID_CONTENT_PROMOTION', 0.88, 'deterministic', 'CONTENT_COMMERCE_CTA'));
  }
  const paidPlatform = /(?:onlyfans|onlyfan\$|fansly|fanvue)/i.test(text.compactText);
  const paidPlatformCta = /\b(?:my|see|view|find|follow|visit|subscribe|exclusive|private|content|page|profile)\b/i.test(text.normalizedText);
  if (paidPlatform && paidPlatformCta) {
    signals.push(signal('PAID_CONTENT_PROMOTION', 0.96, 'deterministic', 'PAID_PLATFORM_CTA'));
  }
  if (/\b(?:come see what i can'?t show here|ask me where i post (?:my )?private|ask me where to find my uncensored|special private page for people who want more|subscribers get access to everything)\b/i.test(text.normalizedText)) {
    signals.push(signal('PAID_CONTENT_PROMOTION', 0.72, 'obfuscation', 'EUPHEMISTIC_PRIVATE_CONTENT_CTA'));
  }
  if (/\b(?:cash\s*app|venmo|paypal|send me money|send btc|crypto investment)\b|\bguaranteed\b.{0,25}\breturns\b/i.test(text.normalizedText)) {
    signals.push(signal('FINANCIAL_SOLICITATION', 0.9, 'deterministic', 'PAYMENT_OR_INVESTMENT_CTA'));
  }
  const categories = [...new Set(signals.map((item) => item.category))];
  const riskScore = Math.min(1, signals.reduce((score, item) => score + item.confidence * 0.55, 0));
  const severe = categories.includes('PHONE_CONTACT') && (categories.includes('EXTERNAL_MESSAGING') || categories.includes('PAID_CONTENT_PROMOTION'));
  return { allowed: signals.length === 0, decision: severe ? 'RESTRICT_PROFILE' : signals.length ? 'REQUIRE_REWRITE' : 'ALLOW', riskScore, categories, signals, userMessageCode: signals.length ? 'PROFILE_CONTENT_NOT_ALLOWED' : undefined };
};
