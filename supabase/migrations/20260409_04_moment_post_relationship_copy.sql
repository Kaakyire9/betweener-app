-- Enrich Moment post push copy with relationship-aware context.
-- Keeps the recipient list the same, but makes the notification body feel like Betweener,
-- not a generic stories feed.

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
  v_body text;
  v_relationship_cue text;
  v_swipe_liked_you boolean;
  v_swipe_you_liked boolean;
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
      p.id as profile_id,
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

    v_relationship_cue := null;

    select cue
      into v_relationship_cue
    from (
      select
        case
          when coalesce(ir.status, '') = 'matched' then 'You matched'
          when coalesce(ir.status, '') = 'accepted' then 'Door reopened'
          when ir.actor_id = v_recipient.profile_id then 'They reached out'
          else 'You reached out'
        end as cue,
        case
          when coalesce(ir.status, '') = 'matched' then 3
          when coalesce(ir.status, '') = 'accepted' then 2
          else 1
        end as priority,
        ir.created_at
      from public.intent_requests ir
      where ((ir.actor_id = v_owner_profile_id and ir.recipient_id = v_recipient.profile_id)
          or (ir.actor_id = v_recipient.profile_id and ir.recipient_id = v_owner_profile_id))
        and coalesce(ir.status, '') in ('pending', 'accepted', 'matched')
      order by priority desc, ir.created_at desc
      limit 1
    ) ranked_intent;

    if v_relationship_cue is null then
      select
        coalesce(bool_or(s.swiper_id = v_owner_profile_id and s.target_id = v_recipient.profile_id), false),
        coalesce(bool_or(s.swiper_id = v_recipient.profile_id and s.target_id = v_owner_profile_id), false)
      into v_swipe_you_liked, v_swipe_liked_you
      from public.swipes s
      where ((s.swiper_id = v_owner_profile_id and s.target_id = v_recipient.profile_id)
          or (s.swiper_id = v_recipient.profile_id and s.target_id = v_owner_profile_id))
        and s.action in ('LIKE', 'SUPERLIKE');

      v_relationship_cue := case
        when v_swipe_liked_you and v_swipe_you_liked then 'You liked each other'
        when v_swipe_liked_you then 'Liked you'
        when v_swipe_you_liked then 'You liked them'
        else null
      end;
    end if;

    if coalesce(v_recipient.preview_text, true) = false then
      v_body := case v_relationship_cue
        when 'You matched' then 'Your match shared a new Moment'
        when 'Door reopened' then 'A reopened connection shared a new Moment'
        when 'Liked you' then 'Someone who liked you shared a new Moment'
        when 'You liked each other' then 'Someone you both noticed shared a new Moment'
        when 'You liked them' then 'Someone on your radar shared a new Moment'
        when 'You reached out' then 'Someone you reached out to shared a new Moment'
        when 'They reached out' then 'Someone who reached out shared a new Moment'
        else 'Shared a new Moment'
      end;
    else
      v_default_body := case
        when new.type = 'text' and nullif(btrim(coalesce(new.text_body, '')), '') is not null then
          '"' || left(regexp_replace(new.text_body, '\s+', ' ', 'g'), 88) || '"'
        when nullif(btrim(coalesce(new.caption, '')), '') is not null then
          '"' || left(regexp_replace(new.caption, '\s+', ' ', 'g'), 88) || '"'
        when new.type = 'video' then 'a new video Moment'
        when new.type = 'photo' then 'a new photo Moment'
        else 'a new Moment'
      end;

      v_body := case v_relationship_cue
        when 'You matched' then 'Your match shared ' || v_default_body
        when 'Door reopened' then 'A reopened connection shared ' || v_default_body
        when 'Liked you' then 'Someone who liked you shared ' || v_default_body
        when 'You liked each other' then 'Someone you both noticed shared ' || v_default_body
        when 'You liked them' then 'Someone on your radar shared ' || v_default_body
        when 'You reached out' then 'Someone you reached out to shared ' || v_default_body
        when 'They reached out' then 'Someone who reached out shared ' || v_default_body
        else case
          when new.type = 'text' and nullif(btrim(coalesce(new.text_body, '')), '') is not null then
            'Shared a new thought: "' || left(regexp_replace(new.text_body, '\s+', ' ', 'g'), 88) || '"'
          when nullif(btrim(coalesce(new.caption, '')), '') is not null then
            'Shared a new Moment: "' || left(regexp_replace(new.caption, '\s+', ' ', 'g'), 88) || '"'
          when new.type = 'video' then 'Shared a new video Moment'
          when new.type = 'photo' then 'Shared a new photo Moment'
          else 'Shared a new Moment'
        end
      end;
    end if;

    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_recipient.user_id,
        'title', v_actor_name,
        'body', v_body,
        'data', jsonb_build_object(
          'type', 'moment_post',
          'moment_id', new.id,
          'profile_id', v_owner_profile_id,
          'user_id', new.user_id,
          'poster_user_id', new.user_id,
          'name', v_actor_name,
          'avatar_url', v_actor_avatar,
          'relationship_cue', v_relationship_cue,
          'start_user_id', new.user_id,
          'route', '/moments'
        )
      )
    );
  end loop;

  return new;
end;
$$;
