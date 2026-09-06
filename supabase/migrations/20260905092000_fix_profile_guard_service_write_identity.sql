-- Recognize service-mediated Guard writes by the verified JWT role instead of
-- the migration/function owner. Production functions may be owned by a
-- platform role such as supabase_admin rather than postgres or service_role.

create or replace function public.profile_guard_prevent_direct_public_text_write()
returns trigger
language plpgsql
set search_path = public, pg_catalog, auth
as $$
declare
  v_trusted_write boolean := (
    auth.role() = 'service_role'
    or (session_user = 'postgres' and current_user = 'postgres')
  ) and current_setting('app.profile_guard_write', true) = 'on';
  v_public_content_changed boolean;
begin
  if tg_op = 'UPDATE' and new.profile_moderation_state is distinct from old.profile_moderation_state
     and not v_trusted_write then
    raise exception using errcode = '42501', message = 'PROFILE_MODERATION_STATE_SERVER_MANAGED';
  end if;
  if ((tg_op = 'INSERT' or new.city is distinct from old.city)
        and not public.profile_guard_structured_text_is_valid('city', new.city))
     or ((tg_op = 'INSERT' or new.region is distinct from old.region)
        and not public.profile_guard_structured_text_is_valid('region', new.region))
     or ((tg_op = 'INSERT' or new.last_ghana_visit is distinct from old.last_ghana_visit)
        and not public.profile_guard_structured_text_is_valid('last_ghana_visit', new.last_ghana_visit))
     or ((tg_op = 'INSERT' or new.location is distinct from old.location
          or new.city is distinct from old.city or new.region is distinct from old.region
          or new.current_country is distinct from old.current_country)
        and not public.profile_guard_location_is_derived(
          new.location, new.city, new.region, new.current_country)) then
    raise exception using errcode = '22023', message = 'INVALID_STRUCTURED_PROFILE_FIELD';
  end if;
  if new.profile_moderation_state <> 'CLEAR' and new.discoverable_in_vibes then
    if v_trusted_write then new.discoverable_in_vibes := false;
    else raise exception using errcode = '42501', message = 'PROFILE_NOT_PUBLICLY_ELIGIBLE';
    end if;
  end if;
  if v_trusted_write then return new; end if;

  v_public_content_changed := case when tg_op = 'INSERT' then
    concat_ws('', new.full_name, new.username, new.bio, new.occupation, new.education,
      new.looking_for, new.tribe, array_to_string(new.roots, ''), new.roots_note,
      new.height, new.exercise_frequency, new.smoking, new.drinking, new.has_children,
      new.wants_children, new.personality_type, new.love_language, new.living_situation,
      new.pets, array_to_string(new.languages_spoken, ''), new.future_ghana_plans) <> ''
      or coalesce(new.relationship_compass, '{}'::jsonb) <> '{}'::jsonb
    else new.full_name is distinct from old.full_name
      or new.username is distinct from old.username or new.bio is distinct from old.bio
      or new.occupation is distinct from old.occupation or new.education is distinct from old.education
      or new.looking_for is distinct from old.looking_for or new.tribe is distinct from old.tribe
      or new.roots is distinct from old.roots or new.roots_note is distinct from old.roots_note
      or new.height is distinct from old.height
      or new.exercise_frequency is distinct from old.exercise_frequency
      or new.smoking is distinct from old.smoking or new.drinking is distinct from old.drinking
      or new.has_children is distinct from old.has_children
      or new.wants_children is distinct from old.wants_children
      or new.personality_type is distinct from old.personality_type
      or new.love_language is distinct from old.love_language
      or new.living_situation is distinct from old.living_situation
      or new.pets is distinct from old.pets
      or new.languages_spoken is distinct from old.languages_spoken
      or new.future_ghana_plans is distinct from old.future_ghana_plans
      or new.relationship_compass is distinct from old.relationship_compass end;
  if v_public_content_changed then
    raise exception using errcode = '42501', message = 'PROFILE_GUARD_REQUIRED';
  end if;
  return new;
end;
$$;
create or replace function public.profile_guard_prompt_write()
returns trigger
language plpgsql
set search_path = public, pg_catalog, auth
as $$
begin
  if (
    auth.role() = 'service_role'
    or (session_user = 'postgres' and current_user = 'postgres')
  ) and current_setting('app.profile_guard_write', true) = 'on' then
    return new;
  end if;
  raise exception using errcode = '42501', message = 'PROFILE_GUARD_REQUIRED';
end;
$$;
