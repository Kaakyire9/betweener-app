-- Editing an existing message must respect the same current delivery boundary as sending.

create or replace function public.rpc_service_edit_moderated_private_message(
  p_sender_user_id uuid,
  p_message_id uuid,
  p_text text,
  p_decision text,
  p_categories text[] default '{}',
  p_risk_score numeric default 0,
  p_provider text default 'unknown',
  p_provider_model text default 'unknown',
  p_provider_request_id text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_existing public.messages%rowtype;
  v_updated public.messages%rowtype;
  v_event_id uuid;
  v_restricted_until timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_existing from public.messages
  where id = p_message_id and sender_id = p_sender_user_id for update;
  if not found or v_existing.message_type <> 'text' or v_existing.deleted_for_all then
    raise exception using errcode = '42501', message = 'MESSAGE_EDIT_FORBIDDEN';
  end if;
  if exists (select 1 from public.blocks block_row
    where (block_row.blocker_id = p_sender_user_id and block_row.blocked_id = v_existing.receiver_id)
       or (block_row.blocker_id = v_existing.receiver_id and block_row.blocked_id = p_sender_user_id)) then
    raise exception using errcode = '42501', message = 'MESSAGING_BLOCKED';
  end if;
  if nullif(btrim(coalesce(p_text, '')), '') is null or char_length(p_text) > 5000
     or p_decision not in ('ALLOW', 'BLOCK', 'REVIEW') then
    raise exception using errcode = '22023', message = 'INVALID_MODERATED_MESSAGE';
  end if;
  if p_text = v_existing.text then
    return jsonb_build_object('ok', true, 'message', to_jsonb(v_existing), 'idempotent', true);
  end if;
  if p_decision <> 'ALLOW' then
    v_event_id := public.rpc_service_record_content_moderation_event(
      p_sender_user_id, v_existing.receiver_id, 'private_message_edit', p_message_id,
      p_message_id::text || ':' || md5(p_text), null, null, p_decision,
      p_categories, p_risk_score, null,
      jsonb_build_object('text', p_text, 'previous_text', v_existing.text),
      p_provider, p_provider_model, p_provider_request_id, p_failure_reason);
    return jsonb_build_object('ok', false,
      'code', case when p_decision = 'BLOCK' then 'MESSAGE_CONTENT_NOT_ALLOWED'
        else 'MESSAGE_REVIEW_REQUIRED' end, 'review_id', v_event_id);
  end if;
  select restricted_until into v_restricted_until
  from public.content_safety_actor_state where user_id = p_sender_user_id;
  if v_restricted_until > timezone('utc', now()) then
    return jsonb_build_object('ok', false, 'code', 'MESSAGING_TEMPORARILY_RESTRICTED',
      'restricted_until', v_restricted_until);
  end if;
  insert into public.message_edits(message_id, editor_user_id, previous_text)
  values (v_existing.id, p_sender_user_id, coalesce(v_existing.text, ''));
  update public.messages set text = p_text, edited_at = timezone('utc', now())
  where id = v_existing.id returning * into v_updated;
  return jsonb_build_object('ok', true, 'message', to_jsonb(v_updated));
end;
$$;

revoke all on function public.rpc_service_edit_moderated_private_message(
  uuid, uuid, text, text, text[], numeric, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_edit_moderated_private_message(
  uuid, uuid, text, text, text[], numeric, text, text, text, text
) to service_role;
