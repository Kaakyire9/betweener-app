create or replace function public.can_view_moment(p_moment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  viewer uuid := auth.uid();
begin
  if viewer is null then
    return false;
  end if;

  select user_id, type, media_url, visibility, expires_at, is_deleted
  into m
  from public.moments
  where id = p_moment_id;

  if not found then
    return false;
  end if;

  if m.is_deleted or m.expires_at <= now() then
    return false;
  end if;

  if m.type in ('photo', 'video')
     and nullif(btrim(coalesce(m.media_url, '')), '') is null then
    return false;
  end if;

  if m.user_id = viewer then
    return true;
  end if;

  if m.visibility = 'public' then
    return true;
  end if;

  if m.visibility = 'matches' then
    return public.is_match(viewer, m.user_id);
  end if;

  if m.visibility = 'vibe_check_approved' then
    return false;
  end if;

  return false;
end;
$$;

drop policy if exists "Moments select visible" on public.moments;
create policy "Moments select visible" on public.moments
for select using (
  is_deleted = false
  and expires_at > now()
  and (
    type = 'text'
    or nullif(btrim(coalesce(media_url, '')), '') is not null
  )
  and (
    user_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'matches' and public.is_match(auth.uid(), user_id))
  )
);

create or replace function public.rpc_create_media_moment(
  p_moment_id uuid,
  p_type text,
  p_media_url text,
  p_caption text default null,
  p_visibility text default 'matches',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text := lower(coalesce(trim(p_type), ''));
  v_media_url text := nullif(btrim(coalesce(p_media_url, '')), '');
  v_visibility text := lower(coalesce(trim(p_visibility), 'matches'));
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_moment_id uuid := coalesce(p_moment_id, gen_random_uuid());
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.can_post_moment(v_user_id) then
    raise exception 'moment_signal_required' using errcode = '42501';
  end if;

  if v_type not in ('video', 'photo') then
    raise exception 'invalid_moment_type';
  end if;

  if v_media_url is null then
    raise exception 'invalid_media_url';
  end if;

  if v_visibility not in ('public', 'matches', 'vibe_check_approved', 'private') then
    raise exception 'invalid_moment_visibility';
  end if;

  insert into public.moments (
    id,
    user_id,
    type,
    media_url,
    caption,
    visibility,
    metadata
  )
  values (
    v_moment_id,
    v_user_id,
    v_type,
    v_media_url,
    v_caption,
    v_visibility,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_moment_id;
end;
$$;

revoke all on function public.rpc_create_media_moment(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.rpc_create_media_moment(uuid, text, text, text, text, jsonb) to authenticated;

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
  v_has_recent_other_moment boolean;
begin
  if new.user_id is null
     or coalesce(new.is_deleted, false)
     or new.expires_at <= timezone('utc'::text, now())
     or (
       new.type in ('photo', 'video')
       and nullif(btrim(coalesce(new.media_url, '')), '') is null
     ) then
    return new;
  end if;

  select exists (
    select 1
    from public.moments m
    where m.user_id = new.user_id
      and m.id <> new.id
      and coalesce(m.is_deleted, false) = false
      and m.created_at >= timezone('utc'::text, now()) - interval '30 minutes'
  )
    into v_has_recent_other_moment;

  if coalesce(v_has_recent_other_moment, false) then
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
