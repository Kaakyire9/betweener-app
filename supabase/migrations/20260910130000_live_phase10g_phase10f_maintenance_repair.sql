-- Phase 10G rollout guard: retain the Phase 10F maintenance base beneath its
-- active-experience wrapper. Some development databases applied an earlier
-- draft of 10F before the base function rename was added to the migration.

begin;

create or replace function public.live_odo_maintain_opportunities_base_10f_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_expired_availability integer := 0;
  v_expired_invitations integer := 0;
  v_expired_opportunities integer := 0;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  update public.live_quick_connect_availability set
    status = 'expired', reserved_opportunity_id = null, version = version + 1
  where status in ('available','reserved') and expires_at <= v_now;
  get diagnostics v_expired_availability = row_count;
  update public.live_quick_connect_opportunity_members member set
    state = 'expired', responded_at = v_now,
    response_reason_code = 'invitation_expired', version = member.version + 1
  where member.state = 'invited' and member.invitation_expires_at <= v_now;
  get diagnostics v_expired_invitations = row_count;
  update public.live_quick_connect_opportunities opportunity set
    state = 'expired', lease_owner = null, lease_expires_at = null,
    last_reason_code = 'formation_timeout'
  where opportunity.state in (
    'detected','forming','inviting','awaiting_quorum','quorum_reached'
  ) and opportunity.expires_at <= v_now;
  get diagnostics v_expired_opportunities = row_count;
  delete from public.live_quick_connect_opportunity_reservations reservation
  where reservation.expires_at <= v_now
    or exists (
      select 1 from public.live_quick_connect_opportunities opportunity
      where opportunity.id = reservation.opportunity_id
        and opportunity.state in ('expired','failed','cancelled','completed')
    );
  update public.live_quick_connect_availability availability set
    status = case when availability.expires_at <= v_now
      then 'expired' else 'available' end,
    reserved_opportunity_id = null,
    cooldown_until = case when availability.expires_at > v_now
      then greatest(
        coalesce(availability.cooldown_until, v_now),
        v_now + interval '5 minutes'
      )
      else availability.cooldown_until end,
    version = availability.version + 1
  where availability.status = 'reserved'
    and not exists (
      select 1 from public.live_quick_connect_opportunity_reservations reservation
      where reservation.user_id = availability.user_id
    );
  perform public.live_odo_always_on_bump_user_v1(member.user_id)
  from public.live_quick_connect_opportunity_members member
  where member.responded_at = v_now or member.updated_at = v_now;
  return jsonb_build_object(
    'expiredAvailability', v_expired_availability,
    'expiredInvitations', v_expired_invitations,
    'expiredOpportunities', v_expired_opportunities
  );
end;
$$;

revoke all on function public.live_odo_maintain_opportunities_base_10f_v1()
from public, anon, authenticated, service_role;

commit;
