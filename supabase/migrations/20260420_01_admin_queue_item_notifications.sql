-- Notify internal admins when new operational queue items arrive.
-- These alerts reuse system_messages so they share the existing in-app and push pipeline.

create or replace function public.notify_internal_admin_queue_item(
  p_queue_type text,
  p_record_id uuid,
  p_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  v_metadata jsonb;
begin
  if p_record_id is null then
    return;
  end if;

  v_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'source', 'admin_queue_trigger',
      'queue_type', p_queue_type,
      'record_id', p_record_id
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  for admin_row in
    select ia.user_id, ia.role
    from public.internal_admins ia
  loop
    insert into public.system_messages (
      user_id,
      peer_user_id,
      event_type,
      text,
      metadata
    )
    values (
      admin_row.user_id,
      admin_row.user_id,
      'admin_queue_item',
      p_text,
      v_metadata || jsonb_build_object('admin_role', admin_row.role)
    );
  end loop;
end;
$$;

create or replace function public.notify_admins_on_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(coalesce(new.status, 'PENDING')) not in ('PENDING', 'REVIEWING') then
    return new;
  end if;

  perform public.notify_internal_admin_queue_item(
    'reports',
    new.id,
    'New safety report needs review.',
    jsonb_build_object(
      'report_id', new.id,
      'reporter_id', new.reporter_id,
      'reported_id', new.reported_id
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_admins_on_report_insert on public.reports;
create trigger notify_admins_on_report_insert
after insert on public.reports
for each row
execute function public.notify_admins_on_report_insert();

create or replace function public.notify_admins_on_verification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.status, 'pending')) <> 'pending' then
    return new;
  end if;

  perform public.notify_internal_admin_queue_item(
    'verification',
    new.id,
    'New verification request needs review.',
    jsonb_build_object(
      'verification_request_id', new.id,
      'verification_type', new.verification_type,
      'profile_id', new.profile_id,
      'requester_user_id', new.user_id
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_admins_on_verification_insert on public.verification_requests;
create trigger notify_admins_on_verification_insert
after insert on public.verification_requests
for each row
execute function public.notify_admins_on_verification_insert();

create or replace function public.notify_admins_on_account_recovery_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.status, 'pending')) <> 'pending' then
    return new;
  end if;

  perform public.notify_internal_admin_queue_item(
    'account_recovery',
    new.id,
    'New account recovery request needs review.',
    jsonb_build_object(
      'recovery_request_id', new.id,
      'requester_user_id', new.requester_user_id,
      'requester_profile_id', new.requester_profile_id
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_admins_on_account_recovery_insert on public.account_recovery_requests;
create trigger notify_admins_on_account_recovery_insert
after insert on public.account_recovery_requests
for each row
execute function public.notify_admins_on_account_recovery_insert();

create or replace function public.notify_admins_on_date_concierge_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.status, 'pending')) <> 'pending' then
    return new;
  end if;

  perform public.notify_internal_admin_queue_item(
    'date_concierge',
    new.id,
    'New date concierge request needs review.',
    jsonb_build_object(
      'concierge_request_id', new.id,
      'date_plan_id', new.date_plan_id,
      'requested_by_user_id', new.requested_by_user_id,
      'requested_by_profile_id', new.requested_by_profile_id
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_admins_on_date_concierge_insert on public.date_plan_concierge_requests;
create trigger notify_admins_on_date_concierge_insert
after insert on public.date_plan_concierge_requests
for each row
execute function public.notify_admins_on_date_concierge_insert();

create or replace function public.notify_system_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  peer_name text;
  peer_avatar text;
  peer_profile_id uuid;
  title_text text;
  body_text text;
  v_role text;
  v_date_plan_id text;
  v_text text;
begin
  v_role := coalesce(new.metadata->>'role', '');
  v_date_plan_id := nullif(btrim(coalesce(new.metadata->>'date_plan_id', '')), '');
  v_text := coalesce(nullif(btrim(new.text), ''), '');

  if v_role = 'accepter' then
    return new;
  end if;

  if new.event_type = 'date_plan_concierge_requested' and v_role = 'requester' then
    return new;
  end if;

  if new.event_type = 'date_plan_cancelled' and lower(v_text) like 'you %' then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = new.user_id
      and p.push_enabled = false
  ) then
    return new;
  end if;

  if public.is_quiet_hours(new.user_id) then
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'They'), p.avatar_url, p.id
  into peer_name, peer_avatar, peer_profile_id
  from public.profiles p
  where p.user_id = new.peer_user_id
  limit 1;

  if new.event_type = 'admin_queue_item' then
    title_text := 'Admin queue';
    body_text := coalesce(nullif(v_text, ''), 'A new admin item needs review.');
  elsif new.event_type = 'request_accepted' then
    title_text := peer_name;
    body_text := 'Reopened the door. Start with something warm and specific.';
  elsif new.event_type = 'request_expired' then
    title_text := 'A window closed';
    body_text := coalesce(nullif(v_text, ''), 'That opening closed. If it still feels right, come back warmer and more specific.');
  elsif new.event_type = 'date_plan_accepted' then
    title_text := peer_name;
    body_text := 'Said yes to the date plan. Keep the energy warm and specific.';
  elsif new.event_type = 'date_plan_declined' then
    title_text := peer_name;
    body_text := 'Passed on the date plan for now.';
  elsif new.event_type = 'date_plan_cancelled' then
    title_text := peer_name;
    body_text := 'Closed the date plan for now.';
  elsif new.event_type = 'date_plan_concierge_requested' then
    title_text := peer_name;
    body_text := 'Asked Betweener to help shape the details.';
  else
    title_text := 'Betweener';
    body_text := coalesce(nullif(v_text, ''), 'There is something worth checking.');
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', new.user_id,
      'title', title_text,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'system_message',
        'event_type', new.event_type,
        'system_message_id', new.id,
        'peer_user_id', new.peer_user_id,
        'profile_id', peer_profile_id,
        'name', peer_name,
        'avatar_url', peer_avatar,
        'intent_request_id', new.intent_request_id,
        'date_plan_id', v_date_plan_id,
        'queue_type', new.metadata->>'queue_type',
        'record_id', new.metadata->>'record_id'
      )
    )
  );

  return new;
end;
$$;
