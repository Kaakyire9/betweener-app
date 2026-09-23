-- Give moderated albums an atomic actor quota instead of charging every image
-- against the single-photo allowance. The Edge function is still the only
-- caller and every album remains capped at ten attachments.

alter table public.content_guard_rate_limits
  drop constraint if exists content_guard_rate_limits_scope_check;

alter table public.content_guard_rate_limits
  add constraint content_guard_rate_limits_scope_check
  check (scope in ('private_message', 'chat_image', 'chat_image_album', 'profile_image'));

create or replace function public.rpc_service_consume_content_guard_rate_limit(
  p_user_id uuid,
  p_scope text
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_window interval := interval '10 minutes';
  v_limit integer := case
    when p_scope = 'private_message' then 120
    when p_scope = 'chat_image_album' then 6
    else 12
  end;
  v_count integer;
  v_started timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_scope not in (
    'private_message', 'chat_image', 'chat_image_album', 'profile_image'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_SCOPE';
  end if;

  insert into public.content_guard_rate_limits(
    user_id, scope, window_started_at, request_count, updated_at
  ) values (p_user_id, p_scope, v_now, 1, v_now)
  on conflict (user_id, scope) do update
  set window_started_at = case
        when public.content_guard_rate_limits.window_started_at <= v_now - v_window
          then v_now else public.content_guard_rate_limits.window_started_at end,
      request_count = case
        when public.content_guard_rate_limits.window_started_at <= v_now - v_window
          then 1 else public.content_guard_rate_limits.request_count + 1 end,
      updated_at = v_now
  returning request_count, window_started_at into v_count, v_started;

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'request_count', v_count,
    'limit', v_limit,
    'retry_after_seconds', case when v_count <= v_limit then 0 else greatest(
      1, ceil(extract(epoch from (v_started + v_window - v_now)))::integer
    ) end
  );
end;
$$;

revoke all on function public.rpc_service_consume_content_guard_rate_limit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_consume_content_guard_rate_limit(uuid, text)
  to service_role;

comment on function public.rpc_service_consume_content_guard_rate_limit(uuid, text) is
  'Atomically enforces actor moderation quotas; chat_image_album counts albums, not individual images.';
