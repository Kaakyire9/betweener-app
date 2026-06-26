alter table public.inbox_items
  drop constraint if exists inbox_items_type_check;

alter table public.inbox_items
  add constraint inbox_items_type_check check (
    type in (
      'LIKE_RECEIVED',
      'SUPERLIKE_RECEIVED',
      'MESSAGE_REQUEST',
      'NEW_MESSAGE',
      'MOMENT_REACTION',
      'MOMENT_COMMENT',
      'MOMENT_COMMENT_REACTION',
      'GIFT_RECEIVED',
      'MATCH_CREATED',
      'SYSTEM'
    )
  );

create or replace function public.notify_moment_comment_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_comment record;
  v_moment record;
  v_comment_owner_profile_id uuid;
  v_actor_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_preview_text boolean := true;
  v_inapp_enabled boolean := true;
  v_push_enabled boolean := true;
  v_moments_enabled boolean := true;
  v_reaction_emoji text;
  v_reaction_prefix text;
  v_relationship_cue text;
  v_cue_lead text;
  v_body text;
begin
  select c.id, c.user_id, c.moment_id, c.is_deleted
    into v_comment
  from public.moment_comments c
  where c.id = new.comment_id
  limit 1;

  if not found
     or v_comment.user_id is null
     or v_comment.user_id = new.user_id
     or coalesce(v_comment.is_deleted, false) then
    return new;
  end if;

  select m.id, m.user_id, m.type, m.caption, m.text_body, m.expires_at, m.is_deleted
    into v_moment
  from public.moments m
  where m.id = v_comment.moment_id
  limit 1;

  if not found
     or v_moment.user_id is null
     or coalesce(v_moment.is_deleted, false)
     or v_moment.expires_at <= timezone('utc'::text, now()) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_comment.user_id and b.blocked_id = new.user_id)
       or (b.blocker_id = new.user_id and b.blocked_id = v_comment.user_id)
  ) then
    return new;
  end if;

  select p.id
    into v_comment_owner_profile_id
  from public.profiles p
  where p.user_id = v_comment.user_id
  limit 1;

  select p.id, p.full_name, p.avatar_url
    into v_actor_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  select
    coalesce(p.preview_text, true),
    coalesce(p.inapp_enabled, true),
    coalesce(p.push_enabled, true),
    coalesce(p.moments, true)
    into
      v_preview_text,
      v_inapp_enabled,
      v_push_enabled,
      v_moments_enabled
  from public.notification_prefs p
  where p.user_id = v_comment.user_id
  limit 1;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Someone');
  v_reaction_emoji := case new.reaction
    when 'heart' then '❤️'
    when 'love' then '😍'
    when 'fire' then '🔥'
    when 'clap' then '👏'
    when 'laugh' then '😂'
    else null
  end;
  v_reaction_prefix := case
    when v_reaction_emoji is not null then 'reacted ' || v_reaction_emoji
    else 'reacted'
  end;
  v_relationship_cue := public.get_moment_relationship_cue(
    v_comment_owner_profile_id,
    v_actor_profile_id
  );
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
        when v_cue_lead is not null then v_cue_lead || ' reacted to your comment'
        else 'Reacted to your comment'
      end
    else
      case
        when v_cue_lead is not null then v_cue_lead || ' ' || v_reaction_prefix || ' to your comment'
        else initcap(v_reaction_prefix) || ' to your comment'
      end
  end;

  if v_moments_enabled and v_inapp_enabled then
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
      v_comment.user_id,
      'MOMENT_COMMENT_REACTION',
      v_actor_profile_id,
      v_moment.id,
      'moment',
      v_actor_name,
      v_body,
      false,
      jsonb_strip_nulls(
        jsonb_build_object(
          'comment_reaction_id', new.id,
          'comment_id', v_comment.id,
          'moment_id', v_moment.id,
          'moment_owner_user_id', v_moment.user_id,
          'moment_type', v_moment.type,
          'name', v_actor_name,
          'avatar_url', v_actor_avatar,
          'reaction', new.reaction,
          'reaction_emoji', v_reaction_emoji,
          'relationship_cue', v_relationship_cue,
          'route', '/moments'
        )
      )
    );
  end if;

  if not v_moments_enabled or not v_push_enabled or public.is_quiet_hours(v_comment.user_id) then
    return new;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_comment.user_id,
      'title', v_actor_name,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'moment_comment_reaction',
        'comment_reaction_id', new.id,
        'comment_id', v_comment.id,
        'moment_id', v_moment.id,
        'profile_id', v_actor_profile_id,
        'name', v_actor_name,
        'avatar_url', v_actor_avatar,
        'reaction', new.reaction,
        'reaction_emoji', v_reaction_emoji,
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

drop trigger if exists notify_moment_comment_reaction_push on public.moment_comment_reactions;
create trigger notify_moment_comment_reaction_push
after insert on public.moment_comment_reactions
for each row
execute function public.notify_moment_comment_reaction_push();
