begin;

alter table private.adaptive_stage_v2_flags
  add column if not exists adaptive_stage_m2_studio_preview_enabled boolean not null default false;

update private.adaptive_stage_v2_flags
set adaptive_stage_m2_studio_preview_enabled = false
where id = true;

alter table private.adaptive_stage_v2_flags
  drop constraint if exists adaptive_stage_m2_subflags_require_master;
alter table private.adaptive_stage_v2_flags
  add constraint adaptive_stage_m2_subflags_require_master check (
    adaptive_stage_m2_enabled
    or not (
      adaptive_stage_m2_studio_preview_enabled
      or adaptive_stage_m2_stage_intelligence_enabled
      or adaptive_stage_m2_focus_engine_enabled
      or adaptive_stage_m2_morph_enabled
      or adaptive_stage_m2_screen_layouts_enabled
      or adaptive_stage_m2_quick_connect_choreography_enabled
    )
  );

comment on column private.adaptive_stage_v2_flags.adaptive_stage_m2_studio_preview_enabled is
  'Internal Studio-only M2 visualization gate. It grants no Program, native, or compositor render authority.';

revoke all on table private.adaptive_stage_v2_flags from public, anon, authenticated;
grant select, update on table private.adaptive_stage_v2_flags to service_role;

commit;
