-- Prevent structured ISO timestamps (for example relationship_compass.updatedAt)
-- from being classified as phone numbers, and avoid enforcement when a write
-- changes no Guard-covered public field.

begin;

create or replace function public.profile_guard_assess(p_text text)
returns jsonb
language plpgsql immutable
set search_path = public, pg_catalog
as $$
declare
  v_text text := lower(normalize(coalesce(p_text, ''), NFKC));
  v_compact text;
  v_signals text[] := '{}';
  v_score numeric := 0;
begin
  v_text := replace(replace(replace(replace(replace(
    v_text, chr(8203), ''), chr(8204), ''), chr(8205), ''),
    chr(8288), ''), chr(65279), '');
  v_text := regexp_replace(replace(replace(replace(
    v_text, chr(160), ' '), chr(65039), ''), chr(8419), ''), '\s+', ' ', 'g');
  v_text := translate(
    v_text,
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );

  -- Machine-generated ISO dates contain enough digits and separators to look
  -- like phone numbers. Remove only complete, bounded ISO date/time tokens.
  v_text := regexp_replace(
    v_text,
    '(^|[^0-9])(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])t(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])([^0-9]|$)',
    '\1 iso_timestamp \2',
    'g'
  );
  v_compact := regexp_replace(v_text, '[\s.\-_/()\[\]{}]+', '', 'g');

  if v_text ~ '(^|[^0-9])[+]?[0-9][0-9 .()/-]{7,}[0-9]([^0-9]|$)'
     or v_text ~ '\m(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])(?:[ .,-]*(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])){8,}\M' then
    v_signals := array_append(v_signals, 'PHONE_CONTACT');
    v_score := v_score + .98;
  end if;
  if v_text ~ '(^|[^a-z0-9])[a-z0-9._%+-]+\s*(@|\[?at\]?)\s*[a-z0-9.-]+\s*(\.|\[?dot\]?)\s*[a-z]{2,}($|[^a-z])' then
    v_signals := array_append(v_signals, 'EMAIL_CONTACT');
    v_score := v_score + .98;
  end if;
  if v_text ~ '\m(https?://|www\.)[^[:space:]]+'
     or v_text ~ '\m[a-z0-9-]+\.(com|net|org|io|co\.uk|me|app|link)\M' then
    v_signals := array_append(v_signals, 'URL_REDIRECTION');
    v_score := v_score + .96;
  end if;
  if (
       v_compact ~ '(whatsapp|telegram|snapchat|signal|instagram|insta)'
       or v_text ~ '\m(green app|green one|paper plane app|photo app|elsewhere)\M'
     ) and (
       v_text ~ '\m(message|text|contact|reach|find|follow|dm|signal|whats\s*app|telegram|snap(chat)?|insta(gram)?)\s+me\M|\mi\s*(do not|don''t)\s+reply\s+here\M|\msame username everywhere\M'
       or v_compact ~ '(whatsapp|telegram|snapchat|signal|instagram|insta)me'
       or v_text ~ '\m(i''m|i am|im)\s+(online|available)?\s*(on|via)\s+(whats\s*app|telegram|snap(chat)?|signal|insta(gram)?)\M'
       or v_text ~ '\m(find|reach|contact|message|text|dm|add)\s+me\s+(on|via)\s+(whats\s*app|telegram|snap(chat)?|signal|insta(gram)?)\M'
     ) then
    v_signals := array_append(v_signals, 'EXTERNAL_MESSAGING');
    v_score := v_score + .90;
  end if;
  if v_text ~ '\m(exclusive|premium|private|uncensored|spicy)\s+(content|page|access)\M|\m(subscribe|pay)\M.{0,35}\m(content|page|access)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .84;
  end if;
  if v_text ~ '\m(sell(ing)?|buy|purchase|unlock|join|subscribe|support|book(ing)?|ask)\M.{0,55}\m(private\s+)?(membership(s)?|subscription(s)?|photos?|pics?|content|gallery|access|page)\M'
     or v_text ~ '\m(private\s+)?(membership(s)?|subscription(s)?|photos?|pics?|content|gallery|access|page)\M.{0,55}\m(sell(ing)?|buy|purchase|unlock|join|subscribe|support|book(ing)?|ask)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .88;
  end if;
  if v_compact ~ '(onlyfans|onlyfan\$|fansly|fanvue)'
     and v_text ~ '\m(my|see|view|find|follow|visit|subscribe|exclusive|private|content|page|profile)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .96;
  end if;
  if v_text ~ '\m(come see what i can''?t show here|ask me where i post (my )?private|ask me where to find my uncensored|special private page for people who want more|subscribers get access to everything)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .72;
  end if;
  if v_text ~ '\m(cash\s*app|venmo|paypal|send me money|send btc|crypto investment)\M|\mguaranteed\M.{0,25}\mreturns\M' then
    v_signals := array_append(v_signals, 'FINANCIAL_SOLICITATION');
    v_score := v_score + .90;
  end if;

  return jsonb_build_object(
    'categories', v_signals,
    'risk_score', least(1, v_score),
    'decision', case
      when array_length(v_signals, 1) is null then 'ALLOW'
      when 'PHONE_CONTACT' = any(v_signals)
        and ('EXTERNAL_MESSAGING' = any(v_signals)
          or 'PAID_CONTENT_PROMOTION' = any(v_signals)) then 'RESTRICT_PROFILE'
      else 'REQUIRE_REWRITE'
    end
  );
end;
$$;

revoke all on function public.profile_guard_assess(text)
from public, anon, authenticated;
grant execute on function public.profile_guard_assess(text) to service_role;

-- Preserve the canonical bridge implementation while narrowing enforcement to
-- writes that actually contain at least one Guard-covered field.
do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.rpc_service_update_profile_with_guard(uuid,jsonb)'::regprocedure
  ) into v_definition;
  v_patched := replace(
    v_definition,
    'if v_config.enabled and (v_assessment->>''decision'') <> ''ALLOW'' then',
    'if cardinality(v_guarded_keys) > 0 and v_config.enabled and (v_assessment->>''decision'') <> ''ALLOW'' then'
  );
  if v_patched = v_definition then
    raise exception 'PROFILE_GUARD_BRIDGE_PATCH_TARGET_NOT_FOUND';
  end if;
  execute v_patched;
end;
$migration$;

revoke all on function public.rpc_service_update_profile_with_guard(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.rpc_service_update_profile_with_guard(uuid, jsonb)
to service_role;

-- Resolve only the known timestamp false-positive lifecycle. A profile is
-- restored only when every unresolved deterministic event is PHONE_CONTACT and
-- the corrected detector allows its current complete public content.
with candidates as (
  select profile.id,
    coalesce((
      select (event_row.metadata->>'prior_discoverable')::boolean
      from public.profile_moderation_events event_row
      where event_row.profile_id = profile.id
        and event_row.resolved_at is null
        and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
      order by event_row.created_at asc
      limit 1
    ), false) as restore_discoverable
  from public.profiles profile
  where profile.profile_moderation_state in ('ACTION_REQUIRED', 'RESTRICTED')
    and exists (
      select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = profile.id and event_row.resolved_at is null
        and event_row.source = 'profile_write'
        and event_row.categories = array['PHONE_CONTACT']::text[]
    )
    and not exists (
      select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = profile.id and event_row.resolved_at is null
        and (event_row.decision not in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
          or event_row.categories <> array['PHONE_CONTACT']::text[])
    )
    and public.profile_guard_assess(concat_ws(' ',
      profile.full_name, profile.username, profile.bio, profile.occupation,
      profile.education, profile.looking_for, profile.tribe,
      array_to_string(profile.roots, ' '), profile.roots_note, profile.height,
      profile.exercise_frequency, profile.smoking, profile.drinking,
      profile.has_children, profile.wants_children, profile.personality_type,
      profile.love_language, profile.living_situation, profile.pets,
      array_to_string(profile.languages_spoken, ' '), profile.future_ghana_plans,
      profile.relationship_compass::text
    ))->>'decision' = 'ALLOW'
), resolved as (
  update public.profile_moderation_events event_row
  set resolved_at = timezone('utc', now()),
      metadata = event_row.metadata || jsonb_build_object(
        'resolution', 'structured_timestamp_false_positive',
        'remediation_migration', '20260905234500'
      )
  from candidates
  where event_row.profile_id = candidates.id
    and event_row.resolved_at is null
    and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
  returning event_row.profile_id
)
update public.profiles profile
set profile_moderation_state = 'CLEAR',
    discoverable_in_vibes = candidates.restore_discoverable,
    updated_at = timezone('utc', now())
from candidates
where profile.id = candidates.id
  and exists (select 1 from resolved where resolved.profile_id = profile.id);

commit;
