create table if not exists public.intent_reflections (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  intent_request_id uuid not null references public.intent_requests(id) on delete cascade,
  source text not null default 'expired_request',
  selected_reasons text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint intent_reflections_owner_target_distinct
    check (owner_profile_id <> target_profile_id),
  constraint intent_reflections_source_valid
    check (source in ('expired_request', 'passed_profile')),
  constraint intent_reflections_reason_count_valid
    check (cardinality(selected_reasons) <= 2),
  constraint intent_reflections_reasons_valid
    check (
      selected_reasons <@ array[
        'shared_values',
        'relationship_intent',
        'personality',
        'faith_family',
        'interests_lifestyle',
        'culture_location'
      ]::text[]
    ),
  constraint intent_reflections_request_owner_unique
    unique (intent_request_id, owner_profile_id)
);

create index if not exists intent_reflections_owner_created_idx
  on public.intent_reflections (owner_profile_id, created_at desc);

alter table public.intent_reflections enable row level security;
revoke all on public.intent_reflections from anon, authenticated;

create or replace function public.rpc_get_intent_reflection(
  p_intent_request_id uuid
)
returns text[]
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_owner_profile_id uuid;
  v_selected_reasons text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.id
    into v_owner_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_owner_profile_id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.intent_requests request_row
    where request_row.id = p_intent_request_id
      and (
        request_row.actor_id = v_owner_profile_id
        or request_row.recipient_id = v_owner_profile_id
      )
  ) then
    raise exception 'intent request not found' using errcode = '42501';
  end if;

  select reflection.selected_reasons
    into v_selected_reasons
  from public.intent_reflections reflection
  where reflection.intent_request_id = p_intent_request_id
    and reflection.owner_profile_id = v_owner_profile_id;

  return coalesce(v_selected_reasons, '{}'::text[]);
end;
$$;

create or replace function public.rpc_save_intent_reflection(
  p_intent_request_id uuid,
  p_target_profile_id uuid,
  p_source text,
  p_selected_reasons text[]
)
returns text[]
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner_profile_id uuid;
  v_request public.intent_requests%rowtype;
  v_source text := lower(nullif(btrim(coalesce(p_source, '')), ''));
  v_selected_reasons text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.id
    into v_owner_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_owner_profile_id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  select request_row.*
    into v_request
  from public.intent_requests request_row
  where request_row.id = p_intent_request_id
    and (
      request_row.actor_id = v_owner_profile_id
      or request_row.recipient_id = v_owner_profile_id
    )
  limit 1;

  if v_request.id is null then
    raise exception 'intent request not found' using errcode = '42501';
  end if;

  if p_target_profile_id is null
    or p_target_profile_id = v_owner_profile_id
    or p_target_profile_id not in (v_request.actor_id, v_request.recipient_id) then
    raise exception 'invalid target profile' using errcode = '42501';
  end if;

  if not (
    v_request.status in ('expired', 'passed', 'cancelled')
    or (
      v_request.status = 'pending'
      and v_request.expires_at <= timezone('utc'::text, now())
    )
  ) then
    raise exception 'intent request is not closed';
  end if;

  if v_source not in ('expired_request', 'passed_profile') then
    raise exception 'invalid reflection source';
  end if;

  select coalesce(array_agg(reason order by first_position), '{}'::text[])
    into v_selected_reasons
  from (
    select
      reason,
      min(position) as first_position
    from unnest(coalesce(p_selected_reasons, '{}'::text[])) with ordinality as selected(reason, position)
    where reason in (
      'shared_values',
      'relationship_intent',
      'personality',
      'faith_family',
      'interests_lifestyle',
      'culture_location'
    )
    group by reason
    order by min(position)
    limit 2
  ) normalized;

  insert into public.intent_reflections (
    owner_profile_id,
    target_profile_id,
    intent_request_id,
    source,
    selected_reasons,
    updated_at
  )
  values (
    v_owner_profile_id,
    p_target_profile_id,
    p_intent_request_id,
    v_source,
    coalesce(v_selected_reasons, '{}'::text[]),
    timezone('utc'::text, now())
  )
  on conflict (intent_request_id, owner_profile_id) do update
  set target_profile_id = excluded.target_profile_id,
      source = excluded.source,
      selected_reasons = excluded.selected_reasons,
      updated_at = excluded.updated_at;

  return coalesce(v_selected_reasons, '{}'::text[]);
end;
$$;

revoke all on function public.rpc_get_intent_reflection(uuid) from public;
revoke all on function public.rpc_save_intent_reflection(uuid, uuid, text, text[]) from public;

grant execute on function public.rpc_get_intent_reflection(uuid) to authenticated;
grant execute on function public.rpc_save_intent_reflection(uuid, uuid, text, text[]) to authenticated;
