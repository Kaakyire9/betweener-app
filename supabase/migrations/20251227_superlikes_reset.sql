-- Daily reset: set superlikes_left to 1 for users who are at 0 and haven't been reset today
create or replace function public.reset_daily_superlikes()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.profiles
  set superlikes_left = 1,
      superlikes_reset_at = now(),
      updated_at = now()
  where (superlikes_left <= 0 or superlikes_reset_at is null or superlikes_reset_at < date_trunc('day', now()));
end;
$$;

grant execute on function public.reset_daily_superlikes() to authenticated;
