-- Duplicate-account recovery scaffold.
-- This creates admin-only merge cases, audit events, and a preflight RPC that
-- inventories source-account references before any manual or scripted merge.

create table if not exists public.account_merge_cases (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null references auth.users(id) on delete restrict,
  source_profile_id uuid references public.profiles(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  target_profile_id uuid references public.profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'approved', 'scheduled', 'completed', 'rejected', 'failed', 'cancelled')),
  request_channel text not null default 'support'
    check (request_channel in ('support', 'user_report', 'ops', 'system')),
  candidate_reason text,
  evidence jsonb not null default '{}'::jsonb,
  preflight_summary jsonb not null default '{}'::jsonb,
  execution_summary jsonb not null default '{}'::jsonb,
  requester_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  executed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  executed_at timestamptz,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint account_merge_cases_distinct_users check (source_user_id <> target_user_id),
  constraint account_merge_cases_distinct_profiles check (
    source_profile_id is null
    or target_profile_id is null
    or source_profile_id <> target_profile_id
  )
);

create unique index if not exists account_merge_cases_open_pair_idx
  on public.account_merge_cases (source_user_id, target_user_id)
  where status in ('pending', 'reviewing', 'approved', 'scheduled');

create index if not exists account_merge_cases_status_idx
  on public.account_merge_cases (status, created_at desc);

create table if not exists public.account_merge_events (
  id uuid primary key default gen_random_uuid(),
  merge_case_id uuid not null references public.account_merge_cases(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists account_merge_events_case_idx
  on public.account_merge_events (merge_case_id, created_at desc);

alter table public.account_merge_cases enable row level security;
alter table public.account_merge_events enable row level security;

revoke all on public.account_merge_cases from anon, authenticated;
revoke all on public.account_merge_events from anon, authenticated;

create or replace function public.rpc_admin_create_account_merge_case(
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_source_profile_id uuid default null,
  p_target_profile_id uuid default null,
  p_request_channel text default 'support',
  p_candidate_reason text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_requester_user_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_source_profile_id uuid := p_source_profile_id;
  v_target_profile_id uuid := p_target_profile_id;
  v_case_id uuid;
  v_channel text := lower(trim(coalesce(p_request_channel, 'support')));
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  if p_source_user_id is null or p_target_user_id is null then
    raise exception 'source and target user ids are required';
  end if;

  if p_source_user_id = p_target_user_id then
    raise exception 'source and target users must be different';
  end if;

  if v_channel not in ('support', 'user_report', 'ops', 'system') then
    raise exception 'invalid request channel';
  end if;

  if v_source_profile_id is null then
    select p.id
      into v_source_profile_id
    from public.profiles p
    where p.user_id = p_source_user_id
    limit 1;
  end if;

  if v_target_profile_id is null then
    select p.id
      into v_target_profile_id
    from public.profiles p
    where p.user_id = p_target_user_id
    limit 1;
  end if;

  select amc.id
    into v_existing_id
  from public.account_merge_cases amc
  where amc.source_user_id = p_source_user_id
    and amc.target_user_id = p_target_user_id
    and amc.status in ('pending', 'reviewing', 'approved', 'scheduled')
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.account_merge_cases (
    source_user_id,
    source_profile_id,
    target_user_id,
    target_profile_id,
    request_channel,
    candidate_reason,
    evidence,
    requester_user_id,
    created_by,
    notes
  )
  values (
    p_source_user_id,
    v_source_profile_id,
    p_target_user_id,
    v_target_profile_id,
    v_channel,
    nullif(trim(coalesce(p_candidate_reason, '')), ''),
    coalesce(p_evidence, '{}'::jsonb),
    p_requester_user_id,
    auth.uid(),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_case_id;

  insert into public.account_merge_events (
    merge_case_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_case_id,
    'case_created',
    auth.uid(),
    jsonb_build_object(
      'source_user_id', p_source_user_id,
      'source_profile_id', v_source_profile_id,
      'target_user_id', p_target_user_id,
      'target_profile_id', v_target_profile_id,
      'request_channel', v_channel
    )
  );

  return v_case_id;
end;
$$;

create or replace function public.rpc_admin_get_account_merge_queue()
returns table (
  id uuid,
  status text,
  request_channel text,
  candidate_reason text,
  source_user_id uuid,
  source_profile_id uuid,
  source_name text,
  source_avatar_url text,
  target_user_id uuid,
  target_profile_id uuid,
  target_name text,
  target_avatar_url text,
  requester_user_id uuid,
  created_by uuid,
  reviewed_by uuid,
  executed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  executed_at timestamptz,
  resolved_at timestamptz,
  preflight_summary jsonb,
  execution_summary jsonb,
  evidence jsonb,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    amc.id,
    amc.status,
    amc.request_channel,
    amc.candidate_reason,
    amc.source_user_id,
    amc.source_profile_id,
    source_profile.full_name,
    source_profile.avatar_url,
    amc.target_user_id,
    amc.target_profile_id,
    target_profile.full_name,
    target_profile.avatar_url,
    amc.requester_user_id,
    amc.created_by,
    amc.reviewed_by,
    amc.executed_by,
    amc.created_at,
    amc.updated_at,
    amc.reviewed_at,
    amc.executed_at,
    amc.resolved_at,
    amc.preflight_summary,
    amc.execution_summary,
    amc.evidence,
    amc.notes
  from public.account_merge_cases amc
  left join public.profiles source_profile on source_profile.id = amc.source_profile_id
  left join public.profiles target_profile on target_profile.id = amc.target_profile_id
  order by
    case
      when amc.status in ('pending', 'reviewing', 'approved', 'scheduled') then 0
      else 1
    end,
    amc.created_at desc;
end;
$$;

create or replace function public.rpc_admin_update_account_merge_case(
  p_case_id uuid,
  p_status text,
  p_notes text default null,
  p_execution_summary jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  if v_status not in ('pending', 'reviewing', 'approved', 'scheduled', 'completed', 'rejected', 'failed', 'cancelled') then
    raise exception 'invalid merge status';
  end if;

  update public.account_merge_cases
     set status = v_status,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         execution_summary = coalesce(p_execution_summary, execution_summary),
         reviewed_by = case
           when v_status in ('reviewing', 'approved', 'rejected', 'failed', 'cancelled') then auth.uid()
           else reviewed_by
         end,
         reviewed_at = case
           when v_status in ('reviewing', 'approved', 'rejected', 'failed', 'cancelled') then timezone('utc'::text, now())
           else reviewed_at
         end,
         executed_by = case
           when v_status = 'completed' then auth.uid()
           else executed_by
         end,
         executed_at = case
           when v_status = 'completed' then timezone('utc'::text, now())
           else executed_at
         end,
         resolved_at = case
           when v_status in ('completed', 'rejected', 'failed', 'cancelled') then timezone('utc'::text, now())
           else null
         end,
         updated_at = timezone('utc'::text, now())
   where id = p_case_id;

  if not found then
    return false;
  end if;

  insert into public.account_merge_events (
    merge_case_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    p_case_id,
    'case_status_updated',
    auth.uid(),
    jsonb_build_object(
      'status', v_status,
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'execution_summary', coalesce(p_execution_summary, '{}'::jsonb)
    )
  );

  return true;
end;
$$;

create or replace function public.rpc_admin_preview_account_merge_case(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.account_merge_cases%rowtype;
  v_user_columns text[] := array[
    'user_id',
    'peer_user_id',
    'creator_user_id',
    'recipient_user_id',
    'requested_by_user_id',
    'requester_user_id',
    'reporter_id',
    'reported_id',
    'sender_id',
    'receiver_id',
    'reactor_user_id',
    'assigned_admin_user_id',
    'created_by',
    'reviewed_by',
    'executed_by'
  ];
  v_profile_columns text[] := array[
    'profile_id',
    'target_profile_id',
    'viewer_profile_id',
    'created_by_profile_id',
    'requested_by_profile_id',
    'creator_profile_id',
    'recipient_profile_id',
    'accepted_by_profile_id',
    'declined_by_profile_id',
    'concierge_requested_by_profile_id'
  ];
  v_row record;
  v_refs jsonb := '[]'::jsonb;
  v_count bigint;
  v_user_total bigint := 0;
  v_profile_total bigint := 0;
  v_result jsonb;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  select *
    into v_case
  from public.account_merge_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'merge case not found';
  end if;

  for v_row in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.data_type = 'uuid'
      and c.table_name not in ('account_merge_cases', 'account_merge_events')
      and (
        c.column_name = any(v_user_columns)
        or c.column_name = any(v_profile_columns)
      )
    order by c.table_name, c.column_name
  loop
    if v_row.column_name = any(v_user_columns) then
      if v_case.source_user_id is null then
        continue;
      end if;
      execute format(
        'select count(*) from public.%I where %I = $1',
        v_row.table_name,
        v_row.column_name
      )
      into v_count
      using v_case.source_user_id;

      if v_count > 0 then
        v_user_total := v_user_total + v_count;
        v_refs := v_refs || jsonb_build_array(
          jsonb_build_object(
            'scope', 'user',
            'table', v_row.table_name,
            'column', v_row.column_name,
            'count', v_count
          )
        );
      end if;
    else
      if v_case.source_profile_id is null then
        continue;
      end if;
      execute format(
        'select count(*) from public.%I where %I = $1',
        v_row.table_name,
        v_row.column_name
      )
      into v_count
      using v_case.source_profile_id;

      if v_count > 0 then
        v_profile_total := v_profile_total + v_count;
        v_refs := v_refs || jsonb_build_array(
          jsonb_build_object(
            'scope', 'profile',
            'table', v_row.table_name,
            'column', v_row.column_name,
            'count', v_count
          )
        );
      end if;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'case_id', v_case.id,
    'status', v_case.status,
    'source', jsonb_build_object(
      'user_id', v_case.source_user_id,
      'profile_id', v_case.source_profile_id
    ),
    'target', jsonb_build_object(
      'user_id', v_case.target_user_id,
      'profile_id', v_case.target_profile_id
    ),
    'totals', jsonb_build_object(
      'user_reference_rows', v_user_total,
      'profile_reference_rows', v_profile_total,
      'combined_rows', v_user_total + v_profile_total
    ),
    'references', v_refs,
    'recommendation', 'manual review required before any merge execution'
  );

  update public.account_merge_cases
     set preflight_summary = v_result,
         updated_at = timezone('utc'::text, now())
   where id = v_case.id;

  insert into public.account_merge_events (
    merge_case_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_case.id,
    'case_preflighted',
    auth.uid(),
    jsonb_build_object(
      'user_reference_rows', v_user_total,
      'profile_reference_rows', v_profile_total
    )
  );

  return v_result;
end;
$$;

revoke all on function public.rpc_admin_create_account_merge_case(uuid, uuid, uuid, uuid, text, text, jsonb, uuid, text) from public;
revoke all on function public.rpc_admin_get_account_merge_queue() from public;
revoke all on function public.rpc_admin_update_account_merge_case(uuid, text, text, jsonb) from public;
revoke all on function public.rpc_admin_preview_account_merge_case(uuid) from public;

grant execute on function public.rpc_admin_create_account_merge_case(uuid, uuid, uuid, uuid, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.rpc_admin_get_account_merge_queue() to authenticated;
grant execute on function public.rpc_admin_update_account_merge_case(uuid, text, text, jsonb) to authenticated;
grant execute on function public.rpc_admin_preview_account_merge_case(uuid) to authenticated;
