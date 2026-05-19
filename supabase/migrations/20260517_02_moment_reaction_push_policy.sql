-- Reduce noisy Moment reaction push notifications.
-- Policy:
-- 1. Only the first reaction in a short burst sends a push.
-- 2. Emoji-only reaction updates do not send a push.
-- 3. Comments remain on their own higher-priority push path.

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
  v_has_recent_other_reaction boolean;
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

  -- Realtime/in-app can reflect emoji changes; background push should not.
  if tg_op = 'update' then
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

  select exists (
    select 1
    from public.moment_reactions mr
    where mr.moment_id = new.moment_id
      and mr.id <> new.id
      and mr.user_id <> new.user_id
      and mr.created_at >= timezone('utc'::text, now()) - interval '30 minutes'
  )
    into v_has_recent_other_reaction;

  if coalesce(v_has_recent_other_reaction, false) then
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

drop trigger if exists notify_moment_reaction_push on public.moment_reactions;
create trigger notify_moment_reaction_push
after insert or update of emoji on public.moment_reactions
for each row
execute function public.notify_moment_reaction_push();
