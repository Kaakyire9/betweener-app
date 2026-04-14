-- Backend-controlled provider-linking decision layer for recovered accounts.
-- This does not perform linking. It decides whether linking is already satisfied,
-- can be offered now, or is blocked because the duplicate shell still owns the identity.

create or replace function public.rpc_get_account_recovery_provider_link_plan(
  p_recovery_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session public.account_recovery_sessions%rowtype;
  v_effective_owner_user_id uuid := auth.uid();
  v_shell_profile public.profiles%rowtype;
  v_shell_provider text;
  v_shell_identities text[] := array[]::text[];
  v_restored_identities text[] := array[]::text[];
  v_action text := 'none';
  v_reason text := 'no_candidate_provider';
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_recovery_token is null then
    raise exception 'recovery token is required';
  end if;

  select *
    into v_session
  from public.account_recovery_sessions
  where recovery_token = p_recovery_token
  order by created_at desc
  limit 1;

  if v_session.id is null then
    return jsonb_build_object(
      'found', false,
      'action', 'none',
      'reason', 'recovery_session_not_found'
    );
  end if;

  select ma.target_user_id
    into v_effective_owner_user_id
  from public.merged_accounts ma
  where ma.source_user_id = v_session.owner_user_id
    and ma.status = 'active'
  limit 1;

  v_effective_owner_user_id := coalesce(v_effective_owner_user_id, v_session.owner_user_id);

  if auth.uid() <> v_effective_owner_user_id then
    return jsonb_build_object(
      'found', false,
      'action', 'none',
      'reason', 'wrong_restored_account'
    );
  end if;

  select *
    into v_shell_profile
  from public.profiles
  where user_id = v_session.requester_user_id
  limit 1;

  select coalesce(
    array_agg(distinct lower(i.provider) order by lower(i.provider)),
    array[]::text[]
  )
    into v_shell_identities
  from auth.identities i
  where i.user_id = v_session.requester_user_id
    and lower(coalesce(i.provider, '')) in ('google', 'apple', 'email');

  select coalesce(
    array_agg(distinct lower(i.provider) order by lower(i.provider)),
    array[]::text[]
  )
    into v_restored_identities
  from auth.identities i
  where i.user_id = v_effective_owner_user_id
    and lower(coalesce(i.provider, '')) in ('google', 'apple', 'email');

  v_shell_provider := lower(
    coalesce(
      nullif(v_shell_profile.last_successful_auth_provider, ''),
      nullif(v_shell_profile.created_via_provider, ''),
      case
        when cardinality(v_shell_identities) > 0 then v_shell_identities[1]
        else null
      end
    )
  );

  if v_shell_provider is null then
    v_action := 'none';
    v_reason := 'no_candidate_provider';
  elsif v_shell_provider = any(v_restored_identities) then
    v_action := 'already_linked';
    v_reason := 'provider_already_on_restored_account';
  elsif v_shell_provider = 'email' then
    v_action := 'manual_email_backup';
    v_reason := 'email_provider_needs_manual_backup_setup';
  elsif v_shell_provider = any(v_shell_identities) then
    v_action := 'blocked_by_duplicate_shell_identity';
    v_reason := 'provider_still_attached_to_duplicate_shell';
  elsif v_shell_provider in ('google', 'apple') then
    v_action := 'offer_native_link';
    v_reason := 'provider_available_for_native_link';
  else
    v_action := 'none';
    v_reason := 'unsupported_candidate_provider';
  end if;

  return jsonb_build_object(
    'found', true,
    'recovery_token', p_recovery_token,
    'shell_user_id', v_session.requester_user_id,
    'restored_user_id', v_effective_owner_user_id,
    'candidate_provider', v_shell_provider,
    'shell_identity_status', coalesce(v_shell_profile.identity_status, 'unknown'),
    'shell_identities', to_jsonb(v_shell_identities),
    'restored_identities', to_jsonb(v_restored_identities),
    'action', v_action,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.rpc_get_account_recovery_provider_link_plan(uuid) from public;
grant execute on function public.rpc_get_account_recovery_provider_link_plan(uuid) to authenticated;
