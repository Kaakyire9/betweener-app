// @ts-nocheck -- Supabase Edge runtime provides Deno and URL imports.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { corsHeaders } from '../_shared/cors.ts';
import { moderateWithOpenAI } from '../_shared/content-safety.ts';
import { getSupabaseAdminKey } from '../_shared/supabase-admin-key.ts';
import { getSupabasePublicApiKey } from '../_shared/supabase-public-key.ts';
import {
  RELATIONSHIP_GIST_AI_PERSPECTIVES,
  type RelationshipGistAIPerspective,
} from '../_shared/relationship-gist-ai/contracts.ts';
import {
  estimateRelationshipGistAICostMicrousd,
  OpenAIRelationshipGistDraftProvider,
  RelationshipGistAIProviderError,
} from '../_shared/relationship-gist-ai/provider.ts';
import { buildRelationshipGistAITelemetry } from '../_shared/relationship-gist-ai/telemetry.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedEnvironments = new Set(['local', 'staging', 'production']);

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  if (Deno.env.get('RELATIONSHIP_GIST_AI_STUDIO_ENABLED') !== 'true') {
    return json(503, { code: 'GIST_AI_DISABLED' });
  }

  const environment = String(Deno.env.get('APP_ENVIRONMENT') ?? '').trim().toLowerCase();
  if (!allowedEnvironments.has(environment)) return json(503, { code: 'GIST_AI_ENVIRONMENT_INVALID' });
  const authorization = request.headers.get('Authorization') ?? '';
  const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) return json(401, { code: 'AUTH_REQUIRED' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublicApiKey();
  const serviceKey = getSupabaseAdminKey();
  const openAIKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!url || !anonKey || !serviceKey || !openAIKey) {
    return json(503, { code: 'GIST_AI_UNAVAILABLE' });
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !authData.user) return json(401, { code: 'AUTH_REQUIRED' });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json(400, { code: 'INVALID_REQUEST' });
  }
  const topicId = String(input.topicId ?? '');
  const idempotencyKey = String(input.idempotencyKey ?? '');
  if (!UUID.test(topicId) || !UUID.test(idempotencyKey)) return json(400, { code: 'INVALID_REQUEST' });

  const { data: requested, error: requestError } = await authClient.rpc(
    'rpc_request_relationship_gist_ai_generation',
    { p_topic_id: topicId, p_idempotency_key: idempotencyKey },
  );
  if (requestError) {
    const budget = requestError.message?.includes('gist_ai_budget_exceeded');
    return json(budget ? 429 : 403, { code: budget ? 'GIST_AI_BUDGET_EXCEEDED' : 'GIST_AI_REQUEST_DENIED' });
  }
  const jobId = String(requested?.id ?? '');
  if (!UUID.test(jobId)) return json(503, { code: 'GIST_AI_JOB_INVALID' });
  if (requested?.status === 'completed') {
    return json(200, { ok: true, jobId, status: 'completed', revisionId: requested.generated_revision_id ?? null });
  }
  if (requested?.status === 'budget_exceeded') {
    return json(429, { code: 'GIST_AI_BUDGET_EXCEEDED', jobId, status: 'budget_exceeded' });
  }
  if (!['queued', 'processing'].includes(String(requested?.status))) {
    return json(409, { code: 'GIST_AI_JOB_NOT_RETRYABLE', jobId, status: requested?.status ?? 'unknown' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: claim, error: claimError } = await admin.rpc(
    'rpc_service_claim_relationship_gist_ai_job',
    { p_job_id: jobId, p_environment: environment },
  );
  if (claimError || !claim) return json(409, { code: 'GIST_AI_JOB_NOT_CLAIMABLE', jobId });

  const fail = async (
    status: 'failed' | 'rejected_unsafe' | 'rejected_duplicate' | 'budget_exceeded',
    failureCode: string,
    retryable: boolean,
    providerRequestId: string | null = null,
    usage?: { input: number; cachedInput: number; output: number; estimatedCostMicrousd: number | null },
  ) => admin.rpc('rpc_service_fail_relationship_gist_ai_job', {
    p_job_id: jobId,
    p_environment: environment,
    p_status: status,
    p_failure_code: failureCode,
    p_retryable: retryable,
    p_provider_request_id: providerRequestId,
    p_input_tokens: usage?.input ?? null,
    p_cached_input_tokens: usage?.cachedInput ?? null,
    p_output_tokens: usage?.output ?? null,
    p_estimated_cost_microusd: usage?.estimatedCostMicrousd ?? null,
  });

  try {
    const perspective = String(claim.perspective) as RelationshipGistAIPerspective;
    if (!RELATIONSHIP_GIST_AI_PERSPECTIVES.includes(perspective)) {
      await fail('failed', 'perspective_unsupported', false);
      return json(422, { code: 'GIST_AI_OUTPUT_INVALID', jobId });
    }
    const provider = new OpenAIRelationshipGistDraftProvider({
      apiKey: openAIKey,
      model: String(claim.model),
      timeoutMs: 60_000,
      // The database claim count is the job-wide retry budget. One provider call
      // per claim prevents nested retries from exceeding that configured limit.
      maxAttempts: 1,
      maxOutputTokens: Number(claim.max_output_tokens ?? 3000),
    });
    const generated = await provider.generate({
      topicTitle: String(claim.topic_title),
      topicBrief: String(claim.topic_brief),
      perspective,
      sourceRevision: claim.source_revision_id ? {
        title: String(claim.source_title ?? ''),
        summary: String(claim.source_summary ?? ''),
        body: String(claim.source_body ?? ''),
        instruction: String(claim.revision_instruction ?? ''),
      } : null,
    });
    const estimatedCostMicrousd = estimateRelationshipGistAICostMicrousd({
      inputTokens: generated.metadata.inputTokens,
      cachedInputTokens: generated.metadata.cachedInputTokens,
      outputTokens: generated.metadata.outputTokens,
      inputMicrousdPerMillion: claim.input_microusd_per_million == null ? null : Number(claim.input_microusd_per_million),
      cachedInputMicrousdPerMillion: claim.cached_input_microusd_per_million == null ? null : Number(claim.cached_input_microusd_per_million),
      outputMicrousdPerMillion: claim.output_microusd_per_million == null ? null : Number(claim.output_microusd_per_million),
    });
    const usage = {
      input: generated.metadata.inputTokens,
      cachedInput: generated.metadata.cachedInputTokens,
      output: generated.metadata.outputTokens,
      estimatedCostMicrousd,
    };
    if (generated.value.perspective !== perspective) {
      await fail('failed', 'perspective_mismatch', false, generated.metadata.providerRequestId, usage);
      return json(422, { code: 'GIST_AI_OUTPUT_INVALID', jobId });
    }
    const moderationText = [
      generated.value.title,
      generated.value.summary,
      generated.value.body,
      generated.value.takeaway,
      generated.value.discussion_prompt,
    ].join('\n\n');
    const moderation = await moderateWithOpenAI(moderationText);
    if (moderation.failureReason || moderation.decision !== 'ALLOW') {
      const failureCode = moderation.failureReason ? 'moderation_unavailable' : 'unsafe_content';
      await fail(
        moderation.failureReason ? 'failed' : 'rejected_unsafe',
        failureCode,
        Boolean(moderation.failureReason),
        moderation.providerRequestId,
        usage,
      );
      console.warn(JSON.stringify(buildRelationshipGistAITelemetry({
        event: 'relationship_gist_ai.moderation_rejected',
        jobId,
        environment,
        status: moderation.failureReason ? 'failed' : 'rejected_unsafe',
        failureCode,
        providerRequestId: moderation.providerRequestId,
        model: generated.metadata.model,
        inputTokens: generated.metadata.inputTokens,
        outputTokens: generated.metadata.outputTokens,
        estimatedCostMicrousd,
        attempts: generated.metadata.attempts,
      })));
      return json(moderation.failureReason ? 503 : 422, {
        code: moderation.failureReason ? 'GIST_AI_MODERATION_UNAVAILABLE' : 'GIST_AI_UNSAFE',
        jobId,
      });
    }
    const { data: completed, error: completionError } = await admin.rpc(
      'rpc_service_complete_relationship_gist_ai_job',
      {
        p_job_id: jobId,
        p_environment: environment,
        p_output: generated.value,
        p_provider_request_id: generated.metadata.providerRequestId,
        p_input_tokens: generated.metadata.inputTokens,
        p_cached_input_tokens: generated.metadata.cachedInputTokens,
        p_output_tokens: generated.metadata.outputTokens,
        p_estimated_cost_microusd: estimatedCostMicrousd,
      },
    );
    if (completionError) {
      await fail('failed', 'draft_persistence_failed', false, generated.metadata.providerRequestId, usage);
      return json(503, { code: 'GIST_AI_PERSISTENCE_FAILED', jobId });
    }
    console.log(JSON.stringify(buildRelationshipGistAITelemetry({
      event: 'relationship_gist_ai.completed',
      jobId,
      environment,
      status: String(completed?.status ?? 'completed'),
      providerRequestId: generated.metadata.providerRequestId,
      model: generated.metadata.model,
      inputTokens: generated.metadata.inputTokens,
      outputTokens: generated.metadata.outputTokens,
      estimatedCostMicrousd,
      attempts: generated.metadata.attempts,
    })));
    return json(200, {
      ok: true,
      jobId,
      status: completed?.status ?? 'completed',
      revisionId: completed?.revision_id ?? null,
    });
  } catch (error) {
    const providerError = error instanceof RelationshipGistAIProviderError ? error : null;
    const failureCode = providerError?.reasonCode ?? 'generation_failed';
    const { data: failure } = await fail(
      'failed',
      failureCode,
      providerError?.retryable === true,
      providerError?.providerRequestId ?? null,
    );
    console.error(JSON.stringify(buildRelationshipGistAITelemetry({
      event: 'relationship_gist_ai.failed',
      jobId,
      environment,
      status: String(failure?.status ?? 'failed'),
      failureCode,
      providerRequestId: providerError?.providerRequestId ?? null,
    })));
    return json(providerError?.code === 'provider_rate_limited' ? 429 : 503, {
      code: 'GIST_AI_GENERATION_FAILED',
      jobId,
      retryable: failure?.retryable === true,
    });
  }
});
