-- Betweener Live Phase 10F: system-owned session authority.
-- A system-created session has no fabricated auth/profile creator. Ownership,
-- programme control and moderation remain separate concerns.

begin;

alter table public.live_sessions
  add column if not exists ownership_type text not null default 'human',
  add column if not exists system_session_kind text;

alter table public.live_sessions
  alter column created_by_user_id drop not null,
  alter column created_by_profile_id drop not null;

alter table public.live_sessions
  drop constraint if exists live_sessions_ownership_type_valid,
  drop constraint if exists live_sessions_creator_ownership_valid;

alter table public.live_sessions
  add constraint live_sessions_ownership_type_valid
    check (ownership_type in ('human','system')),
  add constraint live_sessions_creator_ownership_valid check (
    (
      ownership_type = 'human'
      and created_by_user_id is not null
      and created_by_profile_id is not null
      and system_session_kind is null
    )
    or (
      ownership_type = 'system'
      and created_by_user_id is null
      and created_by_profile_id is null
      and system_session_kind = 'odo_always_on_quick_connect'
      and format = 'quick_connect'
      and context_type in ('invite_only','global','diaspora')
    )
  );

create unique index live_sessions_phase10f_system_provider_unique
  on public.live_sessions(system_session_kind, provider, provider_call_id)
  where ownership_type = 'system';

comment on column public.live_sessions.ownership_type is
  'Session ownership. Human sessions retain creator FKs; constrained system sessions have no fake user.';
comment on column public.live_sessions.system_session_kind is
  'Allowlisted server-created Live kind. Never interpreted as a human role or moderation identity.';

-- Reserve SYSTEM as a controller source for future server recovery and Phase
-- 10G. Always-On starts with ODO; SYSTEM is not a client-grantable source.
alter table public.live_odo_show_sessions
  drop constraint if exists live_odo_show_sessions_control_source_check,
  drop constraint if exists live_odo_show_control_lease_valid;
alter table public.live_odo_show_sessions
  add constraint live_odo_show_sessions_control_source_check check (
    control_source in ('odo','mobile_host','studio_host','system')
  ),
  add constraint live_odo_show_control_lease_valid check (
    (control_source in ('odo','system') and control_user_id is null)
    or (control_source in ('mobile_host','studio_host') and control_user_id is not null)
  );

alter table public.live_music_session_state
  drop constraint if exists live_music_session_state_control_source_check;
alter table public.live_music_session_state
  add constraint live_music_session_state_control_source_check check (
    control_source in ('odo','mobile_host','studio_host','system')
  );

create or replace function public.live_is_odo_always_on_session_v1(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select exists (
    select 1 from public.live_sessions session
    where session.id = p_session_id
      and session.ownership_type = 'system'
      and session.system_session_kind = 'odo_always_on_quick_connect'
      and session.created_by_user_id is null
      and session.created_by_profile_id is null
      and session.format = 'quick_connect'
  );
$$;

revoke all on function public.live_is_odo_always_on_session_v1(uuid)
from public, anon, authenticated, service_role;

commit;
