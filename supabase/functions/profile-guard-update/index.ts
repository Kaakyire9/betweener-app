// @ts-nocheck -- checked by the function-local Deno configuration.
// Authoritative public-profile write path. Secrets remain in Edge Function env.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  extractResponseOutputText,
  hasForbiddenTargetIdentifier,
  hasOnlyWritableProfileFields,
  needsSemanticReview,
  PROFILE_GUARD_PUBLIC_TEXT_FIELDS,
  removeServerManagedProfileFields,
  resolveGuardConfiguration,
  semanticFailureFallback,
  shouldInvokeSemantic,
  type DeterministicDecision,
} from '../_shared/profile-guard-policy.ts';

type Scores = Record<
  | 'normal_dating_profile'
  | 'external_contact'
  | 'external_redirection'
  | 'commercial_solicitation'
  | 'paid_content_promotion'
  | 'sexual_service_solicitation'
  | 'financial_solicitation'
  | 'spam',
  number
>;

const categories = [
  'external_contact',
  'external_redirection',
  'commercial_solicitation',
  'paid_content_promotion',
  'sexual_service_solicitation',
  'financial_solicitation',
  'spam',
] as const;
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const safeScores = (): Scores => ({
  normal_dating_profile: 1,
  external_contact: 0,
  external_redirection: 0,
  commercial_solicitation: 0,
  paid_content_promotion: 0,
  sexual_service_solicitation: 0,
  financial_solicitation: 0,
  spam: 0,
});

const validScores = (value: unknown): value is Scores => {
  if (typeof value !== 'object' || value === null) return false;
  const expected = Object.keys(safeScores());
  const actual = Object.keys(value as Record<string, unknown>);
  return actual.length === expected.length && expected.every((key) => {
    const score = (value as Record<string, unknown>)[key];
    return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1;
  });
};

async function classify(text: string): Promise<Scores | null> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('PROFILE_GUARD_SEMANTIC_MODEL') || 'gpt-5-mini',
        store: false,
        instructions:
          'Classify only public-profile intent. Do not infer identity or protected traits. Return JSON scores only.',
        input: text.slice(0, 2_000),
        text: {
          format: {
            type: 'json_schema',
            name: 'profile_guard_scores',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['normal_dating_profile', ...categories],
              properties: Object.fromEntries(
                ['normal_dating_profile', ...categories].map((key) => [
                  key,
                  { type: 'number', minimum: 0, maximum: 1 },
                ]),
              ),
            },
          },
        },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    const outputText = extractResponseOutputText(payload);
    if (!outputText) return null;
    const parsed = JSON.parse(outputText);
    return validScores(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  const bearerMatch = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!bearerMatch) return json({ code: 'AUTH_REQUIRED' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ code: 'PROFILE_GUARD_UNAVAILABLE' }, 503);

  // getUser(accessToken) calls Supabase Auth's verified-user endpoint. The
  // profile owner is never derived from decoded, unverified JWT claims.
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearerMatch[1]);
  if (authError || !authData.user) return json({ code: 'AUTH_REQUIRED' }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const updates = body?.updates;
  const prompt = body?.prompt;
  const hasPrompt = typeof prompt === 'object' && prompt !== null && !Array.isArray(prompt);
  if (!body || typeof updates !== 'object' || updates === null || Array.isArray(updates)
      || (prompt != null && !hasPrompt)) {
    return json({ code: 'INVALID_PROFILE_UPDATE' }, 400);
  }
  const updateRecord = updates as Record<string, unknown>;
  const promptRecord = hasPrompt ? prompt as Record<string, unknown> : null;
  if (hasForbiddenTargetIdentifier(body, { ...updateRecord, ...(promptRecord ?? {}) })) {
    return json({ code: 'PROFILE_TARGET_NOT_ALLOWED' }, 403);
  }
  const completionRequested = body.complete_onboarding === true;
  const writableUpdates = removeServerManagedProfileFields(updateRecord);
  const promptAllowed = new Set([
    'prompt_key', 'prompt_title', 'answer', 'prompt_type', 'guess_mode',
    'guess_options', 'hint_text', 'reveal_policy',
  ]);
  const promptIsValid = !promptRecord || (
    Object.keys(promptRecord).length > 0
    && Object.keys(promptRecord).every((key) => promptAllowed.has(key))
    && typeof promptRecord.prompt_key === 'string'
    && typeof promptRecord.prompt_title === 'string'
    && typeof promptRecord.answer === 'string'
  );
  if (
    (!completionRequested && !promptRecord && Object.keys(writableUpdates).length === 0)
    || (promptRecord !== null && Object.keys(writableUpdates).length > 0)
    || (Object.keys(writableUpdates).length > 0 && !hasOnlyWritableProfileFields(writableUpdates))
    || !promptIsValid
    || JSON.stringify(updateRecord).length > 20_000
  ) {
    return json({ code: 'PROFILE_FIELD_NOT_ALLOWED' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: configRow, error: configError } = await admin
    .from('profile_guard_configuration')
    .select('enabled,semantic_enabled,enforcement_mode,backfill_enabled')
    .eq('id', true)
    .maybeSingle();
  const config = resolveGuardConfiguration(configError ? null : configRow);
  const configurationMissing = Boolean(configError || !configRow);

  const { data: currentProfile, error: profileError } = await admin
    .from('profiles')
    .select(PROFILE_GUARD_PUBLIC_TEXT_FIELDS.join(','))
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (profileError || !currentProfile) return json({ code: 'PROFILE_NOT_FOUND' }, 404);

  // Moderate the complete proposed public text, preventing split-field and
  // multi-request evasion through unchanged values.
  const proposedText = PROFILE_GUARD_PUBLIC_TEXT_FIELDS
    .map((field) => typeof writableUpdates[field] === 'string'
      ? writableUpdates[field]
      : typeof currentProfile[field] === 'string'
        ? currentProfile[field]
        : '')
    .join(' ')
    .concat(' ', promptRecord
      ? [promptRecord.prompt_title, promptRecord.answer, promptRecord.hint_text,
          JSON.stringify(promptRecord.guess_options ?? '')].join(' ')
      : '')
    .trim();
  const { data: assessment, error: assessmentError } = await admin.rpc('profile_guard_assess', {
    p_text: proposedText,
  });
  if (assessmentError || !assessment || typeof assessment !== 'object') {
    return json({ code: 'PROFILE_GUARD_UNAVAILABLE' }, 503);
  }
  const deterministicDecision = String(
    (assessment as Record<string, unknown>).decision ?? '',
  ) as DeterministicDecision;
  if (!['ALLOW', 'REQUIRE_REWRITE', 'RESTRICT_PROFILE'].includes(deterministicDecision)) {
    return json({ code: 'PROFILE_GUARD_UNAVAILABLE' }, 503);
  }

  const ambiguous = deterministicDecision === 'ALLOW' && needsSemanticReview(proposedText);
  const environmentSemanticEnabled = Deno.env.get('PROFILE_GUARD_SEMANTIC_ENABLED') === 'true';
  const semanticInvoked = shouldInvokeSemantic(
    deterministicDecision,
    proposedText,
    config,
    environmentSemanticEnabled,
  );
  const scores = semanticInvoked ? await classify(proposedText) : null;

  if (semanticInvoked && !scores) {
    const fallback = semanticFailureFallback(deterministicDecision, ambiguous, config);
    await admin.rpc('rpc_record_profile_guard_semantic_observation', {
      p_user_id: authData.user.id,
      p_decision: fallback,
      p_reason_code: 'SEMANTIC_PROVIDER_UNAVAILABLE',
    });
    if (fallback === 'REQUIRE_REWRITE') {
      return json({ ok: false, code: 'PROFILE_CONTENT_NOT_ALLOWED', semantic_used: true });
    }
  }

  const highCategory = scores && categories.find((key) => scores[key] >= 0.8);
  if (highCategory) {
    if (config.enabled && config.enforcementMode === 'ENFORCE') {
      const { error } = await admin.rpc('rpc_apply_profile_guard_semantic_decision', {
        p_user_id: authData.user.id,
        p_category: highCategory,
        p_semantic_scores: scores,
      });
      if (error) return json({ code: 'PROFILE_GUARD_UNAVAILABLE' }, 503);
      return json({ ok: false, code: 'PROFILE_CONTENT_NOT_ALLOWED', semantic_used: true });
    }
    await admin.rpc('rpc_record_profile_guard_semantic_observation', {
      p_user_id: authData.user.id,
      p_decision: 'ALLOW_AND_LOG',
      p_reason_code: highCategory,
    });
  }

  // The environment variable is an operator kill-switch, not a client flag.
  // If DB policy expects semantic review, disabling the provider still fails
  // closed for ambiguous ENFORCE writes.
  if (
    ambiguous
    && config.enabled
    && (configurationMissing || (config.semanticEnabled && !environmentSemanticEnabled))
  ) {
    const fallback = semanticFailureFallback(deterministicDecision, true, config);
    if (fallback === 'REQUIRE_REWRITE') {
      return json({ ok: false, code: 'PROFILE_CONTENT_NOT_ALLOWED', semantic_used: false });
    }
  }

  if (promptRecord) {
    const { data, error } = await admin.rpc('rpc_service_insert_profile_prompt_with_guard', {
      p_user_id: authData.user.id,
      p_prompt_key: promptRecord.prompt_key,
      p_prompt_title: promptRecord.prompt_title,
      p_answer: promptRecord.answer,
      p_prompt_type: promptRecord.prompt_type ?? 'standard',
      p_guess_mode: promptRecord.guess_mode ?? null,
      p_guess_options: promptRecord.guess_options ?? null,
      p_hint_text: promptRecord.hint_text ?? null,
      p_reveal_policy: promptRecord.reveal_policy ?? 'never',
    });
    if (error) return json({ code: 'PROFILE_UPDATE_FAILED' }, 500);
    return json({ ...(data as Record<string, unknown>), semantic_used: semanticInvoked });
  }

  let data: Record<string, unknown> = { ok: true };
  let error: { message?: string } | null = null;
  if (Object.keys(writableUpdates).length > 0) {
    const updateResult = await admin.rpc('rpc_service_update_profile_with_guard', {
      p_user_id: authData.user.id,
      p_updates: writableUpdates,
    });
    data = (updateResult.data as Record<string, unknown>) ?? { ok: false };
    error = updateResult.error;
  }
  if (error) {
    const knownCodes = [
      'PROFILE_FIELD_NOT_ALLOWED',
      'INVALID_PROFILE_UPDATE',
      'INVALID_STRUCTURED_PROFILE_FIELD',
    ];
    const safeCode = knownCodes.includes(String(error.message))
      ? String(error.message)
      : 'PROFILE_UPDATE_FAILED';
    return json({ code: safeCode }, safeCode === 'PROFILE_UPDATE_FAILED' ? 500 : 400);
  }
  if (data.ok === false) return json({ ...data, semantic_used: semanticInvoked });
  if (completionRequested) {
    const { error: completionError } = await admin.rpc('rpc_service_finalize_profile_onboarding', {
      p_user_id: authData.user.id,
    });
    if (completionError) return json({ code: 'ONBOARDING_COMPLETION_FAILED' }, 400);
  }
  return json({ ...data, semantic_used: semanticInvoked });
});
