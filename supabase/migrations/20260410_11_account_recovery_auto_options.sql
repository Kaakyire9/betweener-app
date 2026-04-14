-- Automatic recovery hints for phone-conflict flows.
-- This lets the app route someone back into the older account safely,
-- without exposing raw account data or forcing them into a support queue first.

create or replace function public.rpc_get_account_recovery_options(
  p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone_number, '')), '');
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

  if v_phone is null then
    raise exception 'phone number is required';
  end if;

  select
    p.user_id,
    p.id,
    nullif(btrim(coalesce(p.full_name, '')), '')
  into
    v_owner_user_id,
    v_owner_profile_id,
    v_owner_name
  from public.profiles p
  where p.phone_number = v_phone
    and p.phone_verified = true
    and p.user_id is not null
    and p.user_id <> auth.uid()
  order by
    case
      when coalesce(p.deleted_at, null) is null and coalesce(p.is_active, true) = true then 0
      else 1
    end,
    p.updated_at desc,
    p.created_at desc
  limit 1;

  if v_owner_user_id is null then
    return jsonb_build_object(
      'found', false,
      'phone_number', v_phone,
      'sign_in_methods', '[]'::jsonb
    );
  end if;

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
    'phone_number', v_phone,
    'display_name', split_part(coalesce(v_owner_name, ''), ' ', 1),
    'email_hint', v_email_hint,
    'sign_in_methods', to_jsonb(coalesce(v_methods, array[]::text[])),
    'primary_method', v_primary_method,
    'is_merged', (v_merge.source_user_id is not null),
    'merge_case_id', v_merge.merge_case_id,
    'message',
      case
        when v_merge.source_user_id is not null then
          'This phone number belongs to an older Betweener account that was already merged into the kept account.'
        else
          'This phone number already protects an older Betweener account.'
      end
  );
end;
$$;

revoke all on function public.rpc_get_account_recovery_options(text) from public;
grant execute on function public.rpc_get_account_recovery_options(text) to authenticated;
