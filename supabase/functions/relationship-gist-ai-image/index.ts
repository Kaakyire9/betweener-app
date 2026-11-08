// @ts-nocheck -- Supabase Edge runtime provides Deno and URL imports.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseAdminKey } from '../_shared/supabase-admin-key.ts';
import { getSupabasePublicApiKey } from '../_shared/supabase-public-key.ts';
import {
  buildRelationshipGistCoverPrompt,
  estimateRelationshipGistImageCostMicrousd,
  OpenAIRelationshipGistImageProvider,
  RelationshipGistImageProviderError,
} from '../_shared/relationship-gist-ai/image-provider.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const sha256 = async (bytes: Uint8Array) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
).map((value) => value.toString(16).padStart(2, '0')).join('');

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  if (Deno.env.get('RELATIONSHIP_GIST_AI_STUDIO_ENABLED') !== 'true'
    || Deno.env.get('RELATIONSHIP_GIST_AI_IMAGE_ENABLED') !== 'true') {
    return json(503, { code: 'GIST_AI_IMAGE_DISABLED' });
  }
  const environment = String(Deno.env.get('APP_ENVIRONMENT') ?? '').trim().toLowerCase();
  if (!['local', 'staging', 'production'].includes(environment)) {
    return json(503, { code: 'GIST_AI_ENVIRONMENT_INVALID' });
  }
  const bearer = (request.headers.get('Authorization') ?? '').match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) return json(401, { code: 'AUTH_REQUIRED' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublicApiKey();
  const serviceKey = getSupabaseAdminKey();
  const openAIKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!url || !anonKey || !serviceKey || !openAIKey) return json(503, { code: 'GIST_AI_UNAVAILABLE' });
  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !authData.user) return json(401, { code: 'AUTH_REQUIRED' });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return json(400, { code: 'INVALID_REQUEST' }); }
  const revisionId = String(input.revisionId ?? '');
  const perspective = String(input.perspective ?? '').trim().toLowerCase();
  const idempotencyKey = String(input.idempotencyKey ?? '');
  if (!UUID.test(revisionId) || !UUID.test(idempotencyKey)) return json(400, { code: 'INVALID_REQUEST' });
  const { data: requested, error: requestError } = await authClient.rpc(
    'rpc_request_relationship_gist_ai_image_generation',
    { p_revision_id: revisionId, p_perspective: perspective, p_idempotency_key: idempotencyKey },
  );
  if (requestError) {
    const budget = requestError.message?.includes('budget');
    return json(budget ? 429 : 403, { code: budget ? 'GIST_AI_IMAGE_BUDGET_EXCEEDED' : 'GIST_AI_IMAGE_REQUEST_DENIED' });
  }
  const jobId = String(requested?.id ?? '');
  if (!UUID.test(jobId)) return json(503, { code: 'GIST_AI_IMAGE_JOB_INVALID' });
  if (requested?.status === 'completed') return json(200, { ok: true, jobId, status: 'completed' });
  if (requested?.status === 'budget_exceeded') return json(429, { code: 'GIST_AI_IMAGE_BUDGET_EXCEEDED', jobId });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: claim, error: claimError } = await admin.rpc(
    'rpc_service_claim_relationship_gist_ai_image_job',
    { p_job_id: jobId, p_environment: environment },
  );
  if (claimError || !claim) return json(409, { code: 'GIST_AI_IMAGE_JOB_NOT_CLAIMABLE', jobId });
  const fail = (status: string, code: string, retryable: boolean, providerRequestId: string | null = null) => admin.rpc(
    'rpc_service_fail_relationship_gist_ai_image_job',
    {
      p_job_id: jobId, p_environment: environment, p_status: status,
      p_failure_code: code, p_retryable: retryable, p_provider_request_id: providerRequestId,
    },
  );
  let storagePath: string | null = null;
  try {
    const prompt = buildRelationshipGistCoverPrompt({
      title: String(claim.title ?? ''), summary: String(claim.summary ?? ''),
      takeaway: String(claim.takeaway ?? ''), perspective: String(claim.perspective ?? 'general'),
      safetyLevel: String(claim.safety_level ?? 'low'),
    });
    const provider = new OpenAIRelationshipGistImageProvider({
      apiKey: openAIKey,
      model: String(claim.model),
      quality: String(claim.quality) as 'low' | 'medium' | 'high',
      size: String(claim.image_size) as '1024x1024' | '1536x1024' | '1024x1536',
    });
    const generated = await provider.generate(prompt);
    const bytes = decodeBase64(generated.base64);
    const digest = await sha256(bytes);
    storagePath = `${environment}/${claim.revision_id}/${claim.perspective}/${jobId}.webp`;
    const { error: uploadError } = await admin.storage.from('relationship-gist-covers').upload(storagePath, bytes, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    });
    if (uploadError) throw new RelationshipGistImageProviderError('image_storage_failed', false, generated.providerRequestId);
    const [width, height] = String(claim.image_size).split('x').map(Number);
    const estimatedCost = estimateRelationshipGistImageCostMicrousd({
      textInputTokens: generated.textInputTokens,
      imageOutputTokens: generated.imageOutputTokens,
      textInputRate: claim.text_input_rate == null ? null : Number(claim.text_input_rate),
      imageOutputRate: claim.image_output_rate == null ? null : Number(claim.image_output_rate),
    });
    const { data: completed, error: completionError } = await admin.rpc(
      'rpc_service_complete_relationship_gist_ai_image_job',
      {
        p_job_id: jobId, p_environment: environment, p_storage_path: storagePath,
        p_sha256: digest, p_width: width, p_height: height,
        p_alt_text: `Editorial illustration for “${String(claim.title).slice(0, 220)}”`,
        p_prompt: prompt, p_provider_request_id: generated.providerRequestId,
        p_text_input_tokens: generated.textInputTokens,
        p_image_output_tokens: generated.imageOutputTokens,
        p_estimated_cost_microusd: estimatedCost,
      },
    );
    if (completionError) throw new RelationshipGistImageProviderError('image_persistence_failed', false, generated.providerRequestId);
    console.log(JSON.stringify({
      event: 'relationship_gist_ai.image_completed', jobId, environment,
      model: claim.model, quality: claim.quality, estimatedCostMicrousd: estimatedCost,
      providerRequestId: generated.providerRequestId,
    }));
    return json(200, { ok: true, jobId, status: completed?.status ?? 'completed', imageId: completed?.image_id ?? null });
  } catch (error) {
    const providerError = error instanceof RelationshipGistImageProviderError ? error : null;
    if (storagePath) await admin.storage.from('relationship-gist-covers').remove([storagePath]);
    await fail('failed', providerError?.reasonCode ?? 'image_generation_failed', providerError?.retryable === true, providerError?.providerRequestId ?? null);
    console.error(JSON.stringify({
      event: 'relationship_gist_ai.image_failed', jobId, environment,
      failureCode: providerError?.reasonCode ?? 'image_generation_failed',
      providerRequestId: providerError?.providerRequestId ?? null,
    }));
    return json(503, { code: 'GIST_AI_IMAGE_GENERATION_FAILED', jobId, retryable: providerError?.retryable === true });
  }
});
