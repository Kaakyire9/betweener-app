export const PROFILE_GUARD_VERSION = '1.0.0';

export type ProfileModerationCategory =
  | 'PHONE_CONTACT'
  | 'EMAIL_CONTACT'
  | 'URL_REDIRECTION'
  | 'SOCIAL_REDIRECTION'
  | 'EXTERNAL_MESSAGING'
  | 'COMMERCIAL_SOLICITATION'
  | 'PAID_CONTENT_PROMOTION'
  | 'PAYMENT_SOLICITATION'
  | 'FINANCIAL_SOLICITATION'
  | 'CIRCUMVENTION';

export type ModerationSignal = {
  category: ProfileModerationCategory;
  confidence: number;
  detector: 'deterministic' | 'obfuscation';
  evidenceCode: string;
};

export type ProfileModerationDecision = 'ALLOW' | 'ALLOW_AND_LOG' | 'REQUIRE_REWRITE' | 'RESTRICT_PROFILE' | 'HUMAN_REVIEW';

export type ProfileModerationResult = {
  allowed: boolean;
  decision: ProfileModerationDecision;
  riskScore: number;
  categories: ProfileModerationCategory[];
  signals: ModerationSignal[];
  userMessageCode?: 'PROFILE_CONTENT_NOT_ALLOWED';
};
