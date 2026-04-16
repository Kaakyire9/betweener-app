-- Restore the server-managed verification guard bypass for admin approvals.
-- A later verification refresh migration redefined the RPC but dropped the
-- scoped set_config call before updating profiles.verification_level.

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

    perform set_config('app.server_managed_update', 'on', true);

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
