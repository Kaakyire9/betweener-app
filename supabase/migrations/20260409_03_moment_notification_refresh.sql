-- Refresh Moment notifications so they no longer depend on legacy inbox_items.
-- Uses push notifications directly and lets the app handle rich in-app realtime toasts.

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
  v_preview_text boolean;
  v_body text;
begin
  select m.id, m.user_id, m.type, m.caption, m.text_body, m.expires_at, m.is_deleted
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

  if tg_op = 'update' and old.emoji is not distinct from new.emoji then
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

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_moment.user_id
      and (p.push_enabled = false or p.moments = false)
  ) then
    return new;
  end if;

  if public.is_quiet_hours(v_moment.user_id) then
    return new;
  end if;

  select p.id, p.full_name, p.avatar_url
    into v_actor_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  select coalesce(p.preview_text, true)
    into v_preview_text
  from public.notification_prefs p
  where p.user_id = v_moment.user_id
  limit 1;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Someone');
  v_body := case
    when coalesce(v_preview_text, true) = false then
      case
        when new.emoji is not null and btrim(new.emoji) <> '' then 'Reacted ' || new.emoji || ' to your Moment'
        else 'Reacted to your Moment'
      end
    when v_moment.type = 'text' and nullif(btrim(coalesce(v_moment.text_body, '')), '') is not null then
      case
        when new.emoji is not null and btrim(new.emoji) <> '' then
          'Reacted ' || new.emoji || ' to "' || left(regexp_replace(v_moment.text_body, '\s+', ' ', 'g'), 88) || '"'
        else
          'Reacted to "' || left(regexp_replace(v_moment.text_body, '\s+', ' ', 'g'), 88) || '"'
      end
    else
      case
        when new.emoji is not null and btrim(new.emoji) <> '' then 'Reacted ' || new.emoji || ' to your Moment'
        else 'Reacted to your Moment'
      end
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_moment.user_id,
      'title', v_actor_name,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'moment_reaction',
        'reaction_id', new.id,
        'moment_id', v_moment.id,
        'profile_id', v_actor_profile_id,
        'name', v_actor_name,
        'avatar_url', v_actor_avatar,
        'emoji', new.emoji,
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
  v_preview_text boolean;
  v_comment_snippet text;
  v_body text;
begin
  select m.id, m.user_id, m.type, m.caption, m.text_body, m.expires_at, m.is_deleted
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

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_moment.user_id
      and (p.push_enabled = false or p.moments = false)
  ) then
    return new;
  end if;

  if public.is_quiet_hours(v_moment.user_id) then
    return new;
  end if;

  select p.id, p.full_name, p.avatar_url
    into v_actor_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  select coalesce(p.preview_text, true)
    into v_preview_text
  from public.notification_prefs p
  where p.user_id = v_moment.user_id
  limit 1;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Someone');
  v_comment_snippet := left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120);
  v_body := case
    when coalesce(v_preview_text, true) = false then
      'Commented on your Moment'
    when nullif(btrim(coalesce(v_comment_snippet, '')), '') is not null then
      'Commented: "' || v_comment_snippet || '"'
    else
      'Commented on your Moment'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_moment.user_id,
      'title', v_actor_name,
      'body', v_body,
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

create or replace function public.notify_moment_post_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_default_body text;
  v_recipient record;
begin
  if new.user_id is null
     or coalesce(new.is_deleted, false)
     or new.expires_at <= timezone('utc'::text, now()) then
    return new;
  end if;

  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Someone'), p.avatar_url
    into v_owner_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  if v_owner_profile_id is null then
    return new;
  end if;

  v_default_body := case
    when new.type = 'text' and nullif(btrim(coalesce(new.text_body, '')), '') is not null then
      'Shared a new thought: "' || left(regexp_replace(new.text_body, '\s+', ' ', 'g'), 88) || '"'
    when nullif(btrim(coalesce(new.caption, '')), '') is not null then
      'Shared a new Moment: "' || left(regexp_replace(new.caption, '\s+', ' ', 'g'), 88) || '"'
    when new.type = 'video' then
      'Shared a new video Moment'
    when new.type = 'photo' then
      'Shared a new photo Moment'
    else
      'Shared a new Moment'
  end;

  for v_recipient in
    with candidate_profiles as (
      select case
          when s.swiper_id = v_owner_profile_id then s.target_id
          else s.swiper_id
        end as profile_id
      from public.swipes s
      where (s.swiper_id = v_owner_profile_id or s.target_id = v_owner_profile_id)
        and s.action in ('LIKE', 'SUPERLIKE')

      union

      select case
          when ir.actor_id = v_owner_profile_id then ir.recipient_id
          else ir.actor_id
        end as profile_id
      from public.intent_requests ir
      where (ir.actor_id = v_owner_profile_id or ir.recipient_id = v_owner_profile_id)
        and coalesce(ir.status, '') in ('pending', 'accepted', 'matched')
    )
    select distinct
      p.user_id,
      coalesce(np.preview_text, true) as preview_text
    from candidate_profiles cp
    join public.profiles p on p.id = cp.profile_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where p.user_id is not null
      and p.user_id <> new.user_id
      and coalesce(np.push_enabled, true)
      and coalesce(np.moments, true)
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = p.user_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = p.user_id)
      )
  loop
    if public.is_quiet_hours(v_recipient.user_id) then
      continue;
    end if;

    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_recipient.user_id,
        'title', v_actor_name,
        'body', case
          when coalesce(v_recipient.preview_text, true) = false then 'Shared a new Moment'
          else v_default_body
        end,
        'data', jsonb_build_object(
          'type', 'moment_post',
          'moment_id', new.id,
          'profile_id', v_owner_profile_id,
          'user_id', new.user_id,
          'poster_user_id', new.user_id,
          'name', v_actor_name,
          'avatar_url', v_actor_avatar,
          'start_user_id', new.user_id,
          'route', '/moments'
        )
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_moment_post_push on public.moments;
create trigger notify_moment_post_push
after insert on public.moments
for each row
execute function public.notify_moment_post_push();
