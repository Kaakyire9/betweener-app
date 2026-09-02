export const PROFILE_GUARD_DETECTOR_VERSION = '1.1.0';

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
  'relationship_compass', 'onboarding_variant',
] as const;

export const PROFILE_GUARD_PUBLIC_TEXT_FIELDS = [
  'full_name', 'bio', 'occupation', 'education', 'looking_for', 'roots_note',
  'future_ghana_plans',
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

const semanticPattern = /\b(?:private|exclusive|uncensored|subscribers?|elsewhere|outside (?:the )?app|special page|what i can(?:'|’)t show here|where i post)\b/i;
const semanticSafeContext = /\b(?:software|photography|marketing|banking|healthcare|education)\b/i;

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

export const needsSemanticReview = (text: string) =>
  semanticPattern.test(text) && !semanticSafeContext.test(text);

export const shouldInvokeSemantic = (
  deterministicDecision: DeterministicDecision,
  text: string,
  config: GuardConfiguration,
  environmentEnabled: boolean,
) => config.enabled
  && config.enforcementMode !== 'OFF'
  && config.semanticEnabled
  && environmentEnabled
  && deterministicDecision === 'ALLOW'
  && needsSemanticReview(text);

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
