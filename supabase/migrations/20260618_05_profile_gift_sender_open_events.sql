-- Allow sender-side recipient profile open analytics for sent gifts.

alter table public.profile_gift_events
  drop constraint if exists profile_gift_events_event_type_check;

alter table public.profile_gift_events
  add constraint profile_gift_events_event_type_check
  check (
    event_type in (
      'sent',
      'revealed',
      'archived',
      'sender_profile_opened',
      'recipient_profile_opened'
    )
  );

create or replace function public.rpc_log_profile_gift_event(
  p_gift_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gift public.profile_gifts%rowtype;
  v_actor_profile_id uuid;
  v_actor_profile_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(nullif(btrim(p_event_type), ''), '') not in ('sent', 'revealed', 'archived', 'sender_profile_opened', 'recipient_profile_opened') then
    raise exception 'invalid_profile_gift_event_type' using errcode = '22023';
  end if;

  select g.*
    into v_gift
  from public.profile_gifts g
  where g.id = p_gift_id
  limit 1;

  if v_gift.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  select p.id, p.user_id
    into v_actor_profile_id, v_actor_profile_user_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if p_event_type in ('sent', 'recipient_profile_opened') and v_gift.sender_id <> auth.uid() then
    raise exception 'gift sender required' using errcode = '42501';
  end if;

  if p_event_type in ('revealed', 'archived', 'sender_profile_opened') and not exists (
    select 1
    from public.profiles recipient
    where recipient.id = v_gift.profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  ) then
    raise exception 'gift recipient required' using errcode = '42501';
  end if;

  insert into public.profile_gift_events (
    gift_id,
    actor_user_id,
    actor_profile_id,
    recipient_profile_id,
    sender_profile_id,
    event_type,
    metadata
  )
  values (
    v_gift.id,
    auth.uid(),
    v_actor_profile_id,
    v_gift.profile_id,
    v_gift.sender_profile_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke all on function public.rpc_log_profile_gift_event(uuid, text, jsonb) from public;
grant execute on function public.rpc_log_profile_gift_event(uuid, text, jsonb) to authenticated;
