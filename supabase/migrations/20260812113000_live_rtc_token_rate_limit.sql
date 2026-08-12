-- Phase 1: server-derived Live RTC token rate-limit identity.
-- Callers cannot choose another user's key or alter the budget/window.

begin;

create or replace function public.rpc_bump_live_rtc_token_rate_limit(p_session_id uuid)
returns table(
  allowed boolean,
  current_count integer,
  window_bucket_out bigint
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_session_id is null then
    raise exception 'live_session_required' using errcode = '22023';
  end if;

  return query
  select result.allowed, result.current_count, result.window_bucket_out
  from public.bump_rate_limit(
    'live-rtc-token:' || auth.uid()::text || ':' || p_session_id::text,
    60,
    20
  ) result;
end;
$$;

revoke all on function public.rpc_bump_live_rtc_token_rate_limit(uuid)
from public, anon, authenticated;

grant execute on function public.rpc_bump_live_rtc_token_rate_limit(uuid)
to authenticated;

commit;
