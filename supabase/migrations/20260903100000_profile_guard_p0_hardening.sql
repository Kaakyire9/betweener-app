-- Solicitation Guard P0 hardening: complete displayed-text coverage,
-- semantic-call throttling, optimistic concurrency, and prompt-update closure.
begin;

create table if not exists public.profile_guard_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.profile_guard_rate_limits enable row level security;
revoke all on table public.profile_guard_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_guard_rate_limits to service_role;

create or replace function public.rpc_service_consume_profile_guard_rate_limit(
  p_user_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_window interval := interval '10 minutes';
  v_count integer;
  v_started timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_IDENTITY';
  end if;

  insert into public.profile_guard_rate_limits(
    user_id, window_started_at, request_count, updated_at
  ) values (p_user_id, v_now, 1, v_now)
  on conflict (user_id) do update
  set window_started_at = case
        when public.profile_guard_rate_limits.window_started_at <= v_now - v_window
          then v_now else public.profile_guard_rate_limits.window_started_at end,
      request_count = case
        when public.profile_guard_rate_limits.window_started_at <= v_now - v_window
          then 1 else public.profile_guard_rate_limits.request_count + 1 end,
      updated_at = v_now
  returning request_count, window_started_at into v_count, v_started;

  return jsonb_build_object(
    'allowed', v_count <= 12,
    'request_count', v_count,
    'retry_after_seconds', case when v_count <= 12 then 0 else
      greatest(1, ceil(extract(epoch from (v_started + v_window - v_now)))::integer) end
  );
end;
$$;
revoke all on function public.rpc_service_consume_profile_guard_rate_limit(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_consume_profile_guard_rate_limit(uuid)
to service_role;

-- Keep a deterministic, provider-independent floor for explicit solicitation.
-- Semantic review still runs for every changed public text field that passes it.
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

create or replace function public.rpc_record_profile_guard_semantic_observation(
  p_user_id uuid,
  p_decision text,
  p_reason_code text
)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_decision not in ('ALLOW_AND_LOG', 'REQUIRE_REWRITE') then
    raise exception using errcode = '22023', message = 'INVALID_MODERATION_DECISION';
  end if;
  select id into v_profile_id from public.profiles where user_id = p_user_id;
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  insert into public.profile_moderation_events(
    user_id, profile_id, field_names, categories, risk_score, decision,
    source, detector_version, metadata
  ) values (
    p_user_id, v_profile_id, array['semantic'],
    array[left(coalesce(p_reason_code, ''), 80)], 0, p_decision,
    'profile_write', '2.0.0', jsonb_build_object('semantic_used', true)
  );
end;
$$;
revoke all on function public.rpc_record_profile_guard_semantic_observation(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.rpc_record_profile_guard_semantic_observation(uuid, text, text)
to service_role;

create or replace function public.rpc_apply_profile_guard_semantic_decision(
  p_user_id uuid,
  p_category text,
  p_semantic_scores jsonb
)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile public.profiles%rowtype;
  v_score numeric;
  v_allowed_categories constant text[] := array[
    'external_contact','external_redirection','commercial_solicitation',
    'paid_content_promotion','sexual_service_solicitation',
    'financial_solicitation','spam'
  ];
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if not (p_category = any(v_allowed_categories))
     or jsonb_typeof(p_semantic_scores) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end if;
  begin
    v_score := (p_semantic_scores->>p_category)::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end;
  if v_score < 0.65 or v_score > 1 then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end if;
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  insert into public.profile_moderation_events(
    user_id, profile_id, field_names, categories, risk_score, decision,
    source, detector_version, metadata
  ) values (
    p_user_id, v_profile.id, array['semantic'], array[p_category], v_score,
    'HUMAN_REVIEW', 'profile_write', '2.0.0',
    jsonb_build_object(
      'semantic_used', true,
      'score_keys', array(select jsonb_object_keys(p_semantic_scores)),
      'prior_discoverable', v_profile.discoverable_in_vibes
    )
  );
  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set profile_moderation_state = 'REVIEW_REQUIRED',
      discoverable_in_vibes = false,
      updated_at = timezone('utc', now())
  where id = v_profile.id;
end;
$$;
revoke all on function public.rpc_apply_profile_guard_semantic_decision(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.rpc_apply_profile_guard_semantic_decision(uuid, text, jsonb)
to service_role;

create or replace function public.profile_guard_update_lengths_valid(p_updates jsonb)
returns boolean
language sql immutable
set search_path = public, pg_catalog
as $$
  select jsonb_typeof(coalesce(p_updates, '{}'::jsonb)) = 'object'
    and char_length(coalesce(p_updates->>'full_name', '')) <= 120
    and char_length(coalesce(p_updates->>'username', '')) <= 80
    and char_length(coalesce(p_updates->>'bio', '')) <= 500
    and char_length(coalesce(p_updates->>'occupation', '')) <= 160
    and char_length(coalesce(p_updates->>'education', '')) <= 160
    and char_length(coalesce(p_updates->>'looking_for', '')) <= 300
    and char_length(coalesce(p_updates->>'tribe', '')) <= 120
    and char_length(coalesce(p_updates->>'roots_note', '')) <= 300
    and char_length(coalesce(p_updates->>'height', '')) <= 80
    and char_length(coalesce(p_updates->>'exercise_frequency', '')) <= 120
    and char_length(coalesce(p_updates->>'smoking', '')) <= 120
    and char_length(coalesce(p_updates->>'drinking', '')) <= 120
    and char_length(coalesce(p_updates->>'has_children', '')) <= 120
    and char_length(coalesce(p_updates->>'wants_children', '')) <= 120
    and char_length(coalesce(p_updates->>'personality_type', '')) <= 160
    and char_length(coalesce(p_updates->>'love_language', '')) <= 160
    and char_length(coalesce(p_updates->>'living_situation', '')) <= 160
    and char_length(coalesce(p_updates->>'pets', '')) <= 160
    and char_length(coalesce(p_updates->>'future_ghana_plans', '')) <= 500
    and octet_length(coalesce(p_updates->'roots', '[]'::jsonb)::text) <= 1000
    and octet_length(coalesce(p_updates->'languages_spoken', '[]'::jsonb)::text) <= 2000
    and octet_length(coalesce(p_updates->'relationship_compass', '{}'::jsonb)::text) <= 4000;
$$;
revoke all on function public.profile_guard_update_lengths_valid(jsonb)
from public, anon, authenticated;
grant execute on function public.profile_guard_update_lengths_valid(jsonb) to service_role;

create or replace function public.rpc_service_update_profile_with_guard(
  p_user_id uuid,
  p_updates jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile public.profiles%rowtype;
  v_assessment jsonb;
  v_config record;
  v_text text;
  v_keys text[];
  v_guarded_keys text[];
  v_set text;
  v_restore_discoverable boolean := false;
  v_allowed constant text[] := array[
    'full_name','username','bio','avatar_url','hero_image_url','photos','profile_video',
    'gender','age','region','tribe','roots','roots_note','roots_visibility','religion',
    'min_age_interest','max_age_interest','age_preference_confirmed_at',
    'current_country','current_country_code','city','location','latitude','longitude',
    'location_precision','locality_geoname_id','locality_district','locality_admin1_code',
    'locality_provider','location_updated_at','origin_country','origin_country_code',
    'origin_country_source','occupation','education','height','looking_for',
    'exercise_frequency','smoking','drinking','has_children','wants_children',
    'personality_type','love_language','living_situation','pets','languages_spoken',
    'years_in_diaspora','last_ghana_visit','future_ghana_plans','relationship_compass',
    'onboarding_variant'
  ];
  v_guarded constant text[] := array[
    'full_name','username','bio','occupation','education','looking_for','tribe','roots',
    'roots_note','height','exercise_frequency','smoking','drinking','has_children',
    'wants_children','personality_type','love_language','living_situation','pets',
    'languages_spoken','future_ghana_plans','relationship_compass'
  ];
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_updates is null or jsonb_typeof(p_updates) <> 'object'
     or octet_length(p_updates::text) > 20000
     or not public.profile_guard_update_lengths_valid(p_updates) then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_UPDATE';
  end if;
  select coalesce(array_agg(key order by key), '{}'::text[])
    into v_keys from jsonb_object_keys(p_updates) key;
  if cardinality(v_keys) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_UPDATE';
  end if;
  if exists (select 1 from unnest(v_keys) key where not (key = any(v_allowed))) then
    raise exception using errcode = '42501', message = 'PROFILE_FIELD_NOT_ALLOWED';
  end if;

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  if (p_updates ? 'city' and (p_updates->>'city') is distinct from v_profile.city
       and not public.profile_guard_structured_text_is_valid('city', p_updates->>'city'))
     or (p_updates ? 'region' and (p_updates->>'region') is distinct from v_profile.region
       and not public.profile_guard_structured_text_is_valid('region', p_updates->>'region'))
     or (p_updates ? 'last_ghana_visit'
       and (p_updates->>'last_ghana_visit') is distinct from v_profile.last_ghana_visit
       and not public.profile_guard_structured_text_is_valid('last_ghana_visit', p_updates->>'last_ghana_visit'))
     or ((p_updates ? 'location' or p_updates ? 'city' or p_updates ? 'region'
            or p_updates ? 'current_country')
       and coalesce(p_updates->>'location', v_profile.location) is distinct from v_profile.location
       and not public.profile_guard_location_is_derived(
         coalesce(p_updates->>'location', v_profile.location),
         coalesce(p_updates->>'city', v_profile.city),
         coalesce(p_updates->>'region', v_profile.region),
         coalesce(p_updates->>'current_country', v_profile.current_country)
       )) then
    raise exception using errcode = '22023', message = 'INVALID_STRUCTURED_PROFILE_FIELD';
  end if;

  v_text := concat_ws(' ',
    coalesce(p_updates->>'full_name', v_profile.full_name),
    coalesce(p_updates->>'username', v_profile.username),
    coalesce(p_updates->>'bio', v_profile.bio),
    coalesce(p_updates->>'occupation', v_profile.occupation),
    coalesce(p_updates->>'education', v_profile.education),
    coalesce(p_updates->>'looking_for', v_profile.looking_for),
    coalesce(p_updates->>'tribe', v_profile.tribe),
    coalesce(p_updates->>'roots', array_to_json(v_profile.roots)::text),
    coalesce(p_updates->>'roots_note', v_profile.roots_note),
    coalesce(p_updates->>'height', v_profile.height),
    coalesce(p_updates->>'exercise_frequency', v_profile.exercise_frequency),
    coalesce(p_updates->>'smoking', v_profile.smoking),
    coalesce(p_updates->>'drinking', v_profile.drinking),
    coalesce(p_updates->>'has_children', v_profile.has_children),
    coalesce(p_updates->>'wants_children', v_profile.wants_children),
    coalesce(p_updates->>'personality_type', v_profile.personality_type),
    coalesce(p_updates->>'love_language', v_profile.love_language),
    coalesce(p_updates->>'living_situation', v_profile.living_situation),
    coalesce(p_updates->>'pets', v_profile.pets),
    coalesce(p_updates->>'languages_spoken', array_to_json(v_profile.languages_spoken)::text),
    coalesce(p_updates->>'future_ghana_plans', v_profile.future_ghana_plans),
    coalesce(p_updates->>'relationship_compass', v_profile.relationship_compass::text)
  );
  v_assessment := public.profile_guard_assess(v_text);
  select coalesce(configuration.enabled, true) as enabled,
    case when configuration.enforcement_mode in ('OFF', 'REPORT_ONLY', 'ENFORCE')
      then configuration.enforcement_mode else 'ENFORCE' end as enforcement_mode
  into v_config from public.profile_guard_configuration configuration where configuration.id = true;
  if not found then
    select true as enabled, 'ENFORCE'::text as enforcement_mode into v_config;
  end if;
  select coalesce(array_agg(key), '{}'::text[]) into v_guarded_keys
  from unnest(v_keys) key where key = any(v_guarded);

  if v_config.enabled and (v_assessment->>'decision') <> 'ALLOW' then
    insert into public.profile_moderation_events(
      user_id, profile_id, field_names, categories, risk_score, decision,
      source, detector_version, metadata
    ) values (
      p_user_id, v_profile.id, v_guarded_keys,
      array(select jsonb_array_elements_text(v_assessment->'categories')),
      (v_assessment->>'risk_score')::numeric,
      case when v_config.enforcement_mode = 'REPORT_ONLY'
        then 'ALLOW_AND_LOG' else v_assessment->>'decision' end,
      'profile_write', '2.0.0',
      jsonb_build_object('signal_count', jsonb_array_length(v_assessment->'categories'),
        'prior_discoverable', v_profile.discoverable_in_vibes,
        'enforcement_mode', v_config.enforcement_mode)
    );
    if v_config.enforcement_mode = 'ENFORCE' then
      perform set_config('app.profile_guard_write', 'on', true);
      update public.profiles
      set profile_moderation_state = case when (v_assessment->>'decision') = 'RESTRICT_PROFILE'
            then 'RESTRICTED' else 'ACTION_REQUIRED' end,
          discoverable_in_vibes = false, updated_at = timezone('utc', now())
      where id = v_profile.id;
      return jsonb_build_object('ok', false, 'code', 'PROFILE_CONTENT_NOT_ALLOWED',
        'field_names', v_guarded_keys);
    end if;
  end if;

  if v_profile.profile_moderation_state in ('ACTION_REQUIRED', 'RESTRICTED')
     and (v_assessment->>'decision') = 'ALLOW' then
    select coalesce((event_row.metadata->>'prior_discoverable')::boolean, false)
    into v_restore_discoverable
    from public.profile_moderation_events event_row
    where event_row.profile_id = v_profile.id
      and event_row.source in ('profile_write', 'backfill', 'moderation_action')
      and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
      and event_row.resolved_at is null
    order by event_row.created_at asc limit 1;
  end if;

  select string_agg(format(
    '%1$I = (jsonb_populate_record(null::public.profiles, $1)).%1$I', key
  ), ', ') into v_set from unnest(v_keys) key;
  perform set_config('app.profile_guard_write', 'on', true);
  execute format(
    'update public.profiles set %s,
       profile_moderation_state = case when profile_moderation_state in
         (''ACTION_REQUIRED'', ''RESTRICTED'') then ''CLEAR'' else profile_moderation_state end,
       discoverable_in_vibes = case when profile_moderation_state in
         (''ACTION_REQUIRED'', ''RESTRICTED'') then $3 else discoverable_in_vibes end,
       updated_at = timezone(''utc'', now()) where id = $2', v_set
  ) using p_updates, v_profile.id, v_restore_discoverable;
  update public.profile_moderation_events
  set resolved_at = timezone('utc', now()),
      metadata = metadata || jsonb_build_object('resolution', 'safe_rewrite')
  where profile_id = v_profile.id and resolved_at is null
    and source in ('profile_write', 'backfill', 'moderation_action')
    and decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
    and (v_assessment->>'decision') = 'ALLOW';
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.rpc_service_update_profile_with_guard(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.rpc_service_update_profile_with_guard(uuid, jsonb)
to service_role;

create or replace function public.rpc_service_update_profile_with_guard_v2(
  p_user_id uuid,
  p_updates jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_updated_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select updated_at into v_updated_at from public.profiles
  where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'PROFILE_WRITE_CONFLICT';
  end if;
  return public.rpc_service_update_profile_with_guard(p_user_id, p_updates);
end;
$$;
revoke all on function public.rpc_service_update_profile_with_guard_v2(uuid, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.rpc_service_update_profile_with_guard_v2(uuid, jsonb, timestamptz)
to service_role;

create or replace function public.rpc_service_insert_profile_prompt_with_guard_v2(
  p_user_id uuid,
  p_expected_updated_at timestamptz,
  p_prompt_key text,
  p_prompt_title text,
  p_answer text,
  p_prompt_type text default 'standard',
  p_guess_mode text default null,
  p_guess_options jsonb default null,
  p_hint_text text default null,
  p_reveal_policy text default 'never'
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile_id uuid;
  v_updated_at timestamptz;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select id, updated_at into v_profile_id, v_updated_at from public.profiles
  where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'PROFILE_WRITE_CONFLICT';
  end if;
  v_result := public.rpc_service_insert_profile_prompt_with_guard(
    p_user_id, p_prompt_key, p_prompt_title, p_answer, p_prompt_type,
    p_guess_mode, p_guess_options, p_hint_text, p_reveal_policy
  );
  if coalesce((v_result->>'ok')::boolean, false) then
    perform set_config('app.profile_guard_write', 'on', true);
    update public.profiles set updated_at = timezone('utc', now()) where id = v_profile_id;
  end if;
  return v_result;
end;
$$;
revoke all on function public.rpc_service_insert_profile_prompt_with_guard_v2(
  uuid, timestamptz, text, text, text, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_insert_profile_prompt_with_guard_v2(
  uuid, timestamptz, text, text, text, text, text, jsonb, text, text
) to service_role;

create or replace function public.profile_guard_prevent_direct_public_text_write()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_trusted_write boolean := current_user in ('postgres', 'service_role')
    and current_setting('app.profile_guard_write', true) = 'on';
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

drop trigger if exists profile_guard_prompt_write on public.profile_prompts;
create trigger profile_guard_prompt_write
before insert or update of prompt_title, answer, hint_text, guess_options
on public.profile_prompts
for each row execute function public.profile_guard_prompt_write();

create or replace function public.can_authenticated_user_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with viewer as (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
  select auth.uid() is not null and (
    exists (select 1 from public.profiles p
      where p.id = p_profile_id and p.user_id = auth.uid())
    or (
      exists (select 1 from public.profiles p
        where p.id = p_profile_id and p.profile_moderation_state = 'CLEAR')
      and (
        public.can_profile_surface_publicly(p_profile_id)
        or exists (
          select 1 from public.matches match_row, viewer
          where match_row.status = 'ACCEPTED'::public.match_status
            and viewer.id = any(array[match_row.user1_id, match_row.user2_id])
            and p_profile_id = any(array[match_row.user1_id, match_row.user2_id])
        )
        or exists (
          select 1 from public.circle_members viewer_member
          join viewer on viewer.id = viewer_member.profile_id
          join public.circle_members target_member
            on target_member.circle_id = viewer_member.circle_id
           and target_member.profile_id = p_profile_id
          where viewer_member.status = 'active' and target_member.status = 'active'
        )
      )
    )
  );
$$;
revoke all on function public.can_authenticated_user_view_profile(uuid)
from public, anon, authenticated;
grant execute on function public.can_authenticated_user_view_profile(uuid)
to authenticated, service_role;

commit;
