-- Durable idempotency receipts for v1.2 app mutations.
-- This migration is additive and does not change the v1.1.1 RPC contracts.

begin;

create table if not exists public.app_mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  mutation_kind text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, operation_id),
  constraint app_mutation_receipts_operation_id_length
    check (char_length(operation_id) between 8 and 160),
  constraint app_mutation_receipts_kind_length
    check (char_length(mutation_kind) between 1 and 80)
);

alter table public.app_mutation_receipts enable row level security;
revoke all on table public.app_mutation_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.app_mutation_receipts to service_role;

create index if not exists app_mutation_receipts_created_at_idx
  on public.app_mutation_receipts (created_at);

create or replace function public.rpc_create_text_moment_v2(
  p_client_operation_id text,
  p_text_body text,
  p_caption text default null,
  p_visibility text default 'matches',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_moment_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':moment_text_create:' || p_client_operation_id, 0)
  );
  select receipt.result into v_result
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'moment_text_create';
  if v_result is not null then
    return (v_result ->> 'moment_id')::uuid;
  end if;

  v_moment_id := public.rpc_create_moment(
    'text', p_text_body, p_caption, p_visibility, coalesce(p_metadata, '{}'::jsonb)
  );
  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (
    v_user_id,
    p_client_operation_id,
    'moment_text_create',
    jsonb_build_object('moment_id', v_moment_id)
  );
  return v_moment_id;
end;
$$;

create or replace function public.rpc_create_media_moment_v2(
  p_client_operation_id text,
  p_moment_id uuid,
  p_type text,
  p_media_url text,
  p_caption text default null,
  p_visibility text default 'matches',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_moment_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':moment_media_create:' || p_client_operation_id, 0)
  );
  select receipt.result into v_result
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'moment_media_create';
  if v_result is not null then
    return (v_result ->> 'moment_id')::uuid;
  end if;

  v_moment_id := public.rpc_create_media_moment(
    p_moment_id, p_type, p_media_url, p_caption, p_visibility, coalesce(p_metadata, '{}'::jsonb)
  );
  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (
    v_user_id,
    p_client_operation_id,
    'moment_media_create',
    jsonb_build_object('moment_id', v_moment_id)
  );
  return v_moment_id;
end;
$$;

create or replace function public.rpc_create_moment_comment_v2(
  p_client_operation_id text,
  p_moment_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':moment_comment_create:' || p_client_operation_id, 0)
  );
  select receipt.result into v_receipt
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'moment_comment_create';
  if v_receipt is not null then
    select to_jsonb(comment_row) into v_result
    from public.moment_comments comment_row
    where comment_row.id = (v_receipt ->> 'comment_id')::uuid
      and comment_row.user_id = v_user_id;
    return v_result;
  end if;

  select to_jsonb(created_comment) into v_result
  from public.rpc_create_moment_comment(
    p_moment_id, p_body, p_parent_comment_id
  ) created_comment;
  if v_result is null then return null; end if;

  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (
    v_user_id,
    p_client_operation_id,
    'moment_comment_create',
    jsonb_build_object('comment_id', v_result ->> 'id')
  );
  return v_result;
end;
$$;

create or replace function public.rpc_create_circle_pulse_comment_v2(
  p_client_operation_id text,
  p_pulse_item_id uuid,
  p_profile_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':circle_comment_create:' || p_client_operation_id, 0)
  );
  select receipt.result into v_receipt
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'circle_comment_create';
  if v_receipt is not null then
    select to_jsonb(comment_snapshot) into v_result
    from public.rpc_get_circle_pulse_comment_snapshot(
      (v_receipt ->> 'comment_id')::uuid
    ) comment_snapshot
    limit 1;
    return v_result;
  end if;

  select to_jsonb(created_comment) into v_result
  from public.rpc_create_circle_pulse_comment(
    p_pulse_item_id, p_profile_id, p_body, p_parent_comment_id
  ) created_comment
  limit 1;
  if v_result is null then return null; end if;

  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (
    v_user_id,
    p_client_operation_id,
    'circle_comment_create',
    jsonb_build_object('comment_id', v_result ->> 'id')
  );
  return v_result;
end;
$$;

create or replace function public.rpc_create_profile_boost_v3(
  p_client_operation_id text,
  p_boost_type text default 'manual',
  p_audience_mode text default 'for_you',
  p_focus_mode text default 'profile',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':profile_boost_create:' || p_client_operation_id, 0)
  );
  select receipt.result into v_result
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'profile_boost_create';
  if v_result is not null then return v_result; end if;

  v_result := public.rpc_create_profile_boost_v2(
    p_boost_type, p_audience_mode, p_focus_mode, coalesce(p_metadata, '{}'::jsonb)
  );
  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (v_user_id, p_client_operation_id, 'profile_boost_create', v_result);
  return v_result;
end;
$$;

create or replace function public.rpc_send_profile_gift_v2(
  p_client_operation_id text,
  p_recipient_profile_id uuid,
  p_gift_type text,
  p_include_sandbox_preview boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':profile_gift_send:' || p_client_operation_id, 0)
  );
  select receipt.result into v_result
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'profile_gift_send';
  if v_result is not null then return v_result; end if;

  v_result := public.rpc_send_profile_gift(
    p_recipient_profile_id, p_gift_type, p_include_sandbox_preview
  );
  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (v_user_id, p_client_operation_id, 'profile_gift_send', v_result);
  return v_result;
end;
$$;

create or replace function public.rpc_replace_profile_interests_v2(
  p_profile_id uuid,
  p_interest_names text[],
  p_client_operation_id text
) returns text[]
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_names text[];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if char_length(coalesce(p_client_operation_id, '')) not between 8 and 160 then
    raise exception 'invalid_client_operation_id' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id
      and profile.user_id = v_user_id
      and profile.deleted_at is null
  ) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':profile_interests_update:' || p_client_operation_id, 0)
  );
  select receipt.result into v_result
  from public.app_mutation_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.operation_id = p_client_operation_id
    and receipt.mutation_kind = 'profile_interests_update';
  if v_result is not null then
    select coalesce(array_agg(interest.name order by interest.name), '{}'::text[])
      into v_names
    from public.profile_interests profile_interest
    join public.interests interest on interest.id = profile_interest.interest_id
    where profile_interest.profile_id = p_profile_id;
    return v_names;
  end if;

  select coalesce(array_agg(interest.name order by interest.name), '{}'::text[])
    into v_names
  from public.interests interest
  where interest.name = any(coalesce(p_interest_names, '{}'::text[]));
  if cardinality(v_names) <> cardinality(coalesce(p_interest_names, '{}'::text[])) then
    raise exception 'interest_catalog_mismatch' using errcode = '22023';
  end if;

  delete from public.profile_interests where profile_id = p_profile_id;
  insert into public.profile_interests (profile_id, interest_id)
  select p_profile_id, interest.id
  from public.interests interest
  where interest.name = any(v_names)
  on conflict do nothing;

  v_result := jsonb_build_object('applied', true);
  insert into public.app_mutation_receipts (user_id, operation_id, mutation_kind, result)
  values (v_user_id, p_client_operation_id, 'profile_interests_update', v_result);
  return v_names;
end;
$$;

revoke all on function public.rpc_create_text_moment_v2(text,text,text,text,jsonb) from public, anon;
revoke all on function public.rpc_create_media_moment_v2(text,uuid,text,text,text,text,jsonb) from public, anon;
revoke all on function public.rpc_create_moment_comment_v2(text,uuid,text,uuid) from public, anon;
revoke all on function public.rpc_create_circle_pulse_comment_v2(text,uuid,uuid,text,uuid) from public, anon;
revoke all on function public.rpc_create_profile_boost_v3(text,text,text,text,jsonb) from public, anon;
revoke all on function public.rpc_send_profile_gift_v2(text,uuid,text,boolean) from public, anon;
revoke all on function public.rpc_replace_profile_interests_v2(uuid,text[],text) from public, anon;

grant execute on function public.rpc_create_text_moment_v2(text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.rpc_create_media_moment_v2(text,uuid,text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.rpc_create_moment_comment_v2(text,uuid,text,uuid) to authenticated, service_role;
grant execute on function public.rpc_create_circle_pulse_comment_v2(text,uuid,uuid,text,uuid) to authenticated, service_role;
grant execute on function public.rpc_create_profile_boost_v3(text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.rpc_send_profile_gift_v2(text,uuid,text,boolean) to authenticated, service_role;
grant execute on function public.rpc_replace_profile_interests_v2(uuid,text[],text) to authenticated, service_role;

create or replace function public.cleanup_app_mutation_receipts_v1(
  p_limit integer default 5000
) returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted integer := 0;
begin
  with doomed as (
    select receipt.user_id, receipt.operation_id
    from public.app_mutation_receipts receipt
    where receipt.created_at < timezone('utc', now()) - interval '35 days'
    order by receipt.created_at
    limit greatest(1, least(coalesce(p_limit, 5000), 20000))
    for update skip locked
  )
  delete from public.app_mutation_receipts receipt
  using doomed
  where receipt.user_id = doomed.user_id
    and receipt.operation_id = doomed.operation_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_app_mutation_receipts_v1(integer)
from public, anon, authenticated;
grant execute on function public.cleanup_app_mutation_receipts_v1(integer) to service_role;

do $$
declare
  v_job record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable; app mutation receipt retention must be invoked externally.';
    return;
  end if;

  for v_job in
    select jobid from cron.job where jobname = 'app-mutation-receipt-retention'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'app-mutation-receipt-retention',
    '23 3 * * *',
    'select public.cleanup_app_mutation_receipts_v1(5000);'
  );
end;
$$;

commit;
