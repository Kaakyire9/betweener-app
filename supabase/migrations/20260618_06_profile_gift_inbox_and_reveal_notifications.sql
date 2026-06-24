-- Polish gift notifications across inbox and push for send, reveal, and archive moments.

create or replace function public.notify_profile_gift_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  sender_name text;
  sender_avatar text;
  gift_label text;
  v_recipient_user_id uuid;
  v_has_inbox_items boolean := to_regclass('public.inbox_items') is not null;
  v_inbox_body text;
begin
  select recipient.user_id
    into v_recipient_user_id
  from public.profiles recipient
  where recipient.id = new.profile_id
  limit 1;

  sender_name := coalesce(nullif(btrim(new.sender_display_name), ''), 'New gift');
  sender_avatar := new.sender_avatar_url;
  gift_label := case new.gift_type
    when 'rose' then 'a rose'
    when 'teddy' then 'a teddy bear'
    when 'ring' then 'a ring'
    else 'a gift'
  end;
  v_inbox_body := sender_name || ' sent you ' || gift_label || ' worth opening.';

  if v_has_inbox_items
     and v_recipient_user_id is not null
     and not exists (
       select 1
       from public.notification_prefs p
       where p.user_id = v_recipient_user_id
         and (p.inapp_enabled = false or p.gifts = false)
     )
     and not exists (
       select 1
       from public.inbox_items inbox
       where inbox.user_id = v_recipient_user_id
         and inbox.entity_type = 'profile_gift'
         and inbox.entity_id = new.id
     )
  then
    insert into public.inbox_items (
      user_id,
      type,
      actor_id,
      entity_id,
      entity_type,
      title,
      body,
      action_required,
      metadata
    )
    values (
      v_recipient_user_id,
      'GIFT_RECEIVED',
      new.sender_profile_id,
      new.id,
      'profile_gift',
      sender_name,
      v_inbox_body,
      true,
      jsonb_build_object(
        'type', 'profile_gift',
        'gift_id', new.id,
        'gift_type', new.gift_type,
        'profile_id', new.sender_profile_id,
        'name', sender_name,
        'avatar_url', sender_avatar,
        'actor_user_id', new.sender_id,
        'route', '/profile-insights',
        'cta_label', 'Say Thanks'
      )
    );
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_recipient_user_id
      and (p.push_enabled = false or p.gifts = false)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles recipient
    where recipient.id = new.profile_id
      and public.is_quiet_hours(recipient.user_id)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles recipient
    join public.blocks b
      on (b.blocker_id = recipient.user_id and b.blocked_id = new.sender_id)
      or (b.blocker_id = new.sender_id and b.blocked_id = recipient.user_id)
    where recipient.id = new.profile_id
  ) then
    return new;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_recipient_user_id,
      'title', sender_name,
      'body', v_inbox_body,
      'data', jsonb_build_object(
        'type', 'profile_gift',
        'gift_id', new.id,
        'gift_type', new.gift_type,
        'profile_id', new.sender_profile_id,
        'name', sender_name,
        'avatar_url', sender_avatar,
        'route', '/profile-insights'
      )
    )
  );
  return new;
end;
$$;

create or replace function public.notify_profile_gift_sender_moment(
  p_gift_id uuid,
  p_moment text
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_gift public.profile_gifts%rowtype;
  v_sender_profile public.profiles%rowtype;
  v_recipient_profile public.profiles%rowtype;
  v_has_inbox_items boolean := to_regclass('public.inbox_items') is not null;
  v_gift_label text;
  v_recipient_name text;
  v_recipient_avatar text;
  v_body text;
  v_entity_type text;
  v_push_type text;
  v_cta_label text;
begin
  if coalesce(nullif(btrim(p_moment), ''), '') not in ('revealed', 'archived') then
    raise exception 'invalid_profile_gift_sender_moment' using errcode = '22023';
  end if;

  select g.*
    into v_gift
  from public.profile_gifts g
  where g.id = p_gift_id
  limit 1;

  if v_gift.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  if v_gift.sender_profile_id is not null then
    select p.*
      into v_sender_profile
    from public.profiles p
    where p.id = v_gift.sender_profile_id
    limit 1;
  end if;

  if v_sender_profile.id is null then
    select p.*
      into v_sender_profile
    from public.profiles p
    where p.user_id = v_gift.sender_id
      and p.deleted_at is null
    limit 1;
  end if;

  select p.*
    into v_recipient_profile
  from public.profiles p
  where p.id = v_gift.profile_id
  limit 1;

  v_gift_label := case v_gift.gift_type
    when 'rose' then 'rose'
    when 'teddy' then 'teddy bear'
    when 'ring' then 'ring'
    else 'gift'
  end;
  v_recipient_name := coalesce(
    nullif(btrim(v_recipient_profile.full_name), ''),
    nullif(btrim(v_recipient_profile.username), ''),
    'A Betweener'
  );
  v_recipient_avatar := v_recipient_profile.avatar_url;
  v_entity_type := case
    when p_moment = 'revealed' then 'profile_gift_revealed'
    else 'profile_gift_archived'
  end;
  v_push_type := case
    when p_moment = 'revealed' then 'profile_gift_revealed'
    else 'profile_gift_archived'
  end;
  v_cta_label := case
    when p_moment = 'revealed' then 'Open archive'
    else 'View archive'
  end;
  v_body := case
    when p_moment = 'revealed'
      then v_recipient_name || ' opened your ' || v_gift_label || '.'
    else v_recipient_name || ' saved your ' || v_gift_label || ' in their archive.'
  end;

  if v_has_inbox_items
     and not exists (
       select 1
       from public.notification_prefs p
       where p.user_id = v_gift.sender_id
         and (p.inapp_enabled = false or p.gifts = false)
     )
     and not exists (
       select 1
       from public.inbox_items inbox
       where inbox.user_id = v_gift.sender_id
         and inbox.entity_type = v_entity_type
         and inbox.entity_id = v_gift.id
     )
  then
    insert into public.inbox_items (
      user_id,
      type,
      actor_id,
      entity_id,
      entity_type,
      title,
      body,
      action_required,
      metadata
    )
    values (
      v_gift.sender_id,
      'SYSTEM',
      v_recipient_profile.id,
      v_gift.id,
      v_entity_type,
      v_recipient_name,
      v_body,
      false,
      jsonb_build_object(
        'type', v_push_type,
        'gift_id', v_gift.id,
        'gift_type', v_gift.gift_type,
        'profile_id', v_recipient_profile.id,
        'name', v_recipient_name,
        'avatar_url', v_recipient_avatar,
        'route', '/profile-insights',
        'cta_label', v_cta_label
      )
    );
  end if;

  if p_moment = 'revealed'
     and not exists (
       select 1
       from public.notification_prefs p
       where p.user_id = v_gift.sender_id
         and (p.push_enabled = false or p.gifts = false)
     )
     and not public.is_quiet_hours(v_gift.sender_id)
     and not exists (
       select 1
       from public.blocks b
       where (b.blocker_id = v_gift.sender_id and b.blocked_id = v_recipient_profile.user_id)
          or (b.blocker_id = v_recipient_profile.user_id and b.blocked_id = v_gift.sender_id)
     )
  then
    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_gift.sender_id,
        'title', v_recipient_name,
        'body', v_body,
        'data', jsonb_build_object(
          'type', v_push_type,
          'gift_id', v_gift.id,
          'gift_type', v_gift.gift_type,
          'profile_id', v_recipient_profile.id,
          'name', v_recipient_name,
          'avatar_url', v_recipient_avatar,
          'route', '/profile-insights'
        )
      )
    );
  end if;

  return true;
end;
$$;

create or replace function public.rpc_reveal_profile_gift(
  p_gift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.profile_gifts%rowtype;
  v_was_revealed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select g.revealed_at
    into v_was_revealed_at
  from public.profile_gifts g
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  limit 1;

  update public.profile_gifts g
  set opened_at = coalesce(g.opened_at, timezone('utc'::text, now())),
      revealed_at = coalesce(g.revealed_at, timezone('utc'::text, now()))
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  returning g.* into v_row;

  if v_row.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  if v_was_revealed_at is null then
    perform public.rpc_log_profile_gift_event(
      v_row.id,
      'revealed',
      jsonb_build_object('gift_type', v_row.gift_type)
    );

    perform public.notify_profile_gift_sender_moment(v_row.id, 'revealed');
  end if;

  return jsonb_build_object(
    'gift_id', v_row.id,
    'opened_at', v_row.opened_at,
    'revealed_at', v_row.revealed_at,
    'archived_at', v_row.archived_at
  );
end;
$$;

create or replace function public.rpc_archive_profile_gift(
  p_gift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.profile_gifts%rowtype;
  v_was_archived_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select g.archived_at
    into v_was_archived_at
  from public.profile_gifts g
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  limit 1;

  update public.profile_gifts g
  set opened_at = coalesce(g.opened_at, timezone('utc'::text, now())),
      revealed_at = coalesce(g.revealed_at, timezone('utc'::text, now())),
      archived_at = coalesce(g.archived_at, timezone('utc'::text, now()))
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  returning g.* into v_row;

  if v_row.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  if v_was_archived_at is null then
    perform public.rpc_log_profile_gift_event(
      v_row.id,
      'archived',
      jsonb_build_object('gift_type', v_row.gift_type)
    );

    perform public.notify_profile_gift_sender_moment(v_row.id, 'archived');
  end if;

  return jsonb_build_object(
    'gift_id', v_row.id,
    'opened_at', v_row.opened_at,
    'revealed_at', v_row.revealed_at,
    'archived_at', v_row.archived_at
  );
end;
$$;

revoke all on function public.notify_profile_gift_sender_moment(uuid, text) from public;
