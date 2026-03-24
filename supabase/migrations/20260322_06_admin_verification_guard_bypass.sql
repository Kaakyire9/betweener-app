-- Allow tightly scoped server-managed verification updates from admin RPCs.
-- SECURITY DEFINER alone does not bypass auth.role()-based trigger guards.

create or replace function public.profiles_guard_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow trusted server-side contexts (service role / SQL editor) to manage
  -- operational fields. Regular app clients must not be able to self-verify,
  -- mark phones verified, mint superlikes, or change server-computed scores.
  if auth.uid() is null
    or coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
    or coalesce(current_setting('app.server_managed_update', true), '') = 'on' then
    return new;
  end if;

  if new.verification_level is distinct from old.verification_level then
    raise exception 'verification_level is server-managed';
  end if;

  if new.phone_verified is distinct from old.phone_verified then
    raise exception 'phone_verified is server-managed';
  end if;

  if new.phone_verification_score is distinct from old.phone_verification_score then
    raise exception 'phone_verification_score is server-managed';
  end if;

  if new.superlikes_left is distinct from old.superlikes_left then
    raise exception 'superlikes_left is server-managed';
  end if;

  if new.superlikes_reset_at is distinct from old.superlikes_reset_at then
    raise exception 'superlikes_reset_at is server-managed';
  end if;

  if new.ai_score is distinct from old.ai_score then
    raise exception 'ai_score is server-managed';
  end if;

  if new.ai_score_updated_at is distinct from old.ai_score_updated_at then
    raise exception 'ai_score_updated_at is server-managed';
  end if;

  return new;
end;
$$;

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

    perform set_config('app.server_managed_update', 'on', true);

    update public.profiles
       set verification_level = greatest(coalesce(verification_level, 0), next_level),
           updated_at = timezone('utc'::text, now())
     where id = request_row.profile_id;
  end if;

  return true;
end;
$$;

revoke all on function public.rpc_admin_review_verification_request(uuid, text, text) from public;
grant execute on function public.rpc_admin_review_verification_request(uuid, text, text) to authenticated;
