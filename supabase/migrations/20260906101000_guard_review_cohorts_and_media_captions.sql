-- Make concurrent profile reviews order-independent and moderate media captions.

alter table public.content_moderation_events
  drop constraint if exists content_moderation_events_content_type_check;
alter table public.content_moderation_events
  add constraint content_moderation_events_content_type_check check (content_type in (
    'private_message', 'private_message_edit', 'profile_image', 'chat_image',
    'chat_caption'
  ));

create or replace function public.trg_enforce_private_message_safety_floor()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assessment jsonb;
begin
  if new.message_type not in ('text', 'image', 'video', 'document', 'voice', 'audio') then
    return new;
  end if;
  if nullif(btrim(coalesce(new.text, '')), '') is null then return new; end if;
  if tg_op = 'UPDATE' and new.text is not distinct from old.text then return new; end if;
  if auth.role() = 'service_role' then return new; end if;
  v_assessment := public.content_safety_assess_private_message(new.text);
  if v_assessment ->> 'decision' = 'BLOCK' then
    raise exception using errcode = '22023', message = 'MESSAGE_CONTENT_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

revoke all on function public.trg_enforce_private_message_safety_floor()
  from public, anon, authenticated;

create or replace function public.rpc_admin_resolve_profile_guard_review(
  p_review_id uuid,
  p_state text,
  p_reason_code text,
  p_notes text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_event public.profile_moderation_events%rowtype;
  v_cohort text;
  v_has_open boolean;
  v_restore_discoverable boolean;
  v_final_state text;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_state not in ('CLEAR', 'RESTRICTED', 'SUSPENDED') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_STATE';
  end if;
  if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  select * into v_event
  from public.profile_moderation_events event_row
  where event_row.id = p_review_id and event_row.decision = 'HUMAN_REVIEW'
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND'; end if;
  if v_event.reviewed_at is not null then
    raise exception using errcode = 'P0001', message = 'REVIEW_ALREADY_RESOLVED';
  end if;
  perform 1 from public.profiles where id = v_event.profile_id for update;

  v_cohort := coalesce(v_event.metadata ->> 'review_cohort', gen_random_uuid()::text);
  update public.profile_moderation_events
  set metadata = metadata || jsonb_build_object('review_cohort', v_cohort)
  where profile_id = v_event.profile_id
    and decision = 'HUMAN_REVIEW'
    and reviewed_at is null;

  update public.profile_moderation_events
  set reviewed_at = timezone('utc', now()), reviewed_by = auth.uid(),
      review_outcome = p_state, resolved_at = timezone('utc', now()),
      metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
        'review_cohort', v_cohort,
        'resolution_reason_code', left(btrim(p_reason_code), 80),
        'review_notes', nullif(left(btrim(coalesce(p_notes, '')), 1000), '')
      ))
  where id = v_event.id;

  select exists (
    select 1 from public.profile_moderation_events event_row
    where event_row.profile_id = v_event.profile_id
      and event_row.decision = 'HUMAN_REVIEW'
      and event_row.metadata ->> 'review_cohort' = v_cohort
      and event_row.reviewed_at is null
  ) into v_has_open;

  select coalesce(bool_or(coalesce((event_row.metadata ->> 'prior_discoverable')::boolean, false)), false)
  into v_restore_discoverable
  from public.profile_moderation_events event_row
  where event_row.profile_id = v_event.profile_id
    and event_row.decision = 'HUMAN_REVIEW'
    and event_row.metadata ->> 'review_cohort' = v_cohort;

  select case
    when exists (select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = v_event.profile_id
        and event_row.metadata ->> 'review_cohort' = v_cohort
        and event_row.review_outcome = 'SUSPENDED') then 'SUSPENDED'
    when exists (select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = v_event.profile_id
        and event_row.metadata ->> 'review_cohort' = v_cohort
        and event_row.review_outcome = 'RESTRICTED') then 'RESTRICTED'
    when v_has_open then 'REVIEW_REQUIRED'
    else 'CLEAR'
  end into v_final_state;

  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set profile_moderation_state = v_final_state,
      discoverable_in_vibes = case when v_final_state = 'CLEAR'
        then v_restore_discoverable else false end,
      updated_at = timezone('utc', now())
  where id = v_event.profile_id;

  insert into public.system_messages(user_id, peer_user_id, event_type, text, metadata)
  values (v_event.user_id, v_event.user_id, 'profile_guard_review_resolved',
    case when v_final_state = 'CLEAR'
      then 'Your profile review is complete and your profile is eligible again.'
      when v_final_state = 'REVIEW_REQUIRED'
      then 'One profile review is complete. Another review is still pending.'
      else 'Your profile review is complete. Please update your profile before it can appear publicly.' end,
    jsonb_build_object('review_id', v_event.id, 'profile_id', v_event.profile_id,
      'review_cohort', v_cohort, 'outcome', p_state,
      'reason_code', left(btrim(p_reason_code), 80)));

  return jsonb_build_object('ok', true, 'review_id', v_event.id,
    'profile_id', v_event.profile_id, 'review_outcome', p_state,
    'profile_moderation_state', v_final_state, 'other_open_review', v_has_open,
    'review_cohort', v_cohort);
end;
$$;

revoke all on function public.rpc_admin_resolve_profile_guard_review(uuid, text, text, text)
  from public, anon;
grant execute on function public.rpc_admin_resolve_profile_guard_review(uuid, text, text, text)
  to authenticated;
