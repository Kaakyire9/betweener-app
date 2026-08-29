-- Private Spark activation happens after the public introduction returns both
-- participants to the audience. Update the function actually owned by the
-- live_participants_transition_guard so the consent transaction can atomically
-- move every server-approved available state into the private room.

begin;

create or replace function public.enforce_live_participant_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state is not distinct from old.state then return new; end if;
  if not (
    (old.state = 'invited' and new.state in ('confirmed','waitlisted','backstage','audience','removed','banned'))
    or (old.state = 'confirmed' and new.state in ('waitlisted','backstage','audience','left','removed','banned'))
    or (old.state = 'waitlisted' and new.state in ('confirmed','backstage','audience','left','removed','banned'))
    or (old.state = 'backstage' and new.state in ('audience','on_stage','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'audience' and new.state in ('stage_requested','on_stage','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'stage_requested' and new.state in ('backstage','audience','on_stage','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'on_stage' and new.state in ('backstage','audience','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'private_spark' and new.state in ('on_stage','audience','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'temporarily_disconnected' and new.state in ('backstage','audience','stage_requested','on_stage','private_spark','left','removed','banned'))
    or (old.state = 'left' and new.state in ('confirmed','audience','banned'))
    or (old.state = 'removed' and new.state = 'banned')
  ) then
    raise exception 'invalid_live_participant_transition:%:%', old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

-- This misspelled/unreferenced function was introduced by the original
-- handoff migration. No trigger calls it; retaining it risks future drift.
drop function if exists public.enforce_live_participant_state_transition();

commit;
