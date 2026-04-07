-- Stop already-verified profiles from submitting redundant verification reviews.

create or replace function public.verification_requests_guard_redundant_pending()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_current_verification_level integer;
  v_required_verification_level integer;
  v_refresh_required boolean;
  v_refresh_target_level integer;
begin
  if coalesce(new.status, 'pending') <> 'pending' then
    return new;
  end if;

  v_required_verification_level := case new.verification_type
    when 'social' then 1
    when 'selfie_liveness' then 2
    when 'passport' then 2
    when 'residence' then 2
    when 'workplace' then 2
    else null
  end;

  if v_required_verification_level is null then
    return new;
  end if;

  select
    coalesce(p.verification_level, 0),
    coalesce(p.verification_refresh_required, false),
    coalesce(p.verification_refresh_target_level, p.verification_level, 1)
    into v_current_verification_level, v_refresh_required, v_refresh_target_level
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  if coalesce(v_current_verification_level, 0) >= v_required_verification_level
     and not (
       coalesce(v_refresh_required, false)
       and v_required_verification_level >= least(greatest(coalesce(v_refresh_target_level, 1), 1), 2)
     ) then
    raise exception 'profile already has this verification level';
  end if;

  return new;
end;
$$;

drop trigger if exists verification_requests_guard_redundant_pending on public.verification_requests;
create trigger verification_requests_guard_redundant_pending
before insert on public.verification_requests
for each row
execute function public.verification_requests_guard_redundant_pending();

create or replace function public.rpc_submit_selfie_liveness_verification(
  p_profile_id uuid,
  p_document_path text,
  p_capture_mode text default 'video',
  p_challenge_type text default 'turn_left_blink',
  p_reference_asset_path text default null
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
  v_current_verification_level integer;
  v_refresh_required boolean;
  v_refresh_target_level integer;
  v_document_path text;
  v_capture_mode text;
  v_challenge_type text;
  v_reference_asset_path text;
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

  if v_current_verification_level >= 2
     and not (
       coalesce(v_refresh_required, false)
       and 2 >= least(greatest(coalesce(v_refresh_target_level, 1), 1), 2)
     ) then
    raise exception 'profile already has this verification level';
  end if;

  v_document_path := nullif(btrim(coalesce(p_document_path, '')), '');
  if v_document_path is null then
    raise exception 'document path required';
  end if;

  if strpos(v_document_path, '..') > 0 then
    raise exception 'invalid document path';
  end if;

  if v_document_path not like auth.uid()::text || '/%' then
    raise exception 'document path must be inside your verification-docs folder';
  end if;

  v_capture_mode := lower(nullif(btrim(coalesce(p_capture_mode, '')), ''));
  if v_capture_mode is null then
    v_capture_mode := 'video';
  end if;

  if v_capture_mode not in ('image', 'video') then
    raise exception 'invalid capture mode';
  end if;

  v_challenge_type := lower(nullif(btrim(coalesce(p_challenge_type, '')), ''));
  if v_challenge_type is null then
    v_challenge_type := 'turn_left_blink';
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

  return query
  select
    vr.id as request_id,
    coalesce(vr.status, 'pending') as status,
    coalesce(vr.created_at, vr.submitted_at, timezone('utc'::text, now())) as created_at,
    true as already_pending
  from public.verification_requests vr
  where vr.profile_id = p_profile_id
    and vr.verification_type = 'selfie_liveness'
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
    auto_verification_data
  )
  values (
    auth.uid(),
    p_profile_id,
    'selfie_liveness',
    v_document_path,
    'pending',
    jsonb_strip_nulls(
      jsonb_build_object(
        'capture_mode', v_capture_mode,
        'challenge_type', v_challenge_type,
        'reference_asset_path', v_reference_asset_path,
        'submitted_via', 'rpc_submit_selfie_liveness_verification'
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

revoke all on function public.rpc_submit_selfie_liveness_verification(uuid, text, text, text, text) from public;
grant execute on function public.rpc_submit_selfie_liveness_verification(uuid, text, text, text, text) to authenticated;
