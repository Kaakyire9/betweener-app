-- Persist the terms/privacy acceptance asserted by the authenticated app entry
-- flow before members can publish user-generated content.

create table if not exists public.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  app_version text,
  source text not null default 'mobile_entry',
  accepted_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, terms_version, privacy_version)
);
alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from public, anon, authenticated;
grant select, insert, update, delete on table public.legal_acceptances to service_role;

create or replace function public.rpc_record_current_legal_acceptance_v1(
  p_terms_version text,
  p_privacy_version text,
  p_app_version text default null
)
returns boolean
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_terms_version, '')), '') is null
     or nullif(btrim(coalesce(p_privacy_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_LEGAL_VERSION';
  end if;
  insert into public.legal_acceptances(
    user_id, terms_version, privacy_version, app_version, source
  ) values (
    auth.uid(), left(p_terms_version, 80), left(p_privacy_version, 80),
    left(nullif(btrim(coalesce(p_app_version, '')), ''), 40), 'mobile_entry'
  ) on conflict (user_id, terms_version, privacy_version) do nothing;
  return true;
end;
$$;
revoke all on function public.rpc_record_current_legal_acceptance_v1(text, text, text)
  from public, anon;
grant execute on function public.rpc_record_current_legal_acceptance_v1(text, text, text)
  to authenticated, service_role;
