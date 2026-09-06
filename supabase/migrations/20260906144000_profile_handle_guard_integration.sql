-- Forward correction for environments that applied the initial handle
-- migration before its profile-guard integration was finalized.

begin;

create or replace function public.profile_handle_validation_reason(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_username text := public.profile_handle_normalize(p_username);
  v_skeleton text := public.profile_handle_skeleton(p_username);
  v_reason text;
  v_assessment jsonb;
begin
  if char_length(v_username) < 3 then return 'too_short'; end if;
  if char_length(v_username) > 24 then return 'too_long'; end if;
  if v_username !~ '^[a-z0-9]+([._][a-z0-9]+)*$' then return 'invalid_format'; end if;
  if v_username !~ '[a-z]' then return 'letters_required'; end if;

  select reservation.reason
  into v_reason
  from public.profile_handle_reservations reservation
  where reservation.normalized_username = v_username
     or reservation.username_skeleton = v_skeleton
     or v_username like reservation.normalized_username || '.%'
     or left(v_username, char_length(reservation.normalized_username) + 1)
       = reservation.normalized_username || '_'
     or (
       reservation.reason = 'brand_identity'
       and v_skeleton like reservation.username_skeleton || '%'
     )
  order by char_length(reservation.normalized_username) desc
  limit 1;

  if v_reason is not null then return 'reserved'; end if;

  v_assessment := public.profile_guard_assess(replace(replace(v_username, '.', ' '), '_', ' '));
  if coalesce(v_assessment->>'decision', '') <> 'ALLOW' then return 'not_allowed'; end if;

  return null;
end;
$$;

create or replace function public.profile_handle_prevent_unmanaged_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_managed_profile_id text := current_setting('app.profile_handle_profile_id', true);
  v_trusted_operator boolean := auth.role() = 'service_role'
    or (
      session_user = 'postgres'
      and current_user = 'postgres'
      and coalesce(auth.role(), '') not in ('authenticated', 'anon')
    );
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.username), '') is null
       and new.username_searchable = false
       and new.username_claimed_at is null
       and new.username_changed_at is null then
      return new;
    end if;

    if not v_trusted_operator then
      raise exception using errcode = '42501', message = 'PROFILE_HANDLE_RPC_REQUIRED';
    end if;

    return new;
  end if;

  if new.username is not distinct from old.username
     and new.username_searchable is not distinct from old.username_searchable
     and new.username_claimed_at is not distinct from old.username_claimed_at
     and new.username_changed_at is not distinct from old.username_changed_at then
    return new;
  end if;

  if not v_trusted_operator and v_managed_profile_id is distinct from new.id::text then
    raise exception using errcode = '42501', message = 'PROFILE_HANDLE_RPC_REQUIRED';
  end if;

  return new;
end;
$$;

commit;

-- Keep the profiles trigger lock isolated from function replacement work.
begin;

set local lock_timeout = '5s';

drop trigger if exists profile_handle_prevent_unmanaged_write on public.profiles;
drop trigger if exists profile_control_handle_write on public.profiles;
create trigger profile_control_handle_write
before insert or update of username, username_searchable, username_claimed_at, username_changed_at
on public.profiles
for each row execute function public.profile_handle_prevent_unmanaged_write();

commit;

begin;

do $migration$
declare
  v_definition text;
  v_marker text := $marker$  if v_trusted_write then return new; end if;

  v_public_content_changed :=$marker$;
  v_replacement text := $replacement$  if v_trusted_write then return new; end if;

  if tg_op = 'UPDATE'
     and current_setting('app.profile_handle_profile_id', true) = new.id::text
     and auth.uid() = new.user_id
     and (
       to_jsonb(new) - array[
         'username', 'username_searchable', 'username_claimed_at',
         'username_changed_at', 'updated_at'
       ]::text[]
     ) = (
       to_jsonb(old) - array[
         'username', 'username_searchable', 'username_claimed_at',
         'username_changed_at', 'updated_at'
       ]::text[]
     )
     and public.profile_handle_validation_reason(new.username) is null then
    return new;
  end if;

  v_public_content_changed :=$replacement$;
begin
  v_definition := pg_get_functiondef(
    'public.profile_guard_prevent_direct_public_text_write()'::regprocedure
  );

  if position('app.profile_handle_profile_id' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'PROFILE_HANDLE_GUARD_PATCH_TARGET_NOT_FOUND';
    end if;
    execute replace(v_definition, v_marker, v_replacement);
  end if;
end;
$migration$;

revoke all on function public.profile_handle_validation_reason(text)
  from public, anon, authenticated;
revoke all on function public.profile_handle_prevent_unmanaged_write()
  from public, anon, authenticated;
revoke all on function public.profile_guard_prevent_direct_public_text_write()
  from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
