-- Ensure one profile row per auth user.
-- Required for PostgREST/Supabase upsert(onConflict: 'user_id') to work reliably.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'user_id'
  ) then
    -- Add a unique constraint if it's missing.
    if not exists (
      select 1
      from pg_constraint
      where conname = 'profiles_user_id_key'
        and conrelid = 'public.profiles'::regclass
    ) then
      alter table public.profiles
        add constraint profiles_user_id_key unique (user_id);
    end if;
  end if;
end;
$$;

