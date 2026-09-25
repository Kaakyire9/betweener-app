-- Preserve the validated expression subtype in the chat-list projection.
-- The summary row remains compact; its authoritative last message is joined by
-- primary key so edits, deletes and legacy rows retain truthful fallbacks.

drop function if exists public.rpc_get_chat_conversation_summaries(integer, integer);

create function public.rpc_get_chat_conversation_summaries(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  other_user_id uuid,
  last_message_id uuid,
  last_message_text text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  last_message_receiver_id uuid,
  last_message_is_read boolean,
  last_message_delivered_at timestamptz,
  last_message_type text,
  last_message_media_kind text,
  last_message_is_view_once boolean,
  last_message_deleted_for_all boolean,
  last_message_edited_at timestamptz,
  last_message_reaction_emoji text,
  last_message_reaction_user_id uuid,
  last_message_reaction_created_at timestamptz,
  last_message_reaction_target_type text,
  last_activity_kind text,
  last_activity_message_id uuid,
  last_activity_preview text,
  last_activity_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    summary.peer_user_id,
    summary.last_message_id,
    summary.last_message_text,
    summary.last_message_created_at,
    summary.last_message_sender_id,
    summary.last_message_receiver_id,
    summary.last_message_is_read,
    summary.last_message_delivered_at,
    summary.last_message_type,
    case
      when message_row.message_type = 'image' then message_row.media_kind
      else null
    end,
    summary.last_message_is_view_once,
    summary.last_message_deleted_for_all,
    summary.last_message_edited_at,
    summary.last_message_reaction_emoji,
    summary.last_message_reaction_user_id,
    summary.last_message_reaction_created_at,
    summary.last_message_reaction_target_type,
    summary.last_activity_kind,
    summary.last_activity_message_id,
    summary.last_activity_preview,
    summary.last_activity_at,
    summary.unread_count
  from public.chat_conversation_summaries summary
  left join public.messages message_row
    on message_row.id = summary.last_message_id
  where auth.uid() is not null
    and summary.owner_user_id = auth.uid()
  order by summary.last_message_created_at desc nulls last,
    summary.last_message_id desc nulls last
  limit greatest(1, least(coalesce(p_limit, 200), 500))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

alter function public.rpc_get_chat_conversation_summaries(integer, integer) owner to postgres;
revoke all on function public.rpc_get_chat_conversation_summaries(integer, integer)
  from public, anon;
grant execute on function public.rpc_get_chat_conversation_summaries(integer, integer)
  to authenticated, service_role;

comment on function public.rpc_get_chat_conversation_summaries(integer, integer)
  is 'Returns owner-scoped chat summaries with authoritative validated media presentation metadata.';

-- Set the expression kind before the message INSERT so summary and push
-- triggers never observe a transient generic photo. Only the service-role
-- finalizer can activate this transaction-local context.
create or replace function public.apply_chat_expression_insert_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_kind text := nullif(current_setting('request.chat_expression_media_kind', true), '');
begin
  if v_kind is null then
    return new;
  end if;
  if auth.role() <> 'service_role'
     or new.message_type <> 'image'
     or v_kind not in ('giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text') then
    raise exception using errcode = '22023', message = 'invalid_chat_expression_insert_context';
  end if;
  new.media_kind := v_kind;
  return new;
end;
$$;

revoke all on function public.apply_chat_expression_insert_context()
  from public, anon, authenticated;

drop trigger if exists apply_chat_expression_insert_context on public.messages;
create trigger apply_chat_expression_insert_context
before insert on public.messages
for each row execute function public.apply_chat_expression_insert_context();

create or replace function public.rpc_finalize_chat_attachment_batch_v4(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_type text,
  p_expected_count smallint,
  p_attachments jsonb,
  p_caption text,
  p_reply_to_message_id uuid,
  p_media_kind text,
  p_request_payload jsonb
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
begin
  if p_media_kind is not null and (
    p_media_kind not in ('giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text')
    or p_attachment_type <> 'image'
    or p_expected_count <> 1
  ) then
    raise exception using errcode = '22023', message = 'invalid_chat_expression_media_kind';
  end if;

  if p_media_kind is not null then
    perform set_config('request.chat_expression_media_kind', p_media_kind, true);
  end if;

  select finalized.* into strict v_message
  from public.rpc_finalize_chat_attachment_batch_v3(
    p_sender_id,
    p_receiver_id,
    p_client_message_id,
    p_attachment_type,
    p_expected_count,
    p_attachments,
    p_caption,
    p_reply_to_message_id,
    p_request_payload
  ) finalized;

  -- Covers idempotent rows created before the insert-context trigger existed.
  if p_media_kind is not null and v_message.media_kind is distinct from p_media_kind then
    update public.messages message_row
    set media_kind = p_media_kind
    where message_row.id = v_message.id
      and message_row.sender_id = p_sender_id
      and message_row.receiver_id = p_receiver_id
      and message_row.message_type = 'image'
      and message_row.media_kind is null
    returning message_row.* into v_message;
  end if;

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment_batch_v4(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment_batch_v4(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, text, jsonb
) to service_role;

create or replace function public.chat_message_semantic_preview(
  p_message_type text,
  p_media_kind text,
  p_text text,
  p_private boolean default false
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_sticker jsonb;
  v_emoji text;
begin
  if p_media_kind = 'giphy_sticker' then
    return case when p_private then 'Sent you a sticker' else 'Sticker' end;
  elsif p_media_kind = 'giphy_gif' then
    return case when p_private then 'Sent you a GIF' else 'GIF' end;
  elsif p_media_kind = 'giphy_emoji' then
    return case when p_private then 'Sent you an animated emoji' else 'Animated emoji' end;
  elsif p_media_kind = 'giphy_text' then
    return case when p_private then 'Sent you animated text' else 'Animated text' end;
  elsif p_message_type = 'image' then
    return case when p_private then 'Sent you a photo' else 'Photo' end;
  elsif p_message_type = 'video' then
    return case when p_private then 'Sent you a video' else 'Video' end;
  elsif p_message_type = 'voice' then
    return case when p_private then 'Sent you a voice message' else 'Voice message' end;
  elsif p_message_type = 'location' then
    return case when p_private then 'Sent you a location' else 'Location' end;
  elsif p_message_type = 'mood_sticker'
    or (p_message_type = 'text' and p_text like 'sticker::%') then
    begin
      v_sticker := substring(p_text from char_length('sticker::') + 1)::jsonb;
      v_emoji := nullif(btrim(coalesce(v_sticker->>'emoji', '')), '');
      return case
        when p_private then 'Sent you a sticker'
        when v_emoji is not null then v_emoji || ' Sticker'
        else 'Sticker'
      end;
    exception when others then
      return case when p_private then 'Sent you a sticker' else 'Sticker' end;
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.chat_message_semantic_preview(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.chat_message_semantic_preview(text, text, text, boolean)
  to service_role;

create or replace function public.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  sender_name text;
  sender_avatar text;
  sender_profile_id uuid;
  body_text text;
  v_semantic text;
  v_date_plan jsonb;
  v_place_name text;
  v_preview_text boolean;
begin
  if exists (
    select 1 from public.notification_prefs preference
    where preference.user_id = new.receiver_id
      and (preference.push_enabled = false or preference.messages = false)
  ) or exists (
    select 1 from public.blocks block_row
    where (block_row.blocker_id = new.receiver_id and block_row.blocked_id = new.sender_id)
       or (block_row.blocker_id = new.sender_id and block_row.blocked_id = new.receiver_id)
  ) or exists (
    select 1 from public.chat_prefs preference
    where preference.user_id = new.receiver_id
      and preference.peer_id = new.sender_id
      and preference.muted = true
  ) then
    return new;
  end if;

  select coalesce(preference.preview_text, true)
  into v_preview_text
  from public.notification_prefs preference
  where preference.user_id = new.receiver_id
  limit 1;

  select profile.full_name, profile.avatar_url, profile.id
  into sender_name, sender_avatar, sender_profile_id
  from public.profiles profile
  where profile.user_id = new.sender_id
  limit 1;

  if sender_profile_id is null then
    select profile.full_name, profile.avatar_url, profile.id
    into sender_name, sender_avatar, sender_profile_id
    from public.profiles profile
    where profile.id = new.sender_id
    limit 1;
  end if;

  sender_name := coalesce(sender_name, 'New message');
  v_semantic := public.chat_message_semantic_preview(
    new.message_type,
    new.media_kind,
    new.text,
    coalesce(v_preview_text, true) = false
  );

  if coalesce(v_preview_text, true) = false then
    body_text := coalesce(v_semantic, 'Sent you a message');
  elsif v_semantic is not null then
    body_text := v_semantic;
  elsif new.message_type = 'text'
    and new.text is not null
    and new.text like 'date_plan::%' then
    begin
      v_date_plan := substring(new.text from char_length('date_plan::') + 1)::jsonb;
      v_place_name := nullif(btrim(coalesce(v_date_plan->>'placeName', '')), '');
      body_text := coalesce('Date suggestion: ' || v_place_name, 'Date suggestion');
    exception when others then
      body_text := 'Date suggestion';
    end;
  elsif new.message_type = 'text'
    and new.text is not null
    and new.text <> ''
    and new.text ~* '^https?://' then
    body_text := 'Photo';
  elsif new.message_type = 'text'
    and new.text is not null
    and new.text <> '' then
    body_text := new.text;
  else
    body_text := 'Sent you a message';
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', new.receiver_id,
      'title', sender_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'message',
        'message_id', new.id,
        'profile_id', sender_profile_id,
        'peer_user_id', new.sender_id,
        'name', sender_name,
        'avatar_url', sender_avatar,
        'media_kind', new.media_kind
      )
    )
  );
  return new;
end;
$$;

alter function public.notify_message_push() owner to postgres;
revoke all on function public.notify_message_push() from public, anon, authenticated;
