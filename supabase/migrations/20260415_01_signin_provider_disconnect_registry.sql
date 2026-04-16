-- Treat disconnected social providers as a Betweener auth policy, not just a
-- best-effort unlink call. This lets the app refuse future Google/Apple sign-ins
-- for the same account until the user explicitly reconnects that provider.

create table if not exists public.account_disconnected_signin_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'apple')),
  active boolean not null default true,
  disconnected_at timestamptz not null default timezone('utc'::text, now()),
  reconnected_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists idx_account_disconnected_signin_provider_active
  on public.account_disconnected_signin_providers (user_id, provider)
  where active = true;

alter table public.account_disconnected_signin_providers enable row level security;

drop policy if exists "No direct reads for disconnected signin providers" on public.account_disconnected_signin_providers;
create policy "No direct reads for disconnected signin providers"
  on public.account_disconnected_signin_providers
  for select
  using (false);

drop policy if exists "No direct writes for disconnected signin providers" on public.account_disconnected_signin_providers;
create policy "No direct writes for disconnected signin providers"
  on public.account_disconnected_signin_providers
  for all
  using (false)
  with check (false);

create or replace function public.rpc_get_disconnected_signin_providers()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  return coalesce(
    (
      select array_agg(provider order by provider)
      from public.account_disconnected_signin_providers
      where user_id = v_user_id
        and active = true
    ),
    array[]::text[]
  );
end;
$$;

create or replace function public.rpc_mark_signin_provider_disconnected(
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider, '')));
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_provider not in ('google', 'apple') then
    raise exception 'unsupported provider';
  end if;

  insert into public.account_disconnected_signin_providers (
    user_id,
    provider,
    active,
    disconnected_at,
    reconnected_at,
    updated_at
  )
  values (
    v_user_id,
    v_provider,
    true,
    timezone('utc'::text, now()),
    null,
    timezone('utc'::text, now())
  )
  on conflict (user_id, provider) where active = true
  do update
  set
    active = true,
    disconnected_at = timezone('utc'::text, now()),
    reconnected_at = null,
    updated_at = timezone('utc'::text, now());

  return true;
end;
$$;

create or replace function public.rpc_clear_signin_provider_disconnected(
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider, '')));
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_provider not in ('google', 'apple') then
    raise exception 'unsupported provider';
  end if;

  update public.account_disconnected_signin_providers
  set
    active = false,
    reconnected_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  where user_id = v_user_id
    and provider = v_provider
    and active = true;

  return true;
end;
$$;

create or replace function public.rpc_is_signin_provider_disconnected(
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider, '')));
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_provider not in ('google', 'apple') then
    return false;
  end if;

  return exists (
    select 1
    from public.account_disconnected_signin_providers
    where user_id = v_user_id
      and provider = v_provider
      and active = true
  );
end;
$$;

revoke all on function public.rpc_get_disconnected_signin_providers() from public;
grant execute on function public.rpc_get_disconnected_signin_providers() to authenticated;

revoke all on function public.rpc_mark_signin_provider_disconnected(text) from public;
grant execute on function public.rpc_mark_signin_provider_disconnected(text) to authenticated;

revoke all on function public.rpc_clear_signin_provider_disconnected(text) from public;
grant execute on function public.rpc_clear_signin_provider_disconnected(text) to authenticated;

revoke all on function public.rpc_is_signin_provider_disconnected(text) from public;
grant execute on function public.rpc_is_signin_provider_disconnected(text) to authenticated;
