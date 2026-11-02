-- Betweener Live product release gate.
--
-- The product defaults off in every environment. Staging must be enabled by a
-- separate audited data operation after this migration is applied. Production
-- therefore stays closed even when an older mobile build or deep link reaches
-- a Live RPC directly.

begin;

alter table public.live_odo_configuration
  add column if not exists live_product_enabled boolean not null default false;

comment on column public.live_odo_configuration.live_product_enabled is
  'Master product gate. False blocks Live visibility, session activation, participant admission and media-token issuance.';

create or replace function public.live_product_is_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select coalesce((
    select configuration.live_product_enabled
    from public.live_odo_configuration configuration
    where configuration.id = true
  ), false);
$$;

revoke all on function public.live_product_is_enabled_v1()
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_product_availability_v1()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  return public.live_product_is_enabled_v1();
end;
$$;

revoke all on function public.rpc_get_live_product_availability_v1()
from public, anon;
grant execute on function public.rpc_get_live_product_availability_v1()
to authenticated, service_role;

create or replace function public.enforce_live_session_product_gate_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if public.live_product_is_enabled_v1() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'live_product_disabled' using errcode = '55000';
  end if;

  if new.status is distinct from old.status
     and new.status in (
       'scheduled', 'waiting_for_quorum', 'confirmed', 'backstage', 'live'
     ) then
    raise exception 'live_product_disabled' using errcode = '55000';
  end if;

  -- Existing sessions may still be cancelled or ended safely while disabled.
  return new;
end;
$$;

revoke all on function public.enforce_live_session_product_gate_v1()
from public, anon, authenticated, service_role;

drop trigger if exists live_sessions_product_gate_v1 on public.live_sessions;
create trigger live_sessions_product_gate_v1
before insert or update of status on public.live_sessions
for each row execute function public.enforce_live_session_product_gate_v1();

create or replace function public.enforce_live_participant_product_gate_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if public.live_product_is_enabled_v1() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'live_product_disabled' using errcode = '55000';
  end if;

  if new.state is distinct from old.state
     and new.state in (
       'confirmed', 'backstage', 'audience', 'stage_requested', 'on_stage',
       'private_spark', 'temporarily_disconnected'
     ) then
    raise exception 'live_product_disabled' using errcode = '55000';
  end if;

  -- Leaving, removal and safety cleanup remain available while disabled.
  return new;
end;
$$;

revoke all on function public.enforce_live_participant_product_gate_v1()
from public, anon, authenticated, service_role;

drop trigger if exists live_participants_product_gate_v1 on public.live_participants;
create trigger live_participants_product_gate_v1
before insert or update of state on public.live_participants
for each row execute function public.enforce_live_participant_product_gate_v1();

-- Keep the environment's current audience policy intact. Production can lag
-- staging by several Live milestones, so replacing this function with one
-- environment's body would silently change access semantics. Inject only the
-- master-gate check into the existing definition.
do $$
declare
  v_definition text;
  v_begin_position integer;
  v_begin_marker constant text := E'\nbegin\n';
begin
  select pg_get_functiondef(
    'public.can_view_live_session(uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('public.live_product_is_enabled_v1()' in v_definition) > 0 then
    return;
  end if;

  v_begin_position := strpos(lower(v_definition), v_begin_marker);
  if v_begin_position = 0 then
    raise exception 'can_view_live_session_definition_unrecognized';
  end if;

  v_definition := overlay(
    v_definition
    placing E'\nbegin\n  if not public.live_product_is_enabled_v1() then return false; end if;\n'
    from v_begin_position
    for char_length(v_begin_marker)
  );
  execute v_definition;
end;
$$;

commit;
