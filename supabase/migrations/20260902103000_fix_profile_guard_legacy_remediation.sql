-- Make legacy-profile enforcement reversible and provide a narrow, audited
-- single-profile remediation path for support operations.
begin;

alter table public.profile_moderation_events
  drop constraint if exists profile_moderation_events_source_check;
alter table public.profile_moderation_events
  add constraint profile_moderation_events_source_check
  check (source in ('profile_write', 'backfill', 'moderation_action'));

create or replace function public.rpc_backfill_profile_contact_guard(
  p_batch_size integer default 100,
  p_after_profile_id uuid default null,
  p_enforce boolean default false
) returns table(profile_id uuid, decision text)
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  row_profile record;
  v_assessment jsonb;
  v_backfill_enabled boolean := false;
  v_enforcement_mode text := 'ENFORCE';
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception using errcode = '22023', message = 'INVALID_BATCH_SIZE';
  end if;

  select configuration.backfill_enabled,
    case when configuration.enforcement_mode in ('OFF', 'REPORT_ONLY', 'ENFORCE')
      then configuration.enforcement_mode else 'ENFORCE' end
  into v_backfill_enabled, v_enforcement_mode
  from public.profile_guard_configuration configuration
  where configuration.id = true;

  if not coalesce(v_backfill_enabled, false) then
    raise exception using errcode = '55000', message = 'PROFILE_GUARD_BACKFILL_DISABLED';
  end if;
  if p_enforce and v_enforcement_mode <> 'ENFORCE' then
    raise exception using errcode = '55000', message = 'PROFILE_GUARD_ENFORCEMENT_DISABLED';
  end if;

  for row_profile in
    select
      profile.id,
      profile.user_id,
      profile.full_name,
      profile.bio,
      profile.occupation,
      profile.education,
      profile.looking_for,
      profile.roots_note,
      profile.future_ghana_plans,
      profile.discoverable_in_vibes
    from public.profiles profile
    where profile.deleted_at is null
      and (p_after_profile_id is null or profile.id > p_after_profile_id)
    order by profile.id
    limit p_batch_size
  loop
    v_assessment := public.profile_guard_assess(concat_ws(' ',
      row_profile.full_name,
      row_profile.bio,
      row_profile.occupation,
      row_profile.education,
      row_profile.looking_for,
      row_profile.roots_note,
      row_profile.future_ghana_plans
    ));

    if (v_assessment->>'decision') <> 'ALLOW' then
      insert into public.profile_moderation_events(
        user_id, profile_id, field_names, categories, risk_score, decision,
        source, detector_version, metadata
      ) values (
        row_profile.user_id,
        row_profile.id,
        array['profile_backfill'],
        array(select jsonb_array_elements_text(v_assessment->'categories')),
        (v_assessment->>'risk_score')::numeric,
        v_assessment->>'decision',
        'backfill',
        '1.2.0',
        jsonb_build_object(
          'signal_count', jsonb_array_length(v_assessment->'categories'),
          'prior_discoverable', row_profile.discoverable_in_vibes,
          'enforcement_mode', v_enforcement_mode,
          'targeted_enforcement', false
        )
      ) on conflict do nothing;

      if p_enforce then
        perform set_config('app.profile_guard_write', 'on', true);
        update public.profiles
        set profile_moderation_state = case
              when (v_assessment->>'decision') = 'RESTRICT_PROFILE' then 'RESTRICTED'
              else 'ACTION_REQUIRED'
            end,
            discoverable_in_vibes = false,
            updated_at = timezone('utc', now())
        where id = row_profile.id;
      end if;
    end if;

    profile_id := row_profile.id;
    decision := v_assessment->>'decision';
    return next;
  end loop;
end;
$$;

revoke all on function public.rpc_backfill_profile_contact_guard(integer, uuid, boolean)
from public, anon, authenticated;
grant execute on function public.rpc_backfill_profile_contact_guard(integer, uuid, boolean)
to service_role;

create or replace function public.rpc_enforce_profile_contact_guard(
  p_profile_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile public.profiles%rowtype;
  v_assessment jsonb;
  v_config record;
  v_decision text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_profile_id is null then
    raise exception using errcode = '22023', message = 'PROFILE_ID_REQUIRED';
  end if;

  select
    coalesce(configuration.enabled, true) as enabled,
    case when configuration.enforcement_mode in ('OFF', 'REPORT_ONLY', 'ENFORCE')
      then configuration.enforcement_mode else 'ENFORCE' end as enforcement_mode
  into v_config
  from public.profile_guard_configuration configuration
  where configuration.id = true;

  if not found or not v_config.enabled or v_config.enforcement_mode <> 'ENFORCE' then
    raise exception using errcode = '55000', message = 'PROFILE_GUARD_ENFORCEMENT_DISABLED';
  end if;

  select * into v_profile
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  v_assessment := public.profile_guard_assess(concat_ws(' ',
    v_profile.full_name,
    v_profile.bio,
    v_profile.occupation,
    v_profile.education,
    v_profile.looking_for,
    v_profile.roots_note,
    v_profile.future_ghana_plans
  ));
  v_decision := v_assessment->>'decision';

  if v_decision = 'ALLOW' then
    return jsonb_build_object('ok', true, 'decision', v_decision, 'changed', false);
  end if;

  insert into public.profile_moderation_events(
    user_id, profile_id, field_names, categories, risk_score, decision,
    source, detector_version, metadata
  ) values (
    v_profile.user_id,
    v_profile.id,
    array['profile_backfill'],
    array(select jsonb_array_elements_text(v_assessment->'categories')),
    (v_assessment->>'risk_score')::numeric,
    v_decision,
    'moderation_action',
    '1.2.0',
    jsonb_build_object(
      'signal_count', jsonb_array_length(v_assessment->'categories'),
      'prior_discoverable', v_profile.discoverable_in_vibes,
      'enforcement_mode', v_config.enforcement_mode,
      'targeted_enforcement', true
    )
  ) on conflict do nothing;

  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set profile_moderation_state = case
        when v_decision = 'RESTRICT_PROFILE' then 'RESTRICTED'
        else 'ACTION_REQUIRED'
      end,
      discoverable_in_vibes = false,
      updated_at = timezone('utc', now())
  where id = v_profile.id;

  return jsonb_build_object('ok', true, 'decision', v_decision, 'changed', true);
end;
$$;

revoke all on function public.rpc_enforce_profile_contact_guard(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_enforce_profile_contact_guard(uuid)
to service_role;

-- The guarded profile writer clears deterministic states after a safe rewrite.
-- Restore pre-enforcement visibility for legacy actions during that transition.
create or replace function public.profile_guard_restore_legacy_discoverability()
returns trigger
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_restore_discoverable boolean := false;
begin
  if old.profile_moderation_state not in ('ACTION_REQUIRED', 'RESTRICTED')
     or new.profile_moderation_state <> 'CLEAR'
     or coalesce(new.discoverable_in_vibes, false) then
    return new;
  end if;

  select coalesce((event_row.metadata->>'prior_discoverable')::boolean, false)
  into v_restore_discoverable
  from public.profile_moderation_events event_row
  where event_row.profile_id = new.id
    and event_row.source in ('backfill', 'moderation_action')
    and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
  order by event_row.created_at desc
  limit 1;

  if v_restore_discoverable then
    new.discoverable_in_vibes := true;
  else
    new.discoverable_in_vibes := false;
  end if;

  update public.profile_moderation_events
  set resolved_at = coalesce(resolved_at, timezone('utc', now())),
      review_outcome = coalesce(review_outcome, 'CORRECTED'),
      metadata = metadata || jsonb_build_object('resolution_reason_code', 'compliant_rewrite')
  where profile_id = new.id
    and resolved_at is null
    and source in ('backfill', 'moderation_action')
    and decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE');

  return new;
end;
$$;

revoke all on function public.profile_guard_restore_legacy_discoverability()
from public, anon, authenticated, service_role;

drop trigger if exists profile_guard_restore_legacy_discoverability on public.profiles;
create trigger profile_guard_restore_legacy_discoverability
before update of profile_moderation_state, discoverable_in_vibes on public.profiles
for each row
execute function public.profile_guard_restore_legacy_discoverability();

commit;
