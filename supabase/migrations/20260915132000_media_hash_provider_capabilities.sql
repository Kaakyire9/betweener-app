-- Honest, provider-neutral unsafe-media hash coverage state. No external feed is connected here.

create table if not exists public.media_hash_provider_capabilities (
  provider_id text primary key,
  provider_kind text not null check (provider_kind in ('INTERNAL_EXACT', 'TEST', 'EXTERNAL')),
  exact_hash_matching boolean not null default false,
  perceptual_matching boolean not null default false,
  video_matching boolean not null default false,
  external_provider_connected boolean not null default false,
  provider_status text not null check (provider_status in (
    'READY', 'DEGRADED', 'STALE', 'HASH_PROVIDER_NOT_CONNECTED', 'DISABLED'
  )),
  last_successful_sync timestamptz,
  feed_version text,
  stale_after timestamptz,
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  check (provider_kind = 'EXTERNAL' or not external_provider_connected),
  check (external_provider_connected or provider_status <> 'READY' or provider_kind <> 'EXTERNAL')
);

insert into public.media_hash_provider_capabilities(
  provider_id, provider_kind, exact_hash_matching, perceptual_matching,
  video_matching, external_provider_connected, provider_status, enabled
) values (
  'betweener-exact-sha256', 'INTERNAL_EXACT', true, false,
  false, false, 'HASH_PROVIDER_NOT_CONNECTED', true
)
on conflict (provider_id) do update set
  provider_kind = excluded.provider_kind,
  exact_hash_matching = excluded.exact_hash_matching,
  perceptual_matching = excluded.perceptual_matching,
  video_matching = excluded.video_matching,
  external_provider_connected = false,
  provider_status = 'HASH_PROVIDER_NOT_CONNECTED',
  last_successful_sync = null,
  feed_version = null,
  stale_after = null,
  updated_at = timezone('utc', now());

alter table public.media_hash_provider_capabilities enable row level security;
revoke all on table public.media_hash_provider_capabilities
  from public, anon, authenticated;
grant select, insert, update, delete on table public.media_hash_provider_capabilities
  to service_role;

create or replace function public.rpc_service_get_media_hash_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select case when auth.role() <> 'service_role' then
    jsonb_build_object('authorized', false)
  else jsonb_build_object(
    'authorized', true,
    'exact_hash_matching', coalesce(bool_or(exact_hash_matching and enabled), false),
    'perceptual_matching', coalesce(bool_or(perceptual_matching and enabled), false),
    'video_matching', coalesce(bool_or(video_matching and enabled), false),
    'external_provider_connected', coalesce(bool_or(external_provider_connected and enabled), false),
    'provider_status', case
      when coalesce(bool_or(external_provider_connected and enabled), false) then 'READY'
      else 'HASH_PROVIDER_NOT_CONNECTED'
    end,
    'last_successful_sync', max(last_successful_sync),
    'feed_version', max(feed_version),
    'stale_after', max(stale_after)
  ) end
  from public.media_hash_provider_capabilities;
$$;

revoke all on function public.rpc_service_get_media_hash_capabilities()
  from public, anon, authenticated;
grant execute on function public.rpc_service_get_media_hash_capabilities()
  to service_role;

create or replace function public.rpc_service_configure_test_hash_provider(
  p_enabled boolean,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if lower(coalesce(p_environment, '')) not in ('staging', 'ci', 'test') then
    raise exception using errcode = '22023', message = 'TEST_PROVIDER_NON_PRODUCTION_ONLY';
  end if;
  insert into public.media_hash_provider_capabilities(
    provider_id, provider_kind, exact_hash_matching, perceptual_matching,
    video_matching, external_provider_connected, provider_status, enabled
  ) values ('synthetic-benign-test', 'TEST', true, false, false, false,
    case when p_enabled then 'HASH_PROVIDER_NOT_CONNECTED' else 'DISABLED' end, p_enabled)
  on conflict (provider_id) do update set
    exact_hash_matching = true,
    perceptual_matching = false,
    video_matching = false,
    external_provider_connected = false,
    provider_status = case when p_enabled then 'HASH_PROVIDER_NOT_CONNECTED' else 'DISABLED' end,
    enabled = p_enabled,
    updated_at = timezone('utc', now());
  return true;
end;
$$;

revoke all on function public.rpc_service_configure_test_hash_provider(boolean, text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_configure_test_hash_provider(boolean, text)
  to service_role;
