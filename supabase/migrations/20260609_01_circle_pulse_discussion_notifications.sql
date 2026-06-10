alter table public.notification_prefs
  add column if not exists circle_discussions boolean not null default true;

create or replace function public.enqueue_circle_pulse_push(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_pref_kind text,
  p_title text,
  p_body text,
  p_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if p_target_user_id is null
    or p_actor_user_id is null
    or p_target_user_id = p_actor_user_id then
    return false;
  end if;

  if exists (
    select 1
    from public.notification_prefs np
    where np.user_id = p_target_user_id
      and (
        np.push_enabled = false
        or (p_pref_kind = 'messages' and np.messages = false)
        or (p_pref_kind = 'reactions' and np.reactions = false)
        or (p_pref_kind = 'circle_discussions' and np.circle_discussions = false)
      )
  ) then
    return false;
  end if;

  if public.is_quiet_hours(p_target_user_id) then
    return false;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = p_target_user_id and b.blocked_id = p_actor_user_id)
       or (b.blocker_id = p_actor_user_id and b.blocked_id = p_target_user_id)
  ) then
    return false;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', p_target_user_id,
      'title', p_title,
      'body', p_body,
      'data', p_data
    )
  );

  return true;
end;
$$;

create or replace function public.notify_circle_pulse_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_circle_name text := 'your Circle';
  v_item_type text;
  v_love_seat_id uuid;
  v_parent_user_id uuid;
  v_target_user_id uuid;
  v_notified_user_ids uuid[] := array[new.user_id];
  v_payload_base jsonb;
  v_recipient record;
begin
  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  select
    coalesce(nullif(btrim(c.name), ''), 'your Circle'),
    cpi.item_type,
    cpi.love_seat_id
  into v_circle_name, v_item_type, v_love_seat_id
  from public.circle_pulse_items cpi
  join public.circles c on c.id = cpi.circle_id
  where cpi.id = new.pulse_item_id
  limit 1;

  v_payload_base := jsonb_build_object(
    'circle_id', new.circle_id,
    'pulse_item_id', new.pulse_item_id,
    'comment_id', new.id,
    'parent_comment_id', new.parent_comment_id,
    'actor_profile_id', new.profile_id,
    'name', v_actor_name,
    'avatar_url', v_actor_avatar
  );

  if new.parent_comment_id is not null then
    select cpc.user_id
      into v_parent_user_id
    from public.circle_pulse_comments cpc
    where cpc.id = new.parent_comment_id
    limit 1;

    if v_parent_user_id is not null
      and not (v_parent_user_id = any(v_notified_user_ids)) then
      perform public.enqueue_circle_pulse_push(
        v_parent_user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' replied to your comment in ' || v_circle_name || '.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'reply'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_parent_user_id);
    end if;
  end if;

  if v_item_type = 'love_seat' and v_love_seat_id is not null then
    select p.user_id
      into v_target_user_id
    from public.circle_love_seats cls
    join public.profiles p on p.id = cls.featured_profile_id
    where cls.id = v_love_seat_id
    limit 1;

    if v_target_user_id is not null
      and not (v_target_user_id = any(v_notified_user_ids)) then
      perform public.enqueue_circle_pulse_push(
        v_target_user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' joined your Love Seat discussion in ' || v_circle_name || '.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'love_seat_discussion'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_target_user_id);
    end if;
  elsif v_item_type = 'welcome' then
    for v_recipient in
      select distinct p.user_id as user_id
      from public.circle_pulse_welcome_members cpwm
      join public.profiles p on p.id = cpwm.profile_id
      where cpwm.circle_id = new.circle_id
        and cpwm.status = 'active'
        and cpwm.expires_at > timezone('utc'::text, now())
        and p.user_id is not null
    loop
      if v_recipient.user_id is null
        or v_recipient.user_id = any(v_notified_user_ids) then
        continue;
      end if;

      perform public.enqueue_circle_pulse_push(
        v_recipient.user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' posted in your welcome discussion in ' || v_circle_name || '.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'welcome_discussion'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_recipient.user_id);
    end loop;
  end if;

  if new.parent_comment_id is not null then
    for v_recipient in
      select distinct cpc.user_id as user_id
      from public.circle_pulse_comments cpc
      where cpc.pulse_item_id = new.pulse_item_id
        and cpc.status = 'active'
        and cpc.user_id is not null
        and cpc.id <> new.id
    loop
      if v_recipient.user_id is null
        or v_recipient.user_id = any(v_notified_user_ids) then
        continue;
      end if;

      perform public.enqueue_circle_pulse_push(
        v_recipient.user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' replied in a Circle discussion you joined.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'participant_reply'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_recipient.user_id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_circle_pulse_comment_push on public.circle_pulse_comments;
create trigger notify_circle_pulse_comment_push
after insert on public.circle_pulse_comments
for each row execute function public.notify_circle_pulse_comment_push();

create or replace function public.notify_circle_pulse_comment_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_circle_name text := 'your Circle';
  v_target_user_id uuid;
begin
  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  select
    cpc.user_id,
    coalesce(nullif(btrim(c.name), ''), 'your Circle')
  into v_target_user_id, v_circle_name
  from public.circle_pulse_comments cpc
  join public.circles c on c.id = cpc.circle_id
  where cpc.id = new.comment_id
  limit 1;

  perform public.enqueue_circle_pulse_push(
    v_target_user_id,
    new.user_id,
    'reactions',
    v_actor_name,
    case
      when new.reaction is not null and new.reaction <> '' then
        v_actor_name || ' reacted to your comment in ' || v_circle_name || '.'
      else
        v_actor_name || ' reacted to your comment.'
    end,
    jsonb_build_object(
      'type', 'circle_pulse_reaction',
      'circle_id', new.circle_id,
      'pulse_item_id', new.pulse_item_id,
      'comment_id', new.comment_id,
      'reaction', new.reaction,
      'actor_profile_id', new.profile_id,
      'name', v_actor_name,
      'avatar_url', v_actor_avatar
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_circle_pulse_comment_reaction_push on public.circle_pulse_comment_reactions;
create trigger notify_circle_pulse_comment_reaction_push
after insert on public.circle_pulse_comment_reactions
for each row execute function public.notify_circle_pulse_comment_reaction_push();
