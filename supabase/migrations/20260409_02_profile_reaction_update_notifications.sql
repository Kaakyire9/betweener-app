-- Make profile image reaction notifications fire on emoji changes as well as first insert.
-- profile_image_reactions uses upsert(profile_id, image_url, reactor_user_id), so changing
-- an existing emoji is an UPDATE, not an INSERT.

create or replace function public.notify_profile_image_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_user_id uuid;
  reactor_profile_id uuid;
  reactor_name text;
  reactor_avatar text;
  body_text text;
begin
  if tg_op = 'UPDATE' and old.emoji is not distinct from new.emoji then
    return new;
  end if;

  select p.user_id
  into target_user_id
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  if target_user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = target_user_id
      and (p.push_enabled = false or p.reactions = false)
  ) then
    return new;
  end if;

  if public.is_quiet_hours(target_user_id) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = target_user_id and b.blocked_id = new.reactor_user_id)
       or (b.blocker_id = new.reactor_user_id and b.blocked_id = target_user_id)
  ) then
    return new;
  end if;

  select p.id, p.full_name, p.avatar_url
  into reactor_profile_id, reactor_name, reactor_avatar
  from public.profiles p
  where p.user_id = new.reactor_user_id
  limit 1;

  reactor_name := coalesce(reactor_name, 'Someone');
  body_text := case
    when new.emoji is not null and new.emoji <> '' then 'reacted ' || new.emoji || ' to your photo'
    else 'reacted to your photo'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', reactor_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'profile_reaction',
        'reaction_id', new.id,
        'profile_id', reactor_profile_id,
        'peer_user_id', new.reactor_user_id,
        'name', reactor_name,
        'avatar_url', reactor_avatar,
        'emoji', new.emoji
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_profile_image_reaction_push on public.profile_image_reactions;
create trigger notify_profile_image_reaction_push
after insert or update of emoji on public.profile_image_reactions
for each row
execute function public.notify_profile_image_reaction_push();
