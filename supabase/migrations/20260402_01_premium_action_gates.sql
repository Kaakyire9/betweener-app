-- Gate launch-ready premium actions behind active subscriptions.
-- Silver: advanced Vibes filters (client), profile notes, standard gifts, date-plan initiation
-- Gold: signature gifts, concierge date help

drop policy if exists "Users can send notes" on public.profile_notes;
create policy "Users can send notes" on public.profile_notes
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.profiles recipient
    where recipient.id = profile_id
      and recipient.user_id <> auth.uid()
      and recipient.deleted_at is null
  )
  and public.get_active_subscription_plan(auth.uid()) in ('SILVER', 'GOLD')
);

drop policy if exists "Users can send gifts" on public.profile_gifts;
create policy "Users can send gifts" on public.profile_gifts
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.profiles recipient
    where recipient.id = profile_id
      and recipient.user_id <> auth.uid()
      and recipient.deleted_at is null
  )
  and (
    (gift_type in ('rose', 'teddy') and public.get_active_subscription_plan(auth.uid()) in ('SILVER', 'GOLD'))
    or (gift_type = 'ring' and public.get_active_subscription_plan(auth.uid()) = 'GOLD')
  )
);

create or replace function public.rpc_send_date_plan(
  p_recipient_profile_id uuid,
  p_scheduled_for timestamptz,
  p_place_name text,
  p_place_address text default null,
  p_place_source text default 'search',
  p_place_badges jsonb default '[]'::jsonb,
  p_place_summary text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_note text default null,
  p_venue_id uuid default null,
  p_parent_plan_id uuid default null,
  p_response_kind text default 'initial',
  p_reply_to_message_id uuid default null
)
returns table (
  plan_id uuid,
  message_id uuid
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_profile public.profiles%rowtype;
  v_recipient_profile public.profiles%rowtype;
  v_message_id uuid;
  v_plan_id uuid;
  v_place_badges jsonb := coalesce(p_place_badges, '[]'::jsonb);
  v_has_match boolean := false;
  v_has_accepted_connect boolean := false;
  v_has_active_chat boolean := false;
  v_has_guess_interest boolean := false;
  v_has_strong_signals boolean := false;
  v_message_stats record;
  v_message_text text;
  v_parent_plan public.date_plans%rowtype;
  v_target_profile public.profiles%rowtype;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  if p_parent_plan_id is null
     and public.get_active_subscription_plan(auth.uid()) not in ('SILVER', 'GOLD') then
    raise exception 'Silver or Gold is required to suggest a new date plan.';
  end if;

  select *
  into v_recipient_profile
  from public.profiles
  where id = p_recipient_profile_id
  limit 1;

  if v_recipient_profile.id is null then
    raise exception 'recipient_profile_not_found';
  end if;

  if v_recipient_profile.user_id = auth.uid() then
    raise exception 'cannot_plan_date_with_yourself';
  end if;

  if p_scheduled_for <= now() then
    raise exception 'Choose a future time for the suggestion.';
  end if;

  if btrim(coalesce(p_place_name, '')) = '' then
    raise exception 'Choose a place before sending the suggestion.';
  end if;

  if p_place_source not in ('betweener_pick', 'nearby', 'search', 'preferred') then
    raise exception 'invalid_place_source';
  end if;

  if p_response_kind not in ('initial', 'counter_time', 'counter_place', 'counter_both') then
    raise exception 'invalid_response_kind';
  end if;

  if jsonb_typeof(v_place_badges) <> 'array' then
    raise exception 'invalid_place_badges';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = v_recipient_profile.user_id)
       or (b.blocker_id = v_recipient_profile.user_id and b.blocked_id = auth.uid())
  ) then
    raise exception 'blocked';
  end if;

  if p_venue_id is not null and not exists (
    select 1
    from public.betweener_venues bv
    where bv.id = p_venue_id
      and bv.is_active = true
  ) then
    raise exception 'venue_not_available';
  end if;

  select exists (
    select 1
    from public.matches m
    where m.status in ('PENDING', 'ACCEPTED')
      and (
        (m.user1_id = v_actor_profile.id and m.user2_id = v_recipient_profile.id)
        or (m.user1_id = v_recipient_profile.id and m.user2_id = v_actor_profile.id)
      )
  )
  into v_has_match;

  select exists (
    select 1
    from public.intent_requests ir
    where ir.type = 'connect'
      and ir.status in ('accepted', 'matched')
      and (
        (ir.actor_id = v_actor_profile.id and ir.recipient_id = v_recipient_profile.id)
        or (ir.actor_id = v_recipient_profile.id and ir.recipient_id = v_actor_profile.id)
      )
  )
  into v_has_accepted_connect;

  select exists (
    select 1
    from public.intent_requests ir
    where ir.type = 'connect'
      and lower(coalesce(ir.metadata->>'source', '')) = 'guess_prompt'
      and (
        (ir.actor_id = v_actor_profile.id and ir.recipient_id = v_recipient_profile.id)
        or (ir.actor_id = v_recipient_profile.id and ir.recipient_id = v_actor_profile.id)
      )
  )
  into v_has_guess_interest;

  select
    count(*) as total_count,
    count(*) filter (where sender_id = auth.uid()) as actor_count,
    count(*) filter (where sender_id = v_recipient_profile.user_id) as recipient_count
  into v_message_stats
  from public.messages m
  where (
    (m.sender_id = auth.uid() and m.receiver_id = v_recipient_profile.user_id)
    or (m.sender_id = v_recipient_profile.user_id and m.receiver_id = auth.uid())
  );

  v_has_active_chat := coalesce(v_message_stats.total_count, 0) > 0;
  v_has_strong_signals :=
    coalesce(v_message_stats.total_count, 0) >= 6
    and coalesce(v_message_stats.actor_count, 0) >= 2
    and coalesce(v_message_stats.recipient_count, 0) >= 2;

  if not (v_has_match or v_has_accepted_connect or v_has_active_chat or v_has_guess_interest or v_has_strong_signals) then
    raise exception 'Keep warming the connection first, then plan the date from chat.';
  end if;

  if p_parent_plan_id is not null then
    select *
    into v_parent_plan
    from public.date_plans
    where id = p_parent_plan_id
    limit 1;

    if v_parent_plan.id is null then
      raise exception 'date_plan_not_found';
    end if;

    if auth.uid() not in (v_parent_plan.creator_user_id, v_parent_plan.recipient_user_id) then
      raise exception 'Only participants can respond to this suggestion.';
    end if;

    if v_parent_plan.status not in ('pending', 'accepted') then
      raise exception 'This date suggestion can no longer be updated.';
    end if;

    if p_response_kind = 'initial' then
      raise exception 'counter_suggestion_requires_response_kind';
    end if;

    if auth.uid() = v_parent_plan.creator_user_id then
      select * into v_target_profile from public.profiles where id = v_parent_plan.recipient_profile_id limit 1;
    else
      select * into v_target_profile from public.profiles where id = v_parent_plan.creator_profile_id limit 1;
    end if;

    if v_target_profile.id is null then
      raise exception 'recipient_profile_not_found';
    end if;

    v_recipient_profile := v_target_profile;

  end if;

  if exists (
    select 1
    from public.date_plans dp
    where dp.status = 'pending'
      and (p_parent_plan_id is null or dp.id <> p_parent_plan_id)
      and (
        (dp.creator_profile_id = v_actor_profile.id and dp.recipient_profile_id = v_recipient_profile.id)
        or (dp.creator_profile_id = v_recipient_profile.id and dp.recipient_profile_id = v_actor_profile.id)
      )
  ) then
    raise exception 'There is already a date suggestion waiting for a response.';
  end if;

  if v_parent_plan.id is not null and v_parent_plan.status = 'pending' then
    update public.date_plans
    set status = 'countered',
        updated_at = now()
    where id = v_parent_plan.id;
  end if;

  insert into public.date_plans (
    creator_profile_id,
    creator_user_id,
    recipient_profile_id,
    recipient_user_id,
    parent_plan_id,
    venue_id,
    scheduled_for,
    place_name,
    place_address,
    place_source,
    place_badges,
    place_summary,
    city,
    lat,
    lng,
    note,
    response_kind
  )
  values (
    v_actor_profile.id,
    auth.uid(),
    v_recipient_profile.id,
    v_recipient_profile.user_id,
    p_parent_plan_id,
    p_venue_id,
    p_scheduled_for,
    btrim(p_place_name),
    nullif(btrim(coalesce(p_place_address, '')), ''),
    p_place_source,
    v_place_badges,
    nullif(btrim(coalesce(p_place_summary, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    p_lat,
    p_lng,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_response_kind
  )
  returning id into v_plan_id;

  v_message_text := 'date_plan::' || jsonb_build_object(
    'planId', v_plan_id,
    'parentPlanId', p_parent_plan_id,
    'venueId', p_venue_id,
    'scheduledFor', p_scheduled_for,
    'placeName', btrim(p_place_name),
    'placeAddress', nullif(btrim(coalesce(p_place_address, '')), ''),
    'source', p_place_source,
    'badges', v_place_badges,
    'summary', nullif(btrim(coalesce(p_place_summary, '')), ''),
    'city', nullif(btrim(coalesce(p_city, '')), ''),
    'lat', p_lat,
    'lng', p_lng,
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'responseKind', p_response_kind,
    'status', 'pending',
    'conciergeRequested', false
  )::text;

  insert into public.messages (
    text,
    sender_id,
    receiver_id,
    is_read,
    message_type,
    reply_to_message_id
  )
  values (
    v_message_text,
    auth.uid(),
    v_recipient_profile.user_id,
    false,
    'text',
    p_reply_to_message_id
  )
  returning id into v_message_id;

  update public.date_plans
  set message_id = v_message_id
  where id = v_plan_id;

  return query
  select v_plan_id, v_message_id;
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

  if public.get_active_subscription_plan(auth.uid()) <> 'GOLD' then
    raise exception 'Gold is required to ask Betweener to help with a date plan.';
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
