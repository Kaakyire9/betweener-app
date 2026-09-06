export const PROFILE_GUARD_DETECTOR_VERSION = '2.0.0';

export const PROFILE_GUARD_WRITABLE_FIELDS = [
  'full_name', 'bio', 'avatar_url', 'hero_image_url', 'photos', 'profile_video',
  'gender', 'age', 'region', 'tribe', 'roots', 'roots_note', 'roots_visibility',
  'religion', 'min_age_interest', 'max_age_interest', 'age_preference_confirmed_at',
  'current_country', 'current_country_code', 'city', 'location', 'latitude', 'longitude',
  'location_precision', 'locality_geoname_id', 'locality_district',
  'locality_admin1_code', 'locality_provider', 'location_updated_at', 'origin_country',
  'origin_country_code', 'origin_country_source', 'occupation', 'education', 'height',
  'looking_for', 'exercise_frequency', 'smoking', 'drinking', 'has_children',
  'wants_children', 'personality_type', 'love_language', 'living_situation', 'pets',
  'languages_spoken', 'years_in_diaspora', 'last_ghana_visit', 'future_ghana_plans',
  'relationship_compass', 'onboarding_variant', 'username',
] as const;

export const PROFILE_GUARD_PUBLIC_TEXT_FIELDS = [
  'full_name', 'username', 'bio', 'occupation', 'education', 'looking_for',
  'tribe', 'roots', 'roots_note', 'height', 'exercise_frequency', 'smoking',
  'drinking', 'has_children', 'wants_children', 'personality_type',
  'love_language', 'living_situation', 'pets', 'languages_spoken',
  'future_ghana_plans', 'relationship_compass',
] as const;

export const PROFILE_GUARD_STRUCTURED_TEXT_FIELDS = [
  'city', 'region', 'location', 'last_ghana_visit',
] as const;

export const PROFILE_GUARD_FORBIDDEN_IDENTITY_FIELDS = [
  'user_id', 'userId', 'profile_id', 'profileId', 'owner_id', 'ownerId',
] as const;

export const PROFILE_GUARD_SERVER_MANAGED_FIELDS = [
  'profile_completed', 'identity_status', 'onboarding_completed_at',
  'identity_finalized_at', 'phone_number', 'phone_verified',
] as const;

export type EnforcementMode = 'OFF' | 'REPORT_ONLY' | 'ENFORCE';
export type DeterministicDecision = 'ALLOW' | 'REQUIRE_REWRITE' | 'RESTRICT_PROFILE';
export type SemanticFallback = 'ALLOW' | 'ALLOW_AND_LOG' | 'REQUIRE_REWRITE';

export type GuardConfiguration = {
  enabled: boolean;
  semanticEnabled: boolean;
  enforcementMode: EnforcementMode;
  backfillEnabled: boolean;
};

const semanticPattern = /\S/;

export const resolveGuardConfiguration = (row: Record<string, unknown> | null | undefined): GuardConfiguration => ({
  // Missing/corrupt configuration fails closed for writes, while expensive and
  // privacy-sensitive semantic processing remains explicitly opt-in.
  enabled: typeof row?.enabled === 'boolean' ? row.enabled : true,
  semanticEnabled: typeof row?.semantic_enabled === 'boolean' ? row.semantic_enabled : false,
  enforcementMode: row?.enforcement_mode === 'OFF' || row?.enforcement_mode === 'REPORT_ONLY'
    ? row.enforcement_mode
    : 'ENFORCE',
  backfillEnabled: typeof row?.backfill_enabled === 'boolean' ? row.backfill_enabled : false,
});

export const hasForbiddenTargetIdentifier = (body: Record<string, unknown>, updates: Record<string, unknown>) =>
  PROFILE_GUARD_FORBIDDEN_IDENTITY_FIELDS.some((field) => field in body || field in updates);

export const hasOnlyWritableProfileFields = (updates: Record<string, unknown>) => {
  const allowed = new Set<string>(PROFILE_GUARD_WRITABLE_FIELDS);
  const keys = Object.keys(updates);
  return keys.length > 0 && keys.every((key) => allowed.has(key));
};

export const removeServerManagedProfileFields = (updates: Record<string, unknown>) => {
  const managed = new Set<string>(PROFILE_GUARD_SERVER_MANAGED_FIELDS);
  return Object.fromEntries(Object.entries(updates).filter(([key]) => !managed.has(key)));
};

const profileValuesEqual = (current: unknown, proposed: unknown) => {
  if (Object.is(current, proposed)) return true;
  if (current == null || proposed == null) return current == null && proposed == null;
  if (typeof current === 'object' && typeof proposed === 'object') {
    return JSON.stringify(current) === JSON.stringify(proposed);
  }
  return false;
};

export const removeUnchangedProfileFields = (
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
) => Object.fromEntries(
  Object.entries(updates).filter(([field, value]) => !profileValuesEqual(current[field], value)),
);

export const needsSemanticReview = (text: string) => semanticPattern.test(text);

export const hasPublicTextUpdate = (updates: Record<string, unknown>) => {
  const guarded = new Set<string>(PROFILE_GUARD_PUBLIC_TEXT_FIELDS);
  return Object.keys(updates).some((field) => guarded.has(field));
};

const publicTextLimits: Partial<Record<(typeof PROFILE_GUARD_PUBLIC_TEXT_FIELDS)[number], number>> = {
  full_name: 120,
  username: 80,
  bio: 500,
  occupation: 160,
  education: 160,
  looking_for: 300,
  tribe: 120,
  roots_note: 300,
  height: 80,
  exercise_frequency: 120,
  smoking: 120,
  drinking: 120,
  has_children: 120,
  wants_children: 120,
  personality_type: 160,
  love_language: 160,
  living_situation: 160,
  pets: 160,
  future_ghana_plans: 500,
};

export const hasValidPublicTextFieldValues = (updates: Record<string, unknown>) =>
  PROFILE_GUARD_PUBLIC_TEXT_FIELDS.every((field) => {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) return true;
    const value = updates[field];
    if (value === null) return true;
    if (field === 'roots' || field === 'languages_spoken') {
      const maxBytes = field === 'roots' ? 1_000 : 2_000;
      return Array.isArray(value)
        && value.every((item) => typeof item === 'string' && item.length <= 160)
        && JSON.stringify(value).length <= maxBytes;
    }
    if (field === 'relationship_compass') {
      return typeof value === 'object' && !Array.isArray(value)
        && JSON.stringify(value).length <= 4_000;
    }
    return typeof value === 'string' && value.length <= (publicTextLimits[field] ?? 500);
  });

export const hasValidPromptPayload = (prompt: Record<string, unknown>) => {
  const nullableString = (value: unknown, max: number) =>
    value == null || (typeof value === 'string' && value.length <= max);
  return typeof prompt.prompt_key === 'string' && prompt.prompt_key.length > 0
    && prompt.prompt_key.length <= 120
    && typeof prompt.prompt_title === 'string' && prompt.prompt_title.length <= 300
    && typeof prompt.answer === 'string' && prompt.answer.length <= 1_000
    && nullableString(prompt.prompt_type, 80)
    && nullableString(prompt.guess_mode, 80)
    && nullableString(prompt.hint_text, 500)
    && nullableString(prompt.reveal_policy, 80)
    && (prompt.guess_options == null || (
      Array.isArray(prompt.guess_options)
      && prompt.guess_options.length <= 20
      && prompt.guess_options.every((item) => typeof item === 'string' && item.length <= 300)
      && JSON.stringify(prompt.guess_options).length <= 2_000
    ));
};

const profileValueToText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
};

export const buildPublicProfileText = (
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
) => PROFILE_GUARD_PUBLIC_TEXT_FIELDS.map((field) => {
  const value = Object.prototype.hasOwnProperty.call(updates, field)
    ? updates[field]
    : current[field];
  // relationship_compass is bounded structured state. Serializing its
  // machine-generated updatedAt value can resemble a phone number and adds no
  // useful natural-language signal to semantic moderation.
  return `${field}: ${field === 'relationship_compass' ? '[structured]' : profileValueToText(value)}`;
}).join('\n');

export const shouldInvokeSemantic = (
  deterministicDecision: DeterministicDecision,
  reviewRequired: boolean,
  config: GuardConfiguration,
  environmentEnabled: boolean,
) => config.enabled
  && config.enforcementMode !== 'OFF'
  && config.semanticEnabled
  && environmentEnabled
  && deterministicDecision === 'ALLOW'
  && reviewRequired;

export const semanticFailureFallback = (
  deterministicDecision: DeterministicDecision,
  ambiguous: boolean,
  config: GuardConfiguration,
): SemanticFallback => {
  if (!config.enabled || config.enforcementMode === 'OFF') return 'ALLOW';
  if (config.enforcementMode === 'REPORT_ONLY') return 'ALLOW_AND_LOG';
  if (deterministicDecision !== 'ALLOW' || ambiguous) return 'REQUIRE_REWRITE';
  return 'ALLOW';
};

export const extractResponseOutputText = (payload: Record<string, unknown>): string | null => {
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
        return (content as { text: string }).text;
      }
    }
  }
  return null;
};
