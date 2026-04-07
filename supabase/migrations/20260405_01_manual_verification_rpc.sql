-- Move manual verification submissions behind a server-managed RPC.
-- This keeps passport/residence/social/workplace aligned with selfie liveness:
-- ownership checks, folder checks, and duplicate-pending protection all happen server-side.

alter table public.profiles
  add column if not exists verification_refresh_required boolean not null default false,
  add column if not exists verification_refresh_reason text,
  add column if not exists verification_refresh_target_level integer,
  add column if not exists verification_refresh_requested_at timestamptz,
  add column if not exists verification_refresh_requested_by uuid,
  add column if not exists verification_refresh_resolved_at timestamptz,
  add column if not exists verification_refresh_user_notified boolean not null default false;

create index if not exists verification_requests_pending_lookup_idx
  on public.verification_requests (profile_id, verification_type, created_at desc)
  where coalesce(status, 'pending') = 'pending';

drop function if exists public.rpc_submit_manual_verification_request(uuid, text, text, numeric, text, text);

create or replace function public.rpc_submit_manual_verification_request(
  p_profile_id uuid,
  p_verification_type text,
  p_document_path text default null,
  p_auto_verification_score numeric default null,
  p_auto_verification_reason text default null,
  p_reference_asset_path text default null,
  p_social_platform text default null,
  p_social_profile_url text default null,
  p_social_handle text default null
)
returns table (
  request_id uuid,
  status text,
  created_at timestamptz,
  already_pending boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_verification_type text;
  v_document_path text;
  v_reference_asset_path text;
  v_auto_verification_score numeric;
  v_auto_verification_reason text;
  v_social_platform text;
  v_social_profile_url text;
  v_social_handle text;
  v_current_verification_level integer;
  v_required_verification_level integer;
  v_refresh_required boolean;
  v_refresh_target_level integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select
    p.user_id,
    coalesce(p.verification_level, 0),
    coalesce(p.verification_refresh_required, false),
    coalesce(p.verification_refresh_target_level, p.verification_level, 1)
    into v_user_id, v_current_verification_level, v_refresh_required, v_refresh_target_level
  from public.profiles p
  where p.id = p_profile_id
    and p.user_id = auth.uid()
  limit 1;

  if v_user_id is null then
    raise exception 'profile not found for current user';
  end if;

  v_verification_type := lower(nullif(btrim(coalesce(p_verification_type, '')), ''));
  if v_verification_type is null then
    raise exception 'verification type required';
  end if;

  if v_verification_type not in ('passport', 'residence', 'social', 'workplace') then
    raise exception 'invalid manual verification type';
  end if;

  v_required_verification_level := case v_verification_type
    when 'social' then 1
    when 'passport' then 2
    when 'residence' then 2
    when 'workplace' then 2
    else 1
  end;

  if v_current_verification_level >= v_required_verification_level
     and not (
       coalesce(v_refresh_required, false)
       and v_required_verification_level >= least(greatest(coalesce(v_refresh_target_level, 1), 1), 2)
     ) then
    raise exception 'profile already has this verification level';
  end if;

  v_document_path := nullif(btrim(coalesce(p_document_path, '')), '');
  if v_document_path is null and v_verification_type <> 'social' then
    raise exception 'document path required';
  end if;

  if v_document_path is not null and strpos(v_document_path, '..') > 0 then
    raise exception 'invalid document path';
  end if;

  if v_document_path is not null and v_document_path not like auth.uid()::text || '/%' then
    raise exception 'document path must be inside your verification-docs folder';
  end if;

  v_reference_asset_path := nullif(btrim(coalesce(p_reference_asset_path, '')), '');
  if v_reference_asset_path is not null then
    if strpos(v_reference_asset_path, '..') > 0 then
      raise exception 'invalid reference asset path';
    end if;

    if v_reference_asset_path not like auth.uid()::text || '/%' then
      raise exception 'reference asset path must be inside your verification-docs folder';
    end if;
  end if;

  v_auto_verification_score := p_auto_verification_score;
  if v_auto_verification_score is not null then
    v_auto_verification_score := greatest(0, least(v_auto_verification_score, 1));
  end if;

  v_auto_verification_reason := nullif(btrim(coalesce(p_auto_verification_reason, '')), '');
  v_social_platform := lower(nullif(btrim(coalesce(p_social_platform, '')), ''));
  v_social_profile_url := nullif(btrim(coalesce(p_social_profile_url, '')), '');
  v_social_handle := nullif(btrim(coalesce(p_social_handle, '')), '');

  if v_social_platform is not null
     and v_social_platform not in ('instagram', 'tiktok', 'facebook', 'linkedin', 'other') then
    v_social_platform := 'other';
  end if;

  if v_social_profile_url is not null and length(v_social_profile_url) > 300 then
    raise exception 'social profile link is too long';
  end if;

  if v_social_handle is not null and length(v_social_handle) > 100 then
    raise exception 'social handle is too long';
  end if;

  if v_verification_type = 'social'
     and v_document_path is null
     and v_social_profile_url is null
     and v_social_handle is null then
    raise exception 'social profile link or handle required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_profile_id::text), hashtext(v_verification_type));

  return query
  select
    vr.id as request_id,
    coalesce(vr.status, 'pending') as status,
    coalesce(vr.created_at, vr.submitted_at, timezone('utc'::text, now())) as created_at,
    true as already_pending
  from public.verification_requests vr
  where vr.profile_id = p_profile_id
    and vr.verification_type = v_verification_type
    and coalesce(vr.status, 'pending') = 'pending'
  order by vr.created_at desc nulls last, vr.id desc
  limit 1;

  if found then
    return;
  end if;

  return query
  insert into public.verification_requests (
    user_id,
    profile_id,
    verification_type,
    document_url,
    status,
    auto_verification_score,
    reviewer_notes,
    auto_verification_data
  )
  values (
    auth.uid(),
    p_profile_id,
    v_verification_type,
    v_document_path,
    'pending',
    v_auto_verification_score,
    case
      when v_auto_verification_reason is null then null
      else 'Pending review: ' || v_auto_verification_reason
    end,
    jsonb_strip_nulls(
      jsonb_build_object(
        'submitted_via', 'rpc_submit_manual_verification_request',
        'reference_asset_path', v_reference_asset_path,
        'social_platform', v_social_platform,
        'social_profile_url', v_social_profile_url,
        'social_handle', v_social_handle
      )
    )
  )
  returning
    verification_requests.id as request_id,
    coalesce(verification_requests.status, 'pending') as status,
    coalesce(verification_requests.created_at, verification_requests.submitted_at, timezone('utc'::text, now())) as created_at,
    false as already_pending;
end;
$$;

revoke all on function public.rpc_submit_manual_verification_request(uuid, text, text, numeric, text, text, text, text, text) from public;
grant execute on function public.rpc_submit_manual_verification_request(uuid, text, text, numeric, text, text, text, text, text) to authenticated;

drop function if exists public.rpc_admin_get_verification_queue();

create or replace function public.rpc_admin_get_verification_queue()
returns table (
  id uuid,
  user_id uuid,
  profile_id uuid,
  verification_type text,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_notes text,
  auto_verification_score numeric,
  auto_verification_data jsonb,
  document_url text,
  full_name text,
  current_country text,
  avatar_url text,
  verification_level integer,
  verification_refresh_required boolean,
  verification_refresh_reason text,
  verification_refresh_target_level integer,
  verification_refresh_requested_at timestamptz
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
    vr.id,
    vr.user_id,
    vr.profile_id,
    vr.verification_type,
    coalesce(vr.status, 'pending') as status,
    vr.submitted_at,
    vr.reviewed_at,
    vr.reviewer_notes,
    vr.auto_verification_score,
    vr.auto_verification_data,
    vr.document_url,
    p.full_name,
    p.current_country,
    p.avatar_url,
    p.verification_level,
    coalesce(p.verification_refresh_required, false) as verification_refresh_required,
    p.verification_refresh_reason,
    p.verification_refresh_target_level,
    p.verification_refresh_requested_at
  from public.verification_requests vr
  left join public.profiles p on p.id = vr.profile_id
  order by
    case when coalesce(vr.status, 'pending') = 'pending' then 0 else 1 end,
    vr.submitted_at asc nulls last;
end;
$$;

revoke all on function public.rpc_admin_get_verification_queue() from public;
grant execute on function public.rpc_admin_get_verification_queue() to authenticated;
