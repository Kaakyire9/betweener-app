-- Premium fresh-review flow.
-- Admins can ask a verified member for a private refresh without removing their trust badge.

alter table public.profiles
  add column if not exists verification_refresh_required boolean not null default false,
  add column if not exists verification_refresh_reason text,
  add column if not exists verification_refresh_target_level integer,
  add column if not exists verification_refresh_requested_at timestamptz,
  add column if not exists verification_refresh_requested_by uuid,
  add column if not exists verification_refresh_resolved_at timestamptz,
  add column if not exists verification_refresh_user_notified boolean not null default false;

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

create or replace function public.rpc_admin_request_verification_refresh(
  p_profile_id uuid,
  p_target_level integer default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid;
  v_current_level integer;
  v_refresh_required boolean;
  v_target_level integer;
  v_reason text;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  select
    p.user_id,
    coalesce(p.verification_level, 0),
    coalesce(p.verification_refresh_required, false)
    into v_user_id, v_current_level, v_refresh_required
  from public.profiles p
  where p.id = p_profile_id
  for update;

  if v_user_id is null then
    return false;
  end if;

  if v_current_level <= 0 then
    raise exception 'profile is not verified yet';
  end if;

  if coalesce(v_refresh_required, false) then
    raise exception 'fresh review already requested';
  end if;

  v_target_level := least(greatest(coalesce(p_target_level, v_current_level, 1), 1), 2);
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  update public.profiles
     set verification_refresh_required = true,
         verification_refresh_reason = coalesce(
           v_reason,
           'Betweener needs a quick fresh check to keep your trust signal current.'
         ),
         verification_refresh_target_level = v_target_level,
         verification_refresh_requested_at = timezone('utc'::text, now()),
         verification_refresh_requested_by = auth.uid(),
         verification_refresh_resolved_at = null,
         verification_refresh_user_notified = false,
         updated_at = timezone('utc'::text, now())
   where id = p_profile_id;

  if not exists (
    select 1
    from public.notification_prefs p
    where p.user_id = v_user_id
      and (
        p.push_enabled = false
        or p.verification = false
      )
  )
     and not public.is_quiet_hours(v_user_id) then
    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_user_id,
        'title', 'A quick Betweener trust refresh is needed',
        'body', 'Open Betweener to complete a private fresh check.',
        'data', jsonb_build_object(
          'type', 'verification_refresh_requested',
          'profile_id', p_profile_id,
          'target_level', v_target_level
        )
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.rpc_admin_request_verification_refresh(uuid, integer, text) from public;
grant execute on function public.rpc_admin_request_verification_refresh(uuid, integer, text) to authenticated;

create or replace function public.rpc_admin_clear_verification_refresh(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  update public.profiles
     set verification_refresh_required = false,
         verification_refresh_reason = null,
         verification_refresh_target_level = null,
         verification_refresh_resolved_at = timezone('utc'::text, now()),
         updated_at = timezone('utc'::text, now())
   where id = p_profile_id;

  return found;
end;
$$;

revoke all on function public.rpc_admin_clear_verification_refresh(uuid) from public;
grant execute on function public.rpc_admin_clear_verification_refresh(uuid) to authenticated;

create or replace function public.rpc_ack_verification_refresh(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set verification_refresh_user_notified = true,
         updated_at = timezone('utc'::text, now())
   where id = p_profile_id
     and user_id = auth.uid()
     and coalesce(verification_refresh_required, false) = true;

  return found;
end;
$$;

revoke all on function public.rpc_ack_verification_refresh(uuid) from public;
grant execute on function public.rpc_ack_verification_refresh(uuid) to authenticated;

create or replace function public.rpc_admin_review_verification_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.verification_requests%rowtype;
  next_level integer;
  refresh_target_level integer;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select *
    into request_row
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    return false;
  end if;

  update public.verification_requests
     set status = p_decision,
         reviewed_at = timezone('utc'::text, now()),
         reviewer_notes = nullif(trim(coalesce(p_notes, '')), ''),
         user_notified = false,
         updated_at = timezone('utc'::text, now())
   where id = p_request_id;

  if p_decision = 'approved' and request_row.profile_id is not null then
    next_level := case request_row.verification_type
      when 'social' then 1
      when 'selfie_liveness' then 2
      when 'passport' then 2
      when 'residence' then 2
      when 'workplace' then 2
      else 1
    end;

    select least(greatest(coalesce(p.verification_refresh_target_level, p.verification_level, 1), 1), 2)
      into refresh_target_level
    from public.profiles p
    where p.id = request_row.profile_id;

    update public.profiles
       set verification_level = greatest(coalesce(verification_level, 0), next_level),
           verification_refresh_required = case
             when coalesce(verification_refresh_required, false)
                  and next_level >= coalesce(refresh_target_level, 1)
               then false
             else verification_refresh_required
           end,
           verification_refresh_reason = case
             when coalesce(verification_refresh_required, false)
                  and next_level >= coalesce(refresh_target_level, 1)
               then null
             else verification_refresh_reason
           end,
           verification_refresh_target_level = case
             when coalesce(verification_refresh_required, false)
                  and next_level >= coalesce(refresh_target_level, 1)
               then null
             else verification_refresh_target_level
           end,
           verification_refresh_resolved_at = case
             when coalesce(verification_refresh_required, false)
                  and next_level >= coalesce(refresh_target_level, 1)
               then timezone('utc'::text, now())
             else verification_refresh_resolved_at
           end,
           updated_at = timezone('utc'::text, now())
     where id = request_row.profile_id;
  end if;

  return true;
end;
$$;

revoke all on function public.rpc_admin_review_verification_request(uuid, text, text) from public;
grant execute on function public.rpc_admin_review_verification_request(uuid, text, text) to authenticated;
