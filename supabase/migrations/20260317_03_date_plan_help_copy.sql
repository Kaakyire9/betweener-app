create or replace function public.rpc_accept_date_plan(
  p_plan_id uuid
)
returns table (
  plan_id uuid,
  status text,
  concierge_requested boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan public.date_plans%rowtype;
  v_parent_plan public.date_plans%rowtype;
  v_actor_profile public.profiles%rowtype;
  v_creator_name text;
  v_recipient_name text;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_plan
  from public.date_plans
  where id = p_plan_id
  limit 1;

  if v_plan.id is null then
    raise exception 'date_plan_not_found';
  end if;

  if v_plan.recipient_user_id <> auth.uid() then
    raise exception 'Only the other person can accept this date suggestion.';
  end if;

  if v_plan.status = 'accepted' then
    return query
    select v_plan.id, v_plan.status, v_plan.concierge_requested;
    return;
  end if;

  if v_plan.status <> 'pending' then
    raise exception 'This date suggestion can no longer be accepted.';
  end if;

  update public.date_plans
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_profile_id = v_actor_profile.id,
      declined_at = null,
      declined_by_profile_id = null,
      updated_at = now()
  where id = p_plan_id;

  if v_plan.parent_plan_id is not null then
    select *
    into v_parent_plan
    from public.date_plans
    where id = v_plan.parent_plan_id
    limit 1;

    if v_parent_plan.id is not null and v_parent_plan.status = 'accepted' then
      update public.date_plans
      set status = 'cancelled',
          accepted_at = null,
          accepted_by_profile_id = null,
          concierge_requested = false,
          concierge_requested_at = null,
          concierge_requested_by_profile_id = null,
          updated_at = now()
      where id = v_parent_plan.id;

      update public.date_plan_concierge_requests
      set status = 'cancelled',
          resolved_at = coalesce(resolved_at, now()),
          updated_at = now()
      where date_plan_id = v_parent_plan.id
        and public.date_plan_concierge_requests.status in ('pending', 'claimed');
    end if;
  end if;

  select full_name into v_creator_name from public.profiles where id = v_plan.creator_profile_id;
  select full_name into v_recipient_name from public.profiles where id = v_plan.recipient_profile_id;

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.creator_user_id,
    v_plan.recipient_user_id,
    'date_plan_accepted',
    coalesce(v_recipient_name, 'They') || ' accepted your date suggestion. Betweener can help with the plan.',
    jsonb_build_object('date_plan_id', p_plan_id, 'role', 'requester')
  );

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.recipient_user_id,
    v_plan.creator_user_id,
    'date_plan_accepted',
    'You accepted ' || coalesce(v_creator_name, 'their') || '''s date suggestion. Betweener can help if you want.',
    jsonb_build_object('date_plan_id', p_plan_id, 'role', 'accepter')
  );

  return query
  select p_plan_id, 'accepted', false;
end;
$$;

create or replace function public.rpc_request_date_plan_concierge(
  p_plan_id uuid,
  p_note text default null
)
returns table (
  request_id uuid,
  plan_id uuid,
  concierge_requested boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan public.date_plans%rowtype;
  v_actor_profile public.profiles%rowtype;
  v_request_id uuid;
  v_creator_name text;
  v_recipient_name text;
  v_first_request boolean := false;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_plan
  from public.date_plans
  where id = p_plan_id
  limit 1;

  if v_plan.id is null then
    raise exception 'date_plan_not_found';
  end if;

  if auth.uid() not in (v_plan.creator_user_id, v_plan.recipient_user_id) then
    raise exception 'Only participants can ask Betweener to help.';
  end if;

  if v_plan.status <> 'accepted' then
    raise exception 'Accept the date suggestion before asking Betweener to help.';
  end if;

  if not v_plan.concierge_requested then
    update public.date_plans
    set concierge_requested = true,
        concierge_requested_at = now(),
        concierge_requested_by_profile_id = v_actor_profile.id,
        updated_at = now()
    where id = p_plan_id;
    v_first_request := true;
  end if;

  insert into public.date_plan_concierge_requests (
    date_plan_id,
    requested_by_profile_id,
    requested_by_user_id,
    note
  )
  values (
    p_plan_id,
    v_actor_profile.id,
    auth.uid(),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (date_plan_id)
  do update set
    note = coalesce(excluded.note, public.date_plan_concierge_requests.note),
    updated_at = now()
  returning id into v_request_id;

  if v_first_request then
    select full_name into v_creator_name from public.profiles where id = v_plan.creator_profile_id;
    select full_name into v_recipient_name from public.profiles where id = v_plan.recipient_profile_id;

    insert into public.system_messages (
      user_id,
      peer_user_id,
      event_type,
      text,
      metadata
    )
    values (
      v_plan.creator_user_id,
      v_plan.recipient_user_id,
      'date_plan_concierge_requested',
      'Betweener is helping with your date plan with ' || coalesce(v_recipient_name, 'them') || '.',
      jsonb_build_object('date_plan_id', p_plan_id, 'role', case when auth.uid() = v_plan.creator_user_id then 'requester' else 'participant' end)
    );

    insert into public.system_messages (
      user_id,
      peer_user_id,
      event_type,
      text,
      metadata
    )
    values (
      v_plan.recipient_user_id,
      v_plan.creator_user_id,
      'date_plan_concierge_requested',
      'Betweener is helping with your date plan with ' || coalesce(v_creator_name, 'them') || '.',
      jsonb_build_object('date_plan_id', p_plan_id, 'role', case when auth.uid() = v_plan.recipient_user_id then 'requester' else 'participant' end)
    );
  end if;

  return query
  select v_request_id, p_plan_id, true;
end;
$$;

update public.system_messages
set text = replace(
  text,
  'Betweener can help lock in the details.',
  'Betweener can help with the plan.'
)
where event_type = 'date_plan_accepted'
  and text like '%Betweener can help lock in the details.%';

update public.system_messages
set text = replace(
  text,
  'Keep it warm or let Betweener help.',
  'Betweener can help if you want.'
)
where event_type = 'date_plan_accepted'
  and text like '%Keep it warm or let Betweener help.%';

update public.system_messages
set text = replace(
  text,
  'Betweener has been asked to help plan your date with ',
  'Betweener is helping with your date plan with '
)
where event_type = 'date_plan_concierge_requested'
  and text like 'Betweener has been asked to help plan your date with %';
