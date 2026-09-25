// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { corsHeaders } from '../_shared/cors.ts';
import {
  assessPrivateMessageRules,
  classifyTextSolicitation,
  mergePrivateMessageSafetyAssessments,
  moderateWithOpenAI,
  shouldClassifyPrivateMessageSolicitation,
} from '../_shared/content-safety.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STICKER_NAMES = new Set([
  'Happy', 'Loved', 'Excited', 'Cool', 'Adorable', 'Motivated', 'Fire', 'Electric',
  'Sparkle', 'Star', 'Love', 'Hearts', 'Sparkling Heart', 'Rose', 'Party',
  'Confetti', 'Celebrate', 'Balloon', 'Great Flow', 'Warm Spark', 'Perfect Match',
  'Date Energy', 'Thinking of You', 'Chemistry', 'Good Morning', 'Sweet Dreams',
  'You Got This', 'Let\'s Go', 'Applause',
]);

const validStickerPayload = (text: string) => {
  if (!text.startsWith('sticker::') || text.length > 500) return false;
  try {
    const parsed = JSON.parse(text.slice('sticker::'.length));
    return parsed && typeof parsed === 'object'
      && typeof parsed.emoji === 'string' && parsed.emoji.length <= 24
      && STICKER_NAMES.has(String(parsed.name ?? ''));
  } catch {
    return false;
  }
};

const PROVIDER_MEDIA_ID = /^[a-z0-9_-]{1,100}$/i;
const PROVIDER_MEDIA_KINDS = new Set([
  'giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text',
]);
const PROVIDER_MEDIA_KEYS = new Set([
  'schemaVersion', 'provider', 'providerMediaId', 'title', 'width', 'height', 'kind',
]);

const parseProviderMedia = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !PROVIDER_MEDIA_KEYS.has(key))) return null;
  const providerMediaId = typeof record.providerMediaId === 'string'
    ? record.providerMediaId.trim()
    : '';
  const title = typeof record.title === 'string' ? record.title.trim().slice(0, 160) : '';
  const kind = typeof record.kind === 'string' ? record.kind : '';
  const dimension = (entry: unknown) => entry == null
    ? null
    : Number.isInteger(entry) && Number(entry) >= 1 && Number(entry) <= 8192
      ? Number(entry)
      : undefined;
  const width = dimension(record.width);
  const height = dimension(record.height);
  if (
    record.schemaVersion !== 1
    || record.provider !== 'giphy'
    || !PROVIDER_MEDIA_ID.test(providerMediaId)
    || !PROVIDER_MEDIA_KINDS.has(kind)
    || width === undefined
    || height === undefined
  ) return null;
  return {
    schemaVersion: 1,
    provider: 'giphy',
    providerMediaId,
    title: title || 'GIPHY expression',
    width,
    height,
    kind,
  };
};

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });

  const authorization = request.headers.get('Authorization') ?? '';
  const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) return json(401, { code: 'AUTH_REQUIRED' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anonKey || !serviceKey) return json(503, { code: 'MESSAGE_GUARD_UNAVAILABLE' });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !authData.user) return json(401, { code: 'AUTH_REQUIRED' });

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > 20_000) {
    return json(413, { code: 'MESSAGE_TOO_LARGE' });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json(400, { code: 'INVALID_REQUEST' });
  }

  const action = String(input.action ?? 'send');
  const receiverId = String(input.receiverId ?? '');
  const messageId = String(input.messageId ?? '');
  const clientMessageId = String(input.clientMessageId ?? '').trim();
  const text = String(input.text ?? '').trim();
  const messageType = String(input.messageType ?? 'text');
  const providerExpression = action === 'send' && messageType === 'provider_expression';
  const providerMedia = providerExpression ? parseProviderMedia(input.providerMedia) : null;
  const replyToMessageId = input.replyToMessageId == null ? null : String(input.replyToMessageId);
  const storagePath = input.storagePath == null ? null : String(input.storagePath);
  if (
    !['send', 'edit'].includes(action)
    || (action === 'send' && (!UUID.test(receiverId) || receiverId === authData.user.id))
    || (action === 'edit' && !UUID.test(messageId))
    || (action === 'send' && (!clientMessageId || clientMessageId.length > 200))
    || (providerExpression
      ? !providerMedia || text.length > 0 || storagePath !== null
      : !text || text.length > 5000 || !['text', 'mood_sticker'].includes(messageType))
    || (!providerExpression && messageType === 'mood_sticker' && !validStickerPayload(text))
    || (replyToMessageId !== null && !UUID.test(replyToMessageId))
    || (storagePath !== null && storagePath.length > 1000)
  ) {
    return json(400, { code: 'INVALID_MESSAGE' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Content-Safety-Version': 'content-safety-v1' } },
  });
  if (!providerExpression) {
    const { data: rateLimit, error: rateLimitError } = await admin.rpc(
      'rpc_service_consume_content_guard_rate_limit',
      { p_user_id: authData.user.id, p_scope: 'private_message' },
    );
    if (rateLimitError || !rateLimit) return json(503, { code: 'MESSAGE_GUARD_UNAVAILABLE' });
    if ((rateLimit as Record<string, unknown>).allowed !== true) {
      return json(429, {
        code: 'MESSAGE_GUARD_RATE_LIMITED',
        retry_after_seconds: (rateLimit as Record<string, unknown>).retry_after_seconds,
      });
    }
  }

  let assessment = providerExpression
    ? {
        decision: 'ALLOW', categories: [], riskScore: 0,
        provider: 'giphy_sdk', model: 'provider-reference-v1',
        providerRequestId: null, failureReason: null,
      }
    : assessPrivateMessageRules(text);
  if (messageType === 'text' && assessment.decision !== 'BLOCK') {
    const harm = await moderateWithOpenAI(text);
    if (harm.failureReason) {
      console.error(JSON.stringify({
        event: 'private_message_harm_scan_unavailable',
        sender_user_id: authData.user.id,
        action,
        failure_reason: harm.failureReason,
        provider_request_id: harm.providerRequestId,
      }));
      return json(503, { code: 'MESSAGE_GUARD_UNAVAILABLE', retryable: true });
    }

    const solicitation = shouldClassifyPrivateMessageSolicitation(text)
      ? await classifyTextSolicitation(text)
      : undefined;
    assessment = mergePrivateMessageSafetyAssessments(assessment, harm, solicitation);

    if (solicitation?.failureReason) {
      console.warn(JSON.stringify({
        event: 'private_message_solicitation_scan_degraded',
        sender_user_id: authData.user.id,
        action,
        failure_reason: solicitation.failureReason,
        provider_request_id: solicitation.providerRequestId,
      }));
    }
  }

  if (assessment.decision === 'REVIEW') {
    return json(200, {
      ok: false,
      code: 'MESSAGE_REPHRASE_REQUIRED',
      categories: assessment.categories,
    });
  }

  const moderationArgs = {
    p_sender_user_id: authData.user.id,
    p_text: text,
    p_decision: assessment.decision,
    p_categories: assessment.categories,
    p_risk_score: assessment.riskScore,
    p_provider: assessment.provider,
    p_provider_model: assessment.model,
    p_provider_request_id: assessment.providerRequestId,
    p_failure_reason: assessment.failureReason,
  };
  const { data, error } = action === 'edit'
    ? await admin.rpc('rpc_service_edit_moderated_private_message', {
        ...moderationArgs,
        p_message_id: messageId,
      })
    : providerExpression
      ? await admin.rpc('rpc_service_send_provider_expression', {
          p_sender_user_id: authData.user.id,
          p_receiver_user_id: receiverId,
          p_client_message_id: clientMessageId,
          p_provider_media: providerMedia,
          p_media_kind: providerMedia.kind,
          p_reply_to_message_id: replyToMessageId,
        })
      : await admin.rpc('rpc_service_send_moderated_private_message', {
        ...moderationArgs,
        p_receiver_user_id: receiverId,
        p_client_message_id: clientMessageId,
        p_message_type: messageType,
        p_reply_to_message_id: replyToMessageId,
        p_storage_path: storagePath,
      });
  if (error) {
    const diagnostic = String(error.message ?? '');
    const code = [
      'MESSAGING_BLOCKED', 'MESSAGE_EDIT_FORBIDDEN', 'INVALID_MODERATED_MESSAGE',
      'INVALID_PROVIDER_EXPRESSION', 'MESSAGE_IDEMPOTENCY_CONFLICT',
    ]
      .find((candidate) => diagnostic.includes(candidate)) ?? 'MESSAGE_SEND_FAILED';
    return json(
      ['MESSAGING_BLOCKED', 'MESSAGE_EDIT_FORBIDDEN'].includes(code)
        ? 403
        : code === 'MESSAGE_IDEMPOTENCY_CONFLICT' ? 409
        : ['INVALID_MODERATED_MESSAGE', 'INVALID_PROVIDER_EXPRESSION'].includes(code) ? 400 : 503,
      { code },
    );
  }
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === false && result.code === 'MESSAGE_GUARD_RATE_LIMITED') {
    return json(429, {
      code: 'MESSAGE_GUARD_RATE_LIMITED',
      retry_after_seconds: result.retry_after_seconds,
    });
  }
  console.info(JSON.stringify({
    event: 'private_message_guard_decision',
    sender_user_id: authData.user.id,
    action,
    decision: assessment.decision,
    categories: assessment.categories,
    provider_request_id: assessment.providerRequestId,
  }));
  return json(200, result);
});
