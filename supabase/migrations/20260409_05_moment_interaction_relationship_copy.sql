-- Enrich Moment reaction/comment push copy with relationship-aware context.
-- This keeps interaction alerts aligned with the richer Betweener tone now used in the viewer and post alerts.

create or replace function public.get_moment_relationship_cue(
  p_profile_id uuid,
  p_peer_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_cue text;
  v_liked_you boolean;
  v_you_liked boolean;
begin
  if p_profile_id is null or p_peer_profile_id is null or p_profile_id = p_peer_profile_id then
    return null;
  end if;

  select ranked_intent.cue
    into v_cue
  from (
    select
      case
        when coalesce(ir.status, '') = 'matched' then 'You matched'
        when coalesce(ir.status, '') = 'accepted' then 'Door reopened'
        when ir.actor_id = p_profile_id then 'You reached out'
        else 'They reached out'
      end as cue,
      case
        when coalesce(ir.status, '') = 'matched' then 3
        when coalesce(ir.status, '') = 'accepted' then 2
        else 1
      end as priority,
      ir.created_at
    from public.intent_requests ir
    where ((ir.actor_id = p_profile_id and ir.recipient_id = p_peer_profile_id)
        or (ir.actor_id = p_peer_profile_id and ir.recipient_id = p_profile_id))
      and coalesce(ir.status, '') in ('pending', 'accepted', 'matched')
    order by priority desc, ir.created_at desc
    limit 1
  ) ranked_intent;

  if v_cue is not null then
    return v_cue;
  end if;

  select
    coalesce(bool_or(s.swiper_id = p_profile_id and s.target_id = p_peer_profile_id), false),
    coalesce(bool_or(s.swiper_id = p_peer_profile_id and s.target_id = p_profile_id), false)
  into v_you_liked, v_liked_you
  from public.swipes s
  where ((s.swiper_id = p_profile_id and s.target_id = p_peer_profile_id)
      or (s.swiper_id = p_peer_profile_id and s.target_id = p_profile_id))
    and s.action in ('LIKE', 'SUPERLIKE');

  return case
    when v_liked_you and v_you_liked then 'You liked each other'
    when v_liked_you then 'Liked you'
    when v_you_liked then 'You liked them'
    else null
  end;
end;
$$;

create or replace function public.notify_moment_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_moment record;
  v_owner_profile_id uuid;
  v_actor_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_preview_text boolean;
  v_body text;
  v_reaction_prefix text;
  v_relationship_cue text;
  v_cue_lead text;
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

  select p.id
    into v_owner_profile_id
  from public.profiles p
  where p.user_id = v_moment.user_id
  limit 1;

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
  v_reaction_prefix := case
    when new.emoji is not null and btrim(new.emoji) <> '' then 'reacted ' || new.emoji
    else 'reacted'
  end;
  v_relationship_cue := public.get_moment_relationship_cue(v_owner_profile_id, v_actor_profile_id);
  v_cue_lead := case v_relationship_cue
    when 'You matched' then 'Your match'
    when 'Door reopened' then 'A reopened connection'
    when 'Liked you' then 'Someone who liked you'
    when 'You liked each other' then 'Someone you both noticed'
    when 'You liked them' then 'Someone on your radar'
    when 'You reached out' then 'Someone you reached out to'
    when 'They reached out' then 'Someone who reached out'
    else null
  end;

  v_body := case
    when coalesce(v_preview_text, true) = false then
      case
        when v_cue_lead is not null then v_cue_lead || ' ' || v_reaction_prefix || ' to your Moment'
        else initcap(v_reaction_prefix) || ' to your Moment'
      end
    when v_moment.type = 'text' and nullif(btrim(coalesce(v_moment.text_body, '')), '') is not null then
      case
        when v_cue_lead is not null then v_cue_lead || ' ' || v_reaction_prefix || ' to "' || left(regexp_replace(v_moment.text_body, '\s+', ' ', 'g'), 88) || '"'
        else initcap(v_reaction_prefix) || ' to "' || left(regexp_replace(v_moment.text_body, '\s+', ' ', 'g'), 88) || '"'
      end
    else
      case
        when v_cue_lead is not null then v_cue_lead || ' ' || v_reaction_prefix || ' to your Moment'
        else initcap(v_reaction_prefix) || ' to your Moment'
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
        'relationship_cue', v_relationship_cue,
        'moment_owner_user_id', v_moment.user_id,
        'start_user_id', v_moment.user_id,
        'route', '/moments'
      )
    )
  );

  return new;
end;
$$;

create or replace function public.notify_moment_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_moment record;
  v_owner_profile_id uuid;
  v_actor_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_preview_text boolean;
  v_comment_snippet text;
  v_body text;
  v_relationship_cue text;
  v_cue_lead text;
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

  select p.id
    into v_owner_profile_id
  from public.profiles p
  where p.user_id = v_moment.user_id
  limit 1;

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
  v_relationship_cue := public.get_moment_relationship_cue(v_owner_profile_id, v_actor_profile_id);
  v_cue_lead := case v_relationship_cue
    when 'You matched' then 'Your match'
    when 'Door reopened' then 'A reopened connection'
    when 'Liked you' then 'Someone who liked you'
    when 'You liked each other' then 'Someone you both noticed'
    when 'You liked them' then 'Someone on your radar'
    when 'You reached out' then 'Someone you reached out to'
    when 'They reached out' then 'Someone who reached out'
    else null
  end;

  v_body := case
    when coalesce(v_preview_text, true) = false then
      case
        when v_cue_lead is not null then v_cue_lead || ' commented on your Moment'
        else 'Commented on your Moment'
      end
    when nullif(btrim(coalesce(v_comment_snippet, '')), '') is not null then
      case
        when v_cue_lead is not null then v_cue_lead || ' commented: "' || v_comment_snippet || '"'
        else 'Commented: "' || v_comment_snippet || '"'
      end
    else
      case
        when v_cue_lead is not null then v_cue_lead || ' commented on your Moment'
        else 'Commented on your Moment'
      end
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
        'relationship_cue', v_relationship_cue,
        'moment_owner_user_id', v_moment.user_id,
        'start_user_id', v_moment.user_id,
        'route', '/moments'
      )
    )
  );

  return new;
end;
$$;
