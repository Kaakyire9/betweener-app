-- Moment reaction/comment notifications.
-- Creates inbox items and push notifications for private Moment engagement.

create or replace function public.notify_moment_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_moment record;
  v_actor_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_body text;
begin
  select m.id, m.user_id, m.type, m.caption, m.expires_at, m.is_deleted
    into v_moment
  from public.moments m
  where m.id = new.moment_id
  limit 1;

  if not found
     or v_moment.user_id is null
     or v_moment.user_id = new.user_id
     or coalesce(v_moment.is_deleted, false)
     or v_moment.expires_at <= timezone('utc'::text, now()) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.emoji is not distinct from new.emoji then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_moment.user_id and b.blocked_id = new.user_id)
       or (b.blocker_id = new.user_id and b.blocked_id = v_moment.user_id)
  ) then
    return new;
  end if;

  select p.id, p.full_name, p.avatar_url
    into v_actor_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Someone');
  v_body := case
    when new.emoji is not null and btrim(new.emoji) <> ''
      then 'Reacted ' || new.emoji || ' to your Moment'
    else 'Reacted to your Moment'
  end;

  if not exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_moment.user_id
      and (
        p.inapp_enabled = false
        or p.moments = false
      )
  ) then
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
      v_moment.user_id,
      'MOMENT_REACTION',
      v_actor_profile_id,
      v_moment.id,
      'moment',
      v_actor_name,
      v_body,
      false,
      jsonb_strip_nulls(
        jsonb_build_object(
          'emoji', new.emoji,
          'moment_id', v_moment.id,
          'moment_owner_user_id', v_moment.user_id,
          'moment_type', v_moment.type,
          'name', v_actor_name,
          'avatar_url', v_actor_avatar
        )
      )
    );
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_moment.user_id
      and (
        p.push_enabled = false
        or p.moments = false
      )
  ) then
    return new;
  end if;

  if public.is_quiet_hours(v_moment.user_id) then
    return new;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_moment.user_id,
      'title', v_actor_name,
      'body', case
        when exists (
          select 1
          from public.notification_prefs p
          where p.user_id = v_moment.user_id
            and p.preview_text = false
        ) then 'Someone reacted to your Moment'
        else v_body
      end,
      'data', jsonb_build_object(
        'type', 'moment_reaction',
        'reaction_id', new.id,
        'moment_id', v_moment.id,
        'profile_id', v_actor_profile_id,
        'name', v_actor_name,
        'avatar_url', v_actor_avatar,
        'moment_owner_user_id', v_moment.user_id,
        'start_user_id', v_moment.user_id,
        'route', '/moments'
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_moment_reaction_push on public.moment_reactions;
create trigger notify_moment_reaction_push
after insert or update of emoji on public.moment_reactions
for each row
execute function public.notify_moment_reaction_push();

create or replace function public.notify_moment_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_moment record;
  v_actor_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_body text;
  v_push_body text;
begin
  select m.id, m.user_id, m.type, m.caption, m.expires_at, m.is_deleted
    into v_moment
  from public.moments m
  where m.id = new.moment_id
  limit 1;

  if not found
     or v_moment.user_id is null
     or v_moment.user_id = new.user_id
     or coalesce(v_moment.is_deleted, false)
     or coalesce(new.is_deleted, false)
     or v_moment.expires_at <= timezone('utc'::text, now()) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_moment.user_id and b.blocked_id = new.user_id)
       or (b.blocker_id = new.user_id and b.blocked_id = v_moment.user_id)
  ) then
    return new;
  end if;

  select p.id, p.full_name, p.avatar_url
    into v_actor_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Someone');
  v_push_body := left(coalesce(nullif(btrim(new.body), ''), 'Commented on your Moment'), 160);
  v_body := case
    when v_push_body = 'Commented on your Moment' then v_push_body
    else 'Commented: ' || v_push_body
  end;

  if not exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_moment.user_id
      and (
        p.inapp_enabled = false
        or p.moments = false
      )
  ) then
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
      v_moment.user_id,
      'MOMENT_COMMENT',
      v_actor_profile_id,
      v_moment.id,
      'moment',
      v_actor_name,
      v_body,
      true,
      jsonb_strip_nulls(
        jsonb_build_object(
          'comment_id', new.id,
          'moment_id', v_moment.id,
          'moment_owner_user_id', v_moment.user_id,
          'moment_type', v_moment.type,
          'name', v_actor_name,
          'avatar_url', v_actor_avatar
        )
      )
    );
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_moment.user_id
      and (
        p.push_enabled = false
        or p.moments = false
      )
  ) then
    return new;
  end if;

  if public.is_quiet_hours(v_moment.user_id) then
    return new;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_moment.user_id,
      'title', v_actor_name,
      'body', case
        when exists (
          select 1
          from public.notification_prefs p
          where p.user_id = v_moment.user_id
            and p.preview_text = false
        ) then 'Someone commented on your Moment'
        else v_body
      end,
      'data', jsonb_build_object(
        'type', 'moment_comment',
        'comment_id', new.id,
        'moment_id', v_moment.id,
        'profile_id', v_actor_profile_id,
        'name', v_actor_name,
        'avatar_url', v_actor_avatar,
        'moment_owner_user_id', v_moment.user_id,
        'start_user_id', v_moment.user_id,
        'route', '/moments'
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_moment_comment_push on public.moment_comments;
create trigger notify_moment_comment_push
after insert on public.moment_comments
for each row
execute function public.notify_moment_comment_push();
