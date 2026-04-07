-- Let users acknowledge both approved and rejected verification outcomes.
-- The verification request row remains the server-managed notification event.

create or replace function public.rpc_ack_verification_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.verification_requests
     set user_notified = true,
         updated_at = timezone('utc'::text, now())
   where id = p_request_id
     and user_id = auth.uid()
     and status in ('approved', 'rejected');

  return found;
end;
$$;

revoke all on function public.rpc_ack_verification_request(uuid) from public;
grant execute on function public.rpc_ack_verification_request(uuid) to authenticated;

create or replace function public.notify_verification_outcome_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_target_level integer;
  v_title text;
  v_body text;
begin
  if new.status not in ('approved', 'rejected')
     or old.status is not distinct from new.status then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = new.user_id
      and (
        p.push_enabled = false
        or p.verification = false
      )
  ) then
    return new;
  end if;

  if public.is_quiet_hours(new.user_id) then
    return new;
  end if;

  v_target_level := case new.verification_type
    when 'social' then 1
    when 'selfie_liveness' then 2
    when 'passport' then 2
    when 'residence' then 2
    when 'workplace' then 2
    else 1
  end;

  if new.status = 'approved' then
    v_title := 'Your Betweener trust check is complete';
    v_body := 'Your profile now carries Trust level ' || v_target_level || '.';
  else
    v_title := 'One proof needs another pass';
    v_body := 'Open Betweener to improve your verification privately.';
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', new.user_id,
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'verification_outcome',
        'status', new.status,
        'request_id', new.id,
        'verification_type', new.verification_type,
        'target_level', v_target_level
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_verification_outcome_push on public.verification_requests;
create trigger notify_verification_outcome_push
after update of status on public.verification_requests
for each row
execute function public.notify_verification_outcome_push();
