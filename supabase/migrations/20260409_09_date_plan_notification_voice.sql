-- Make date-plan system notifications feel first-class.
-- Date plans already emit system_messages; this override gives those events richer push copy,
-- skips self-generated concierge/cancel noise, and carries date_plan_id through the payload.

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

  if new.event_type = 'request_accepted' then
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
        'date_plan_id', v_date_plan_id
      )
    )
  );

  return new;
end;
$$;
