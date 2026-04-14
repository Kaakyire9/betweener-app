-- Verified recovery sessions for automatic account restoration.
-- A recovery session is created only after the person proves phone ownership
-- with a successful verification code check. Recovery options must then be
-- loaded from this short-lived session instead of a raw phone lookup.

create table if not exists public.account_recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  recovery_token uuid not null unique default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  conflicting_phone_number text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default (timezone('utc'::text, now()) + interval '20 minutes'),
  dispatch_count integer not null default 0,
  last_dispatched_at timestamptz,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists account_recovery_sessions_requester_idx
  on public.account_recovery_sessions (requester_user_id, created_at desc);

create index if not exists account_recovery_sessions_owner_idx
  on public.account_recovery_sessions (owner_user_id, created_at desc);

alter table public.account_recovery_sessions enable row level security;

revoke all on public.account_recovery_sessions from anon, authenticated;

drop function if exists public.rpc_get_account_recovery_options(text);

create or replace function public.rpc_get_account_recovery_options(
  p_recovery_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_session public.account_recovery_sessions%rowtype;
  v_owner_user_id uuid;
  v_owner_profile_id uuid;
  v_owner_name text;
  v_owner_email text;
  v_email_hint text;
  v_email_local text;
  v_email_domain text;
  v_methods text[] := array[]::text[];
  v_primary_method text;
  v_merge public.merged_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_recovery_token is null then
    raise exception 'recovery token is required';
  end if;

  select *
    into v_session
  from public.account_recovery_sessions ars
  where ars.recovery_token = p_recovery_token
    and ars.requester_user_id = auth.uid()
    and ars.expires_at > timezone('utc'::text, now())
  order by ars.created_at desc
  limit 1;

  if v_session.id is null then
    return jsonb_build_object(
      'found', false,
      'message', 'Recovery session expired or was not found.',
      'sign_in_methods', '[]'::jsonb
    );
  end if;

  v_owner_user_id := v_session.owner_user_id;
  v_owner_profile_id := v_session.owner_profile_id;

  select nullif(btrim(coalesce(p.full_name, '')), '')
    into v_owner_name
  from public.profiles p
  where p.id = v_owner_profile_id
  limit 1;

  select *
    into v_merge
  from public.merged_accounts ma
  where ma.source_user_id = v_owner_user_id
    and ma.status = 'active'
  limit 1;

  if v_merge.source_user_id is not null then
    v_owner_user_id := v_merge.target_user_id;
    v_owner_profile_id := v_merge.target_profile_id;

    select nullif(btrim(coalesce(p.full_name, '')), '')
      into v_owner_name
    from public.profiles p
    where p.id = v_owner_profile_id
    limit 1;
  end if;

  select u.email
    into v_owner_email
  from auth.users u
  where u.id = v_owner_user_id
  limit 1;

  if v_owner_email is not null and position('@' in v_owner_email) > 1 then
    v_email_local := split_part(v_owner_email, '@', 1);
    v_email_domain := split_part(v_owner_email, '@', 2);
    v_email_hint :=
      left(v_email_local, 1)
      || repeat('*', greatest(char_length(v_email_local) - 1, 2))
      || '@'
      || left(v_email_domain, 1)
      || repeat('*', greatest(char_length(v_email_domain) - 3, 2))
      || right(v_email_domain, 2);
  end if;

  select coalesce(
    array_agg(distinct normalized.provider order by normalized.provider),
    array[]::text[]
  )
    into v_methods
  from (
    select
      case lower(coalesce(i.provider, ''))
        when 'google' then 'google'
        when 'apple' then 'apple'
        when 'email' then 'email'
        else null
      end as provider
    from auth.identities i
    where i.user_id = v_owner_user_id
  ) normalized
  where normalized.provider is not null;

  if v_owner_email is not null and not ('email' = any(v_methods)) then
    v_methods := array_append(v_methods, 'email');
  end if;

  v_primary_method := case
    when 'google' = any(v_methods) then 'google'
    when 'apple' = any(v_methods) then 'apple'
    when 'email' = any(v_methods) then 'email'
    else null
  end;

  return jsonb_build_object(
    'found', true,
    'phone_number', v_session.conflicting_phone_number,
    'display_name', split_part(coalesce(v_owner_name, ''), ' ', 1),
    'email_hint', v_email_hint,
    'sign_in_methods', to_jsonb(coalesce(v_methods, array[]::text[])),
    'primary_method', v_primary_method,
    'is_merged', (v_merge.source_user_id is not null),
    'merge_case_id', v_merge.merge_case_id,
    'recovery_token', v_session.recovery_token,
    'message',
      case
        when v_merge.source_user_id is not null then
          'We verified your phone. That number now routes to the kept Betweener account.'
        else
          'We verified your phone. You can now restore the older Betweener account safely.'
      end
  );
end;
$$;

revoke all on function public.rpc_get_account_recovery_options(uuid) from public;
grant execute on function public.rpc_get_account_recovery_options(uuid) to authenticated;
