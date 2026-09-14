with checks as (
  select
    to_regprocedure(
      'public.rpc_host_control_live_music_v1(uuid,text,uuid,uuid,numeric,text,uuid)'
    ) is not null as public_control_present,
    to_regprocedure(
      'public.live_odo_host_music_control_base_10f_v1(uuid,text,uuid,uuid,numeric,text,uuid)'
    ) is not null as compatibility_boundary_present,
    to_regprocedure(
      'public.rpc_host_control_live_music_without_always_on_10f_v1(uuid,text,uuid,uuid,numeric,text,uuid)'
    ) is not null as core_control_present,
    not has_function_privilege(
      'authenticated',
      'public.live_odo_host_music_control_base_10f_v1(uuid,text,uuid,uuid,numeric,text,uuid)',
      'execute'
    ) as compatibility_boundary_private
)
select
  *,
  public_control_present
    and compatibility_boundary_present
    and core_control_present
    and compatibility_boundary_private as healthy
from checks;
