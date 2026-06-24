-- Add a dedicated profile-interest notification preference and wire it into delivery gates.

alter table public.notification_prefs
  add column if not exists profile_interest boolean not null default true;

create or replace function public.rpc_log_vibes_event(
  p_viewer_profile_id uuid,
  p_target_profile_id uuid,
  p_segment text default 'for_you',
  p_event_type text default 'card_seen',
  p_position integer default null,
  p_dwell_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_viewer_user_id uuid;
  v_target_user_id uuid;
  v_viewer_name text;
  v_viewer_avatar text;
  v_target_plan text;
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_event_type text := coalesce(nullif(btrim(p_event_type), ''), 'card_seen');
  v_throttle interval;
  v_notification_body text;
  v_notification_title text;
  v_notification_actor_id uuid;
  v_notification_metadata jsonb;
  v_push_title text;
  v_push_body text;
  v_push_payload jsonb;
  v_has_inbox_items boolean := to_regclass('public.inbox_items') is not null;
  v_notification_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    raise exception 'invalid_vibes_segment';
  end if;

  if v_event_type not in (
    'card_seen', 'profile_opened', 'full_profile_opened', 'intro_played',
    'intro_completed', 'profile_saved', 'profile_unsaved', 'pass', 'like',
    'signal_opened', 'signal_sent', 'intent_opened', 'intent_sent', 'undo'
  ) then
    raise exception 'invalid_vibes_event_type';
  end if;

  if p_viewer_profile_id is null
    or p_target_profile_id is null
    or p_viewer_profile_id = p_target_profile_id then
    return false;
  end if;

  select profile.user_id, profile.full_name, profile.avatar_url
    into v_viewer_user_id, v_viewer_name, v_viewer_avatar
  from public.profiles profile
  where profile.id = p_viewer_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_viewer_user_id is null or v_viewer_user_id <> auth.uid() then
    raise exception 'viewer profile does not belong to authenticated user' using errcode = '42501';
  end if;

  select profile.user_id
    into v_target_user_id
  from public.profiles profile
  where profile.id = p_target_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_target_user_id is null then
    return false;
  end if;

  v_target_plan := public.get_active_subscription_plan(v_target_user_id)::text;

  if exists (
    select 1
    from public.blocks block_row
    where (block_row.blocker_id = v_viewer_user_id and block_row.blocked_id = v_target_user_id)
       or (block_row.blocker_id = v_target_user_id and block_row.blocked_id = v_viewer_user_id)
  ) then
    return false;
  end if;

  v_throttle := case
    when v_event_type = 'card_seen' then interval '6 hours'
    when v_event_type in ('profile_opened', 'full_profile_opened') then interval '30 minutes'
    when v_event_type in ('intro_played', 'intro_completed', 'intent_opened') then interval '6 hours'
    when v_event_type in ('profile_saved', 'profile_unsaved') then null
    else interval '2 minutes'
  end;

  if v_throttle is not null and exists (
    select 1
    from public.vibes_events event_row
    where event_row.viewer_profile_id = p_viewer_profile_id
      and event_row.target_profile_id = p_target_profile_id
      and event_row.event_type = v_event_type
      and event_row.segment = v_segment
      and event_row.created_at > timezone('utc'::text, now()) - v_throttle
  ) then
    return false;
  end if;

  insert into public.vibes_events (
    viewer_user_id,
    viewer_profile_id,
    target_profile_id,
    target_user_id,
    segment,
    event_type,
    position,
    dwell_ms,
    metadata
  )
  values (
    v_viewer_user_id,
    p_viewer_profile_id,
    p_target_profile_id,
    v_target_user_id,
    v_segment,
    v_event_type,
    p_position,
    greatest(coalesce(p_dwell_ms, 0), 0),
    coalesce(p_metadata, '{}'::jsonb)
  );

  v_notification_body := case
    when v_event_type = 'profile_saved' then 'Saved your profile'
    when v_event_type in ('intro_played', 'intro_completed') then 'Watched your intro video'
    when v_event_type = 'intent_opened' then 'Spent time with your Intent'
    when v_event_type in ('profile_opened', 'full_profile_opened')
      and exists (
        select 1
        from public.vibes_events previous_event
        where previous_event.viewer_profile_id = p_viewer_profile_id
          and previous_event.target_profile_id = p_target_profile_id
          and previous_event.event_type in ('profile_opened', 'full_profile_opened')
          and previous_event.created_at < timezone('utc'::text, now()) - interval '30 minutes'
          and previous_event.created_at > timezone('utc'::text, now()) - interval '30 days'
      )
      then 'Revisited your profile'
    else null
  end;

  if v_has_inbox_items and v_notification_body is not null then
    execute
      'select not exists (
         select 1
         from public.inbox_items inbox
         where inbox.user_id = $1
           and inbox.entity_type = ''profile_interest''
           and inbox.created_at > timezone(''utc''::text, now()) - interval ''24 hours''
       )
       and not exists (
         select 1
         from public.notification_prefs prefs
         where prefs.user_id = $1
           and (prefs.inapp_enabled = false or prefs.profile_interest = false)
       )'
      into v_notification_allowed
      using v_target_user_id;

    if v_notification_allowed then
      v_notification_actor_id := case
        when v_target_plan in ('SILVER', 'GOLD') then p_viewer_profile_id
        else null
      end;

      v_notification_title := case
        when v_target_plan in ('SILVER', 'GOLD')
          then coalesce(nullif(btrim(v_viewer_name), ''), 'Someone')
        else 'Profile Interest'
      end;

      v_notification_metadata := jsonb_strip_nulls(jsonb_build_object(
        'type', 'profile_interest',
        'signal', v_event_type,
        'profile_id', case when v_target_plan in ('SILVER', 'GOLD') then p_viewer_profile_id end,
        'name', case when v_target_plan in ('SILVER', 'GOLD') then v_viewer_name end,
        'avatar_url', case when v_target_plan in ('SILVER', 'GOLD') then v_viewer_avatar end,
        'route', '/profile-interest'
      ));

      execute
        'insert into public.inbox_items (
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
         values ($1, ''SYSTEM'', $2, $3, ''profile_interest'', $4, $5, false, $6)'
        using
          v_target_user_id,
          v_notification_actor_id,
          p_target_profile_id,
          v_notification_title,
          v_notification_body,
          v_notification_metadata;
    end if;
  end if;

  if v_notification_body is not null
     and not exists (
       select 1
       from public.notification_prefs prefs
       where prefs.user_id = v_target_user_id
         and (prefs.push_enabled = false or prefs.profile_interest = false)
     )
     and not public.is_quiet_hours(v_target_user_id)
  then
    v_push_title := case
      when v_target_plan in ('SILVER', 'GOLD')
        then coalesce(nullif(btrim(v_viewer_name), ''), 'Someone')
      else 'Profile Interest'
    end;

    v_push_body := case
      when v_target_plan in ('SILVER', 'GOLD')
        then coalesce(nullif(btrim(v_viewer_name), ''), 'Someone') || ' ' || lower(v_notification_body)
      else 'Someone ' || lower(v_notification_body)
    end;

    v_push_payload := jsonb_strip_nulls(jsonb_build_object(
      'type', 'profile_interest',
      'signal', v_event_type,
      'route', '/profile-interest',
      'profile_id', case when v_target_plan in ('SILVER', 'GOLD') then p_viewer_profile_id end,
      'name', case when v_target_plan in ('SILVER', 'GOLD') then v_viewer_name end,
      'avatar_url', case when v_target_plan in ('SILVER', 'GOLD') then v_viewer_avatar end
    ));

    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_target_user_id,
        'title', v_push_title,
        'body', v_push_body,
        'data', v_push_payload
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.rpc_log_vibes_event(uuid, uuid, text, text, integer, integer, jsonb) from public;
grant execute on function public.rpc_log_vibes_event(uuid, uuid, text, text, integer, integer, jsonb) to authenticated;
