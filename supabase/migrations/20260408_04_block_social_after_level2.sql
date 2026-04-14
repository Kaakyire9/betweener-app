-- Treat Trust level 2 as the highest completed self-submitted trust state.
-- Social proof can still help someone reach level 1 when they only have phone verification,
-- but once a member already has level 2, no additional self-submitted method should reopen
-- unless Betweener explicitly requests a fresh review.

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
  v_social_already_approved boolean;
  v_allows_refresh boolean;
begin
  if coalesce(new.status, 'pending') <> 'pending' then
    return new;
  end if;

  v_required_verification_level := case lower(coalesce(new.verification_type, ''))
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

  v_allows_refresh := coalesce(v_refresh_required, false)
    and v_required_verification_level >= least(greatest(coalesce(v_refresh_target_level, 1), 1), 2);

  if lower(coalesce(new.verification_type, '')) = 'social' then
    select exists (
      select 1
      from public.verification_requests vr
      where vr.profile_id = new.profile_id
        and lower(coalesce(vr.verification_type, '')) = 'social'
        and coalesce(vr.status, 'pending') = 'approved'
    )
    into v_social_already_approved;

    if (v_social_already_approved or coalesce(v_current_verification_level, 0) >= 2)
       and not v_allows_refresh then
      if v_social_already_approved then
        raise exception 'profile already has this verification method';
      end if;
      raise exception 'profile already has this verification level';
    end if;

    return new;
  end if;

  if coalesce(v_current_verification_level, 0) >= v_required_verification_level
     and not v_allows_refresh then
    raise exception 'profile already has this verification level';
  end if;

  return new;
end;
$$;

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
  v_social_already_approved boolean;
  v_allows_refresh boolean;
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

  v_allows_refresh := coalesce(v_refresh_required, false)
    and v_required_verification_level >= least(greatest(coalesce(v_refresh_target_level, 1), 1), 2);

  if v_verification_type = 'social' then
    select exists (
      select 1
      from public.verification_requests vr
      where vr.profile_id = p_profile_id
        and lower(coalesce(vr.verification_type, '')) = 'social'
        and coalesce(vr.status, 'pending') = 'approved'
    )
    into v_social_already_approved;

    if (v_social_already_approved or v_current_verification_level >= 2)
       and not v_allows_refresh then
      if v_social_already_approved then
        raise exception 'profile already has this verification method';
      end if;
      raise exception 'profile already has this verification level';
    end if;
  elsif v_current_verification_level >= v_required_verification_level
     and not v_allows_refresh then
    raise exception 'profile already has this verification level';
  end if;

  v_document_path := nullif(btrim(coalesce(p_document_path, '')), '');
  if v_document_path is null and v_verification_type <> 'social' then
    raise exception 'document path required';
  end if;

  v_reference_asset_path := nullif(btrim(coalesce(p_reference_asset_path, '')), '');
  v_auto_verification_score := p_auto_verification_score;
  v_auto_verification_reason := nullif(btrim(coalesce(p_auto_verification_reason, '')), '');
  v_social_platform := nullif(lower(btrim(coalesce(p_social_platform, ''))), '');
  v_social_profile_url := nullif(btrim(coalesce(p_social_profile_url, '')), '');
  v_social_handle := nullif(btrim(coalesce(p_social_handle, '')), '');

  if v_verification_type = 'social' and v_social_profile_url is null and v_social_handle is null then
    raise exception 'social evidence required';
  end if;

  return query
  with pending as (
    select
      vr.id as request_id,
      coalesce(vr.status, 'pending') as status,
      coalesce(vr.created_at, vr.submitted_at, timezone('utc'::text, now())) as created_at
    from public.verification_requests vr
    where vr.profile_id = p_profile_id
      and vr.verification_type = v_verification_type
      and coalesce(vr.status, 'pending') = 'pending'
    order by vr.created_at desc nulls last, vr.id desc
    limit 1
  ),
  inserted as (
    insert into public.verification_requests (
      user_id,
      profile_id,
      verification_type,
      document_url,
      status,
      auto_verification_score,
      auto_verification_data
    )
    select
      auth.uid(),
      p_profile_id,
      v_verification_type,
      v_document_path,
      'pending',
      v_auto_verification_score,
      jsonb_strip_nulls(
        jsonb_build_object(
          'submitted_via', 'rpc_submit_manual_verification_request',
          'auto_verification_reason', v_auto_verification_reason,
          'reference_asset_path', v_reference_asset_path,
          'social_platform', v_social_platform,
          'social_profile_url', v_social_profile_url,
          'social_handle', v_social_handle
        )
      )
    where not exists (select 1 from pending)
    returning *
  )
  select pending.request_id, pending.status, pending.created_at, true
  from pending
  union all
  select
    inserted.id as request_id,
    coalesce(inserted.status, 'pending') as status,
    coalesce(inserted.created_at, inserted.submitted_at, timezone('utc'::text, now())) as created_at,
    false as already_pending
  from inserted;
end;
$$;
