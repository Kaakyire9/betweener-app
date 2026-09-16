-- Service-owned exact-hash denylist for confirmed illegal or otherwise banned
-- media. Populate only from a trusted safety provider or documented case.

create table if not exists public.unsafe_media_hash_blocklist (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  category text not null check (category in ('CSAM', 'NON_CONSENSUAL_INTIMATE_MEDIA', 'TERRORISM', 'OTHER_ILLEGAL')),
  source text not null,
  source_reference text,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  disabled_at timestamptz
);
alter table public.unsafe_media_hash_blocklist enable row level security;
revoke all on table public.unsafe_media_hash_blocklist from public, anon, authenticated;
grant select, insert, update, delete on table public.unsafe_media_hash_blocklist to service_role;

create or replace function public.rpc_service_match_unsafe_media_hash(p_sha256 text)
returns jsonb
language sql stable security definer
set search_path = public, pg_catalog, auth
as $$
  select case
    when auth.role() <> 'service_role' then
      jsonb_build_object('authorized', false, 'matched', false)
    else coalesce((
      select jsonb_build_object(
        'authorized', true,
        'matched', true,
        'category', blocked.category
      )
      from public.unsafe_media_hash_blocklist blocked
      where blocked.sha256 = lower(coalesce(p_sha256, ''))
        and blocked.enabled
      limit 1
    ), jsonb_build_object('authorized', true, 'matched', false))
  end;
$$;
revoke all on function public.rpc_service_match_unsafe_media_hash(text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_match_unsafe_media_hash(text)
  to service_role;
