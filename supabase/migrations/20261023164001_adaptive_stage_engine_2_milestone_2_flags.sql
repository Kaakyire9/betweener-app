begin;

alter table private.adaptive_stage_v2_flags
  add column if not exists adaptive_stage_m2_enabled boolean not null default false,
  add column if not exists adaptive_stage_m2_stage_intelligence_enabled boolean not null default false,
  add column if not exists adaptive_stage_m2_focus_engine_enabled boolean not null default false,
  add column if not exists adaptive_stage_m2_morph_enabled boolean not null default false,
  add column if not exists adaptive_stage_m2_screen_layouts_enabled boolean not null default false,
  add column if not exists adaptive_stage_m2_quick_connect_choreography_enabled boolean not null default false;

update private.adaptive_stage_v2_flags
set adaptive_stage_m2_enabled = false,
    adaptive_stage_m2_stage_intelligence_enabled = false,
    adaptive_stage_m2_focus_engine_enabled = false,
    adaptive_stage_m2_morph_enabled = false,
    adaptive_stage_m2_screen_layouts_enabled = false,
    adaptive_stage_m2_quick_connect_choreography_enabled = false
where id = true;

alter table private.adaptive_stage_v2_flags
  drop constraint if exists adaptive_stage_m2_subflags_require_master;
alter table private.adaptive_stage_v2_flags
  add constraint adaptive_stage_m2_subflags_require_master check (
    adaptive_stage_m2_enabled
    or not (
      adaptive_stage_m2_stage_intelligence_enabled
      or adaptive_stage_m2_focus_engine_enabled
      or adaptive_stage_m2_morph_enabled
      or adaptive_stage_m2_screen_layouts_enabled
      or adaptive_stage_m2_quick_connect_choreography_enabled
    )
  );

comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_enabled is
  'Master Milestone 2 gate. Default off in every environment until M1A device acceptance passes.';
comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_stage_intelligence_enabled is
  'Deterministic editorial recommendation gate. Requires the M2 master gate.';
comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_focus_engine_enabled is
  'Focus scoring and hysteresis gate. Requires the M2 master gate.';
comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_morph_enabled is
  'Stable-identity stage morph gate. Requires the M2 master gate.';
comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_screen_layouts_enabled is
  'Content-first screen layout gate. Requires the M2 master gate.';
comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_quick_connect_choreography_enabled is
  'Public-safe Quick Connect choreography gate. Requires the M2 master gate.';

revoke all on table private.adaptive_stage_v2_flags from public, anon, authenticated;
grant select, update on table private.adaptive_stage_v2_flags to service_role;

commit;
