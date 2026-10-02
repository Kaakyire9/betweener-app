-- Serialize the short rate window so concurrent valid events cannot race past
-- global, campaign or per-recipient claim limits.

begin;

create or replace function public.rpc_service_claim_push_notification_event_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_event private.push_notification_events;
  v_global_claims integer;
  v_recipient_claims integer;
  v_blocked boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push-notification-event:' || p_event_id::text, 0));
  select * into v_event
  from private.push_notification_events event
  where event.id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'push_notification_event_not_found' using errcode = 'P0002';
  end if;
  if v_event.status <> 'pending' then
    return jsonb_build_object('claimStatus', 'duplicate');
  end if;
  if v_event.expires_at <= v_now then
    update private.push_notification_events
    set status = 'expired', completed_at = v_now, outcome = 'request_expired', updated_at = v_now
    where id = p_event_id;
    return jsonb_build_object('claimStatus', 'expired');
  end if;

  if v_event.delivery_kind = 'unicast' then
    if not exists (select 1 from auth.users account where account.id = v_event.recipient_user_id)
      or exists (
        select 1 from public.notification_prefs preference
        where preference.user_id = v_event.recipient_user_id
          and preference.push_enabled = false
      )
      or public.is_quiet_hours(v_event.recipient_user_id) then
      v_blocked := true;
    end if;

    if not v_blocked and v_event.actor_user_id is not null then
      select exists (
        select 1 from public.blocks block
        where (block.blocker_id = v_event.recipient_user_id and block.blocked_id = v_event.actor_user_id)
           or (block.blocker_id = v_event.actor_user_id and block.blocked_id = v_event.recipient_user_id)
      ) into v_blocked;
    end if;

    if v_blocked then
      update private.push_notification_events
      set status = 'suppressed', completed_at = v_now,
          outcome = 'canonical_authorization_denied', updated_at = v_now
      where id = p_event_id;
      return jsonb_build_object('claimStatus', 'not_authorized');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push-notification-rate-window', 0));

  select count(*)::integer into v_global_claims
  from private.push_notification_events event
  where event.claimed_at >= v_now - interval '1 minute';
  if v_global_claims >= 300 then
    return jsonb_build_object('claimStatus', 'rate_limited');
  end if;

  if v_event.delivery_kind = 'live_campaign' and exists (
    select 1
    from private.push_notification_events event
    where event.delivery_kind = 'live_campaign'
      and event.claimed_at >= v_now - interval '1 minute'
    offset 4
  ) then
    return jsonb_build_object('claimStatus', 'rate_limited');
  end if;

  if v_event.delivery_kind = 'unicast' then
    select count(*)::integer into v_recipient_claims
    from private.push_notification_events event
    where event.recipient_user_id = v_event.recipient_user_id
      and event.claimed_at >= v_now - interval '1 minute';
    if v_recipient_claims >= 20 then
      return jsonb_build_object('claimStatus', 'rate_limited');
    end if;
  end if;

  update private.push_notification_events
  set status = 'processing', claimed_at = v_now, updated_at = v_now
  where id = p_event_id
  returning * into v_event;

  return jsonb_strip_nulls(jsonb_build_object(
    'claimStatus', 'claimed',
    'eventId', v_event.id,
    'deliveryKind', v_event.delivery_kind,
    'recipientUserId', v_event.recipient_user_id,
    'campaignId', v_event.campaign_id,
    'eventType', v_event.event_type,
    'title', v_event.title,
    'body', v_event.body,
    'data', v_event.data
  ));
end;
$$;

revoke all on function public.rpc_service_claim_push_notification_event_v1(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_claim_push_notification_event_v1(uuid)
to service_role;

commit;
