-- Raise the server-owned private-message moderation allowance for normal chat
-- volume. Remote provider limits remain an independent operational boundary.

create or replace function public.content_safety_assess_private_message(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := lower(regexp_replace(coalesce(p_text, ''), '[[:space:]_.-]+', ' ', 'g'));
  v_compact text := lower(regexp_replace(coalesce(p_text, ''), '[^a-zA-Z0-9+@]+', '', 'g'));
  v_phone boolean;
  v_platform boolean;
  v_redirect boolean;
  v_paid boolean;
  v_financial boolean;
  v_sexual_service boolean;
  v_threat boolean;
  v_categories text[] := '{}';
  v_decision text := 'ALLOW';
  v_risk numeric := 0;
begin
  v_phone := coalesce(p_text, '') ~* '(\+?[0-9][ ()\.-]*){7,15}';
  v_platform := v_text ~ '(signal|telegram|whatsapp|snapchat|instagram|insta |kik |wechat|onlyfans|fansly|cashapp|venmo|paypal)'
    or v_compact ~ '(onlyfans|telegram|whatsapp|snapchat|instagram|cashapp|venmo|paypal)';
  v_redirect := v_text ~ '(message|text|call|dm|reach|contact|find|add|follow|subscribe|join|ask) (me )?(on|at|via|how|for)'
    or v_text ~ '(off|away from|outside) (this|the) app';
  v_paid := v_text ~ '(paid|premium|exclusive|vip) (photo|photos|video|videos|content|subscription|access)'
    or v_text ~ '(subscribe|join) ((to|through) )?(my )?(onlyfans|fansly|premium|private|vip)'
    or v_text ~ 'subscribe.{0,80}private (photo|photos|video|videos|content)'
    or v_text ~ '(buy|access|unlock) (my )?private (photo|photos|video|videos|content)'
    or v_text ~ '(tip|pay) me( (for|to|and|in)|$)'
    or v_text ~ '(my )?rates? (are|start|for)'
    or v_text ~ 'book me (for|at) (a |an )?(session|service|appointment|massage|escort)';
  v_financial := v_text ~ '(send|wire|transfer|pay) (me )?(money|cash|crypto|bitcoin|btc|usdt)|gift card|investment opportunity|guaranteed return';
  v_sexual_service := v_text ~ '(escort|meet for cash|pay for sex|sexual service|full service|incall|outcall)';
  v_threat := v_text ~ '(i will|i''ll|gonna|going to) (kill|hurt|attack|rape) (you|them|him|her)';

  if v_phone then v_categories := array_append(v_categories, 'external_contact'); end if;
  if v_platform then v_categories := array_append(v_categories, 'external_redirection'); end if;
  if v_paid then v_categories := array_append(v_categories, 'paid_content_promotion'); end if;
  if v_financial then v_categories := array_append(v_categories, 'financial_solicitation'); end if;
  if v_sexual_service then v_categories := array_append(v_categories, 'sexual_service_solicitation'); end if;
  if v_threat then v_categories := array_append(v_categories, 'threatening_violence'); end if;

  if v_paid or v_financial or v_sexual_service or v_threat
     or (v_platform and v_redirect and (v_phone or v_paid or v_financial)) then
    v_decision := 'BLOCK';
    v_risk := case when v_threat or v_sexual_service then 1 else 0.92 end;
  elsif v_platform and v_redirect then
    v_decision := 'REVIEW';
    v_risk := 0.65;
  end if;

  return jsonb_build_object(
    'decision', v_decision,
    'categories', to_jsonb(v_categories),
    'risk_score', v_risk,
    'detector_version', 'content-safety-rules-v2'
  );
end;
$$;

revoke all on function public.content_safety_assess_private_message(text) from public, anon;
grant execute on function public.content_safety_assess_private_message(text)
  to authenticated, service_role;

create or replace function public.rpc_service_consume_content_guard_rate_limit(
  p_user_id uuid,
  p_scope text
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_window interval := interval '10 minutes';
  v_limit integer := case when p_scope = 'private_message' then 120 else 12 end;
  v_count integer;
  v_started timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_scope not in ('private_message', 'chat_image', 'profile_image') then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_SCOPE';
  end if;

  insert into public.content_guard_rate_limits(
    user_id, scope, window_started_at, request_count, updated_at
  ) values (p_user_id, p_scope, v_now, 1, v_now)
  on conflict (user_id, scope) do update
  set window_started_at = case
        when public.content_guard_rate_limits.window_started_at <= v_now - v_window
          then v_now else public.content_guard_rate_limits.window_started_at end,
      request_count = case
        when public.content_guard_rate_limits.window_started_at <= v_now - v_window
          then 1 else public.content_guard_rate_limits.request_count + 1 end,
      updated_at = v_now
  returning request_count, window_started_at into v_count, v_started;

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'request_count', v_count,
    'limit', v_limit,
    'retry_after_seconds', case when v_count <= v_limit then 0 else greatest(
      1, ceil(extract(epoch from (v_started + v_window - v_now)))::integer
    ) end
  );
end;
$$;

revoke all on function public.rpc_service_consume_content_guard_rate_limit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_consume_content_guard_rate_limit(uuid, text)
  to service_role;
