-- Betweener Live Phase 10E configuration authority.
-- Replaces Phase 10B's deliberate music prohibition only when the separately
-- gated 10E Show Director and base Odo authority are both enabled.

begin;

alter table public.live_odo_configuration
  drop constraint if exists live_odo_phase10b_human_loop_invariant,
  drop constraint if exists live_odo_phase10e_authority_invariant;

alter table public.live_odo_configuration
  add constraint live_odo_phase10e_authority_invariant check (
    shadow_mode
    and not autopilot_enabled
    and (
      copilot_enabled
      or (
        not conversation_spark_enabled
        and not audience_pulse_enabled
        and not pair_narration_enabled
        and not scene_suggestions_enabled
        and not transition_copy_enabled
      )
    )
    and (not music_enabled or (odo_enabled and show_director_enabled))
    and (not music_auto_enabled or music_enabled)
    and (not music_ducking_enabled or music_enabled)
  );

commit;
