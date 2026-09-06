-- Bound paid/remote moderation calls by actor and content surface.

create table if not exists public.content_guard_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('private_message', 'chat_image', 'profile_image')),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, scope)
);
alter table public.content_guard_rate_limits enable row level security;
revoke all on table public.content_guard_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.content_guard_rate_limits to service_role;

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
  v_limit integer := case when p_scope = 'private_message' then 30 else 12 end;
  v_count integer;
  v_started timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_scope not in ('private_message', 'chat_image', 'profile_image') then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_SCOPE';
  end if;
  insert into public.content_guard_rate_limits(user_id, scope, window_started_at, request_count, updated_at)
  values (p_user_id, p_scope, v_now, 1, v_now)
  on conflict (user_id, scope) do update
  set window_started_at = case
        when public.content_guard_rate_limits.window_started_at <= v_now - v_window
          then v_now else public.content_guard_rate_limits.window_started_at end,
      request_count = case
        when public.content_guard_rate_limits.window_started_at <= v_now - v_window
          then 1 else public.content_guard_rate_limits.request_count + 1 end,
      updated_at = v_now
  returning request_count, window_started_at into v_count, v_started;
  return jsonb_build_object('allowed', v_count <= v_limit, 'request_count', v_count,
    'retry_after_seconds', case when v_count <= v_limit then 0 else greatest(1,
      ceil(extract(epoch from (v_started + v_window - v_now)))::integer) end);
end;
$$;

revoke all on function public.rpc_service_consume_content_guard_rate_limit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_consume_content_guard_rate_limit(uuid, text)
  to service_role;
