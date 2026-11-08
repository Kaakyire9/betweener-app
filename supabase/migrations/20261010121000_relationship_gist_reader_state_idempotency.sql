-- Durable, account-scoped and version-aware Relationship Gist reader state.
-- The v1 RPC remains available with its original signature.

begin;

alter table public.relationship_gist_user_states
  add column if not exists saved_version bigint not null default 0,
  add column if not exists last_anchor text,
  add column if not exists last_anchor_offset double precision,
  add column if not exists scroll_completed_at timestamptz,
  add column if not exists read_acknowledged_at timestamptz,
  add column if not exists reading_duration_ms bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'relationship_gist_user_states_saved_version_valid'
      and conrelid = 'public.relationship_gist_user_states'::regclass
  ) then
    alter table public.relationship_gist_user_states
      add constraint relationship_gist_user_states_saved_version_valid
      check (saved_version >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'relationship_gist_user_states_anchor_valid'
      and conrelid = 'public.relationship_gist_user_states'::regclass
  ) then
    alter table public.relationship_gist_user_states
      add constraint relationship_gist_user_states_anchor_valid
      check (
        (last_anchor is null or char_length(last_anchor) between 1 and 160)
        and (last_anchor_offset is null or last_anchor_offset between 0 and 100000)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'relationship_gist_user_states_reading_duration_valid'
      and conrelid = 'public.relationship_gist_user_states'::regclass
  ) then
    alter table public.relationship_gist_user_states
      add constraint relationship_gist_user_states_reading_duration_valid
      check (reading_duration_ms >= 0);
  end if;
end;
$$;

create table if not exists public.relationship_gist_state_mutation_receipts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  gist_id uuid not null references public.relationship_gists(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (profile_id, operation_id)
);

create index if not exists relationship_gist_state_mutation_receipts_created_at_idx
  on public.relationship_gist_state_mutation_receipts (created_at);

alter table public.relationship_gist_state_mutation_receipts enable row level security;
revoke all on table public.relationship_gist_state_mutation_receipts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.relationship_gist_state_mutation_receipts
  to service_role;

create or replace function public.rpc_apply_relationship_gist_state_mutation_v2(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_gist_id uuid,
  p_saved boolean default null,
  p_expected_saved_version bigint default null,
  p_progress double precision default null,
  p_last_read_at timestamptz default null,
  p_mark_opened boolean default false,
  p_last_perspective text default null,
  p_last_anchor text default null,
  p_last_anchor_offset double precision default null,
  p_scroll_completed boolean default false,
  p_read_acknowledged boolean default false,
  p_reading_duration_delta_ms bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_now timestamptz := timezone('utc'::text, now());
  v_state public.relationship_gist_user_states%rowtype;
  v_result jsonb;
  v_perspective text := lower(nullif(btrim(coalesce(p_last_perspective, '')), ''));
  v_anchor text := nullif(btrim(coalesce(p_last_anchor, '')), '');
  v_saved_outcome text := 'not_requested';
  v_next_progress double precision;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_owner_user_id is null or p_owner_user_id <> v_user_id then
    raise exception 'gist_owner_mismatch' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'gist_operation_id_required' using errcode = '22023';
  end if;

  select profile.id
  into v_profile_id
  from public.profiles profile
  where profile.user_id = v_user_id
    and profile.deleted_at is null
  order by profile.created_at
  limit 1;

  if v_profile_id is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_profile_id::text || ':relationship_gist_state:' || p_operation_id::text, 0)
  );

  select receipt.result
  into v_result
  from public.relationship_gist_state_mutation_receipts receipt
  where receipt.profile_id = v_profile_id
    and receipt.operation_id = p_operation_id;

  if v_result is not null then
    return v_result || jsonb_build_object('delivery', 'duplicate');
  end if;

  if p_progress is not null and (p_progress < 0 or p_progress > 1) then
    raise exception 'gist_progress_invalid' using errcode = '22023';
  end if;
  if p_saved is not null and (p_expected_saved_version is null or p_expected_saved_version < 0) then
    raise exception 'gist_saved_version_required' using errcode = '22023';
  end if;
  if v_perspective is not null
    and v_perspective not in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication') then
    raise exception 'gist_perspective_invalid' using errcode = '22023';
  end if;
  if v_anchor is not null and char_length(v_anchor) > 160 then
    raise exception 'gist_anchor_invalid' using errcode = '22023';
  end if;
  if p_last_anchor_offset is not null
    and (p_last_anchor_offset < 0 or p_last_anchor_offset > 100000) then
    raise exception 'gist_anchor_offset_invalid' using errcode = '22023';
  end if;
  if p_reading_duration_delta_ms is not null
    and (p_reading_duration_delta_ms < 0 or p_reading_duration_delta_ms > 900000) then
    raise exception 'gist_reading_duration_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.relationship_gists gist
    where gist.id = p_gist_id
      and gist.circle_id is null
      and gist.status = 'published'
      and (gist.scheduled_for is null or gist.scheduled_for <= v_now)
  ) then
    raise exception 'gist_not_available';
  end if;

  insert into public.relationship_gist_user_states (profile_id, gist_id)
  values (v_profile_id, p_gist_id)
  on conflict (profile_id, gist_id) do nothing;

  select *
  into v_state
  from public.relationship_gist_user_states state
  where state.profile_id = v_profile_id
    and state.gist_id = p_gist_id
  for update;

  if p_saved is not null then
    if p_expected_saved_version = v_state.saved_version then
      if p_saved is distinct from v_state.saved then
        v_state.saved := p_saved;
        v_state.saved_version := v_state.saved_version + 1;
        v_saved_outcome := 'applied';
      else
        v_saved_outcome := 'converged';
      end if;
    elsif p_saved is not distinct from v_state.saved then
      v_saved_outcome := 'converged';
    else
      v_saved_outcome := 'conflict';
    end if;
  end if;

  v_next_progress := greatest(
    v_state.progress,
    coalesce(p_progress, v_state.progress),
    case when p_scroll_completed or p_read_acknowledged then 1 else 0 end
  );

  update public.relationship_gist_user_states
  set saved = v_state.saved,
      saved_version = v_state.saved_version,
      progress = v_next_progress,
      last_read_at = case
        when p_last_read_at is null then last_read_at
        when last_read_at is null then p_last_read_at
        else greatest(last_read_at, p_last_read_at)
      end,
      last_opened_at = case when p_mark_opened then v_now else last_opened_at end,
      last_perspective = coalesce(v_perspective, last_perspective),
      last_anchor = case
        when v_anchor is not null and coalesce(p_progress, 0) >= progress then v_anchor
        else last_anchor
      end,
      last_anchor_offset = case
        when v_anchor is not null and coalesce(p_progress, 0) >= progress
          then coalesce(p_last_anchor_offset, 0)
        else last_anchor_offset
      end,
      scroll_completed_at = case
        when p_scroll_completed then coalesce(scroll_completed_at, v_now)
        else scroll_completed_at
      end,
      read_acknowledged_at = case
        when p_read_acknowledged then coalesce(read_acknowledged_at, v_now)
        else read_acknowledged_at
      end,
      reading_duration_ms = reading_duration_ms + coalesce(p_reading_duration_delta_ms, 0),
      updated_at = v_now
  where profile_id = v_profile_id
    and gist_id = p_gist_id
  returning * into v_state;

  v_result := jsonb_build_object(
    'delivery', 'processed',
    'saved_outcome', v_saved_outcome,
    'gist_id', v_state.gist_id,
    'saved', v_state.saved,
    'saved_version', v_state.saved_version,
    'progress', v_state.progress,
    'last_read_at', v_state.last_read_at,
    'last_opened_at', v_state.last_opened_at,
    'last_perspective', v_state.last_perspective,
    'last_anchor', v_state.last_anchor,
    'last_anchor_offset', v_state.last_anchor_offset,
    'scroll_completed_at', v_state.scroll_completed_at,
    'read_acknowledged_at', v_state.read_acknowledged_at,
    'reading_duration_ms', v_state.reading_duration_ms,
    'updated_at', v_state.updated_at
  );

  insert into public.relationship_gist_state_mutation_receipts (
    profile_id, operation_id, gist_id, result
  ) values (
    v_profile_id, p_operation_id, p_gist_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.rpc_apply_relationship_gist_state_mutation_v2(
  uuid, uuid, uuid, boolean, bigint, double precision, timestamptz, boolean,
  text, text, double precision, boolean, boolean, bigint
) from public, anon;
grant execute on function public.rpc_apply_relationship_gist_state_mutation_v2(
  uuid, uuid, uuid, boolean, bigint, double precision, timestamptz, boolean,
  text, text, double precision, boolean, boolean, bigint
) to authenticated, service_role;

-- Keep the exact v1 signature while making old-client save changes visible to v2.
create or replace function public.rpc_upsert_relationship_gist_user_state(
  p_gist_id uuid,
  p_saved boolean default null,
  p_progress double precision default null,
  p_last_read_at timestamptz default null,
  p_mark_opened boolean default false,
  p_last_perspective text default null
)
returns public.relationship_gist_user_states
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_now timestamptz := timezone('utc'::text, now());
  v_state public.relationship_gist_user_states%rowtype;
  v_perspective text := lower(nullif(btrim(coalesce(p_last_perspective, '')), ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.id
  into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  order by profile.created_at
  limit 1;

  if v_profile_id is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if p_progress is not null and (p_progress < 0 or p_progress > 1) then
    raise exception 'gist_progress_invalid';
  end if;
  if v_perspective is not null
    and v_perspective not in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication') then
    raise exception 'gist_perspective_invalid';
  end if;
  if not exists (
    select 1
    from public.relationship_gists gist
    where gist.id = p_gist_id
      and gist.circle_id is null
      and gist.status = 'published'
      and (gist.scheduled_for is null or gist.scheduled_for <= v_now)
  ) then
    raise exception 'gist_not_available';
  end if;

  insert into public.relationship_gist_user_states as existing (
    profile_id, gist_id, saved, progress, last_read_at, last_opened_at,
    last_perspective, saved_version, updated_at
  ) values (
    v_profile_id, p_gist_id, coalesce(p_saved, false), coalesce(p_progress, 0),
    p_last_read_at, case when p_mark_opened then v_now else null end,
    v_perspective, case when p_saved is null then 0 else 1 end, v_now
  )
  on conflict (profile_id, gist_id) do update
  set saved = coalesce(p_saved, existing.saved),
      saved_version = case
        when p_saved is not null and p_saved is distinct from existing.saved
          then existing.saved_version + 1
        else existing.saved_version
      end,
      progress = greatest(existing.progress, coalesce(p_progress, existing.progress)),
      last_read_at = case
        when p_last_read_at is null then existing.last_read_at
        when existing.last_read_at is null then p_last_read_at
        else greatest(existing.last_read_at, p_last_read_at)
      end,
      last_opened_at = case when p_mark_opened then v_now else existing.last_opened_at end,
      last_perspective = coalesce(v_perspective, existing.last_perspective),
      updated_at = v_now
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rpc_upsert_relationship_gist_user_state(
  uuid, boolean, double precision, timestamptz, boolean, text
) from public, anon;
grant execute on function public.rpc_upsert_relationship_gist_user_state(
  uuid, boolean, double precision, timestamptz, boolean, text
) to authenticated, service_role;

commit;
