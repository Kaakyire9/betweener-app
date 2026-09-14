with function_refs as (
  select
    to_regprocedure(
      'public.rpc_host_control_live_music_v1(uuid,text,uuid,uuid,numeric,text,uuid)'
    ) as public_control,
    to_regprocedure(
      'public.live_odo_host_music_control_base_10f_v1(uuid,text,uuid,uuid,numeric,text,uuid)'
    ) as compatibility_boundary
), checks as (
  select
    public_control is not null as public_control_present,
    compatibility_boundary is not null as compatibility_boundary_present,
    coalesce(
      lower(pg_get_functiondef(compatibility_boundary::oid)) like
        '%update public.live_music_session_state%'
      and lower(pg_get_functiondef(compatibility_boundary::oid)) like
        '%insert into public.live_music_events%'
      and lower(pg_get_functiondef(compatibility_boundary::oid)) not like
        '%rpc_host_control_live_music_without_always_on_10f_v1%',
      false
    ) as core_control_present,
    not has_function_privilege(
      'authenticated',
      'public.live_odo_host_music_control_base_10f_v1(uuid,text,uuid,uuid,numeric,text,uuid)',
      'execute'
    ) as compatibility_boundary_private
  from function_refs
)
select
  *,
  public_control_present
    and compatibility_boundary_present
    and core_control_present
    and compatibility_boundary_private as healthy
from checks;
