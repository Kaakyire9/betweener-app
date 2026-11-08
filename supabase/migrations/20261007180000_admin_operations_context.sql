-- Server-authoritative context for the modular Betweener Operations console.

begin;

create or replace function public.rpc_get_my_admin_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_role text;
  v_capabilities jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'isAdmin', false,
      'role', null,
      'capabilities', v_capabilities
    );
  end if;

  select ia.role
    into v_role
  from public.internal_admins ia
  where ia.user_id = auth.uid();

  if v_role is null then
    return jsonb_build_object(
      'isAdmin', false,
      'role', null,
      'capabilities', v_capabilities
    );
  end if;

  v_capabilities := case v_role
    when 'super_admin' then jsonb_build_array(
      'overview', 'community', 'editorial', 'live', 'trust', 'accounts', 'commerce'
    )
    when 'operations' then jsonb_build_array(
      'overview', 'community', 'editorial', 'live', 'commerce'
    )
    when 'moderation' then jsonb_build_array(
      'overview', 'community', 'editorial', 'trust'
    )
    when 'support' then jsonb_build_array(
      'overview', 'accounts'
    )
    else '[]'::jsonb
  end;

  return jsonb_build_object(
    'isAdmin', true,
    'role', v_role,
    'capabilities', v_capabilities
  );
end;
$$;

revoke all on function public.rpc_get_my_admin_context() from public, anon;
grant execute on function public.rpc_get_my_admin_context() to authenticated, service_role;

comment on function public.rpc_get_my_admin_context() is
  'Returns the authenticated user''s server-authoritative internal role and UI capabilities.';

commit;
