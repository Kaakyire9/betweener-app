// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { corsHeaders } from '../_shared/cors.ts';
import {
  assessPrivateMessageRules,
  classifyTextSolicitation,
  mergeContentSafetyAssessments,
  moderateWithOpenAI,
} from '../_shared/content-safety.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STICKER_NAMES = new Set([
  'Happy', 'Loved', 'Excited', 'Cool', 'Adorable', 'Motivated', 'Fire', 'Electric',
  'Sparkle', 'Star', 'Love', 'Hearts', 'Sparkling Heart', 'Rose', 'Party',
  'Confetti', 'Celebrate', 'Balloon',
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
  const replyToMessageId = input.replyToMessageId == null ? null : String(input.replyToMessageId);
  const storagePath = input.storagePath == null ? null : String(input.storagePath);
  if (
    !['send', 'edit'].includes(action)
    || (action === 'send' && (!UUID.test(receiverId) || receiverId === authData.user.id))
    || (action === 'edit' && !UUID.test(messageId))
    || (action === 'send' && (!clientMessageId || clientMessageId.length > 200))
    || !text || text.length > 5000
    || !['text', 'mood_sticker'].includes(messageType)
    || (messageType === 'mood_sticker' && !validStickerPayload(text))
    || (replyToMessageId !== null && !UUID.test(replyToMessageId))
    || (storagePath !== null && storagePath.length > 1000)
  ) {
    return json(400, { code: 'INVALID_MESSAGE' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Content-Safety-Version': 'content-safety-v1' } },
  });
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

  let assessment = assessPrivateMessageRules(text);
  if (messageType === 'text' && assessment.decision !== 'BLOCK') {
    const [harm, solicitation] = await Promise.all([
      moderateWithOpenAI(text),
      classifyTextSolicitation(text),
    ]);
    assessment = mergeContentSafetyAssessments(assessment, harm, solicitation);
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
    const code = ['MESSAGING_BLOCKED', 'MESSAGE_EDIT_FORBIDDEN', 'INVALID_MODERATED_MESSAGE']
      .find((candidate) => diagnostic.includes(candidate)) ?? 'MESSAGE_SEND_FAILED';
    return json(
      ['MESSAGING_BLOCKED', 'MESSAGE_EDIT_FORBIDDEN'].includes(code)
        ? 403
        : code === 'INVALID_MODERATED_MESSAGE' ? 400 : 503,
      { code },
    );
  }
  const result = (data ?? {}) as Record<string, unknown>;
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
