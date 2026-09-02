-- Betweener Profile Contact & Solicitation Guard v1.
-- The trigger is deliberately the final boundary: direct PostgREST writes to
-- public profile text cannot publish content outside the guarded RPC.
begin;

alter table public.profiles
  add column if not exists profile_moderation_state text not null default 'CLEAR';
alter table public.profiles
  drop constraint if exists profiles_profile_moderation_state_check;
alter table public.profiles add constraint profiles_profile_moderation_state_check
  check (profile_moderation_state in ('CLEAR', 'ACTION_REQUIRED', 'RESTRICTED', 'REVIEW_REQUIRED', 'SUSPENDED'));

create table if not exists public.profile_moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  field_names text[] not null default '{}'::text[],
  categories text[] not null default '{}'::text[],
  risk_score numeric(3,2) not null,
  decision text not null check (decision in ('ALLOW', 'ALLOW_AND_LOG', 'REQUIRE_REWRITE', 'RESTRICT_PROFILE', 'HUMAN_REVIEW')),
  source text not null check (source in ('profile_write', 'backfill')),
  detector_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_outcome text
);
create index if not exists profile_moderation_events_user_recent_idx on public.profile_moderation_events(user_id, created_at desc);
create index if not exists profile_moderation_events_review_queue_idx on public.profile_moderation_events(created_at desc) where reviewed_at is null and decision in ('RESTRICT_PROFILE', 'HUMAN_REVIEW');
create index if not exists profile_moderation_events_categories_idx on public.profile_moderation_events using gin(categories);
create unique index if not exists profile_moderation_events_backfill_once_idx
  on public.profile_moderation_events(profile_id, detector_version, source)
  where source = 'backfill';
alter table public.profile_moderation_events enable row level security;
-- No authenticated policy: evidence is intentionally internal-only.

create or replace function public.profile_guard_assess(p_text text)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  v_text text := lower(normalize(coalesce(p_text, ''), NFKC));
  v_compact text;
  v_signals text[] := '{}';
  v_score numeric := 0;
begin
  v_text := replace(replace(replace(replace(replace(
    v_text, chr(8203), ''), chr(8204), ''), chr(8205), ''),
    chr(8288), ''), chr(65279), '');
  v_text := regexp_replace(replace(replace(replace(replace(replace(v_text, chr(160), ' '), chr(65039), ''), chr(8419), ''), '•', '.'), '·', '.'), '\s+', ' ', 'g');
  v_text := translate(v_text, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  v_compact := regexp_replace(v_text, '[\s.\-_/()\[\]{}]+', '', 'g');

  if v_text ~ '(^|[^0-9])[+]?[0-9][0-9 .()/-]{7,}[0-9]([^0-9]|$)'
     or v_text ~ '\m(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])(?:[ .,-]*(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])){8,}\M' then
    v_signals := array_append(v_signals, 'PHONE_CONTACT'); v_score := v_score + .98;
  end if;
  if v_text ~ '(^|[^a-z0-9])[a-z0-9._%+-]+\s*(@|\[?at\]?)\s*[a-z0-9.-]+\s*(\.|\[?dot\]?)\s*[a-z]{2,}($|[^a-z])' then
    v_signals := array_append(v_signals, 'EMAIL_CONTACT'); v_score := v_score + .98;
  end if;
  if v_text ~ '\m(https?://|www\.)[^[:space:]]+' or v_text ~ '\m[a-z0-9-]+\.(com|net|org|io|co\.uk|me|app|link)\M' then
    v_signals := array_append(v_signals, 'URL_REDIRECTION'); v_score := v_score + .96;
  end if;
  if (v_compact ~ '(whatsapp|telegram|snapchat|signal|instagram|insta)' or v_text ~ '\m(green app|paper plane app|elsewhere)\M')
     and (v_text ~ '\m(message|text|contact|reach|find|follow|dm|signal|whats\s*app|telegram|snap(chat)?|insta(gram)?)\s+me\M|\mi\s*(do not|don''t)\s+reply\s+here\M|\msame username everywhere\M'
       or v_compact ~ '(whatsapp|telegram|snapchat|signal|instagram|insta)me') then
    v_signals := array_append(v_signals, 'EXTERNAL_MESSAGING'); v_score := v_score + .90;
  end if;
  if v_text ~ '\m(exclusive|premium|private|uncensored|spicy)\s+(content|page|access)\M|\m(subscribe|pay)\M.{0,35}\m(content|page|access)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION'); v_score := v_score + .84;
  end if;
  if v_text ~ '\m(come see what i can''?t show here|ask me where i post (my )?private|ask me where to find my uncensored|special private page for people who want more|subscribers get access to everything)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION'); v_score := v_score + .72;
  end if;
  if v_text ~ '\m(cash\s*app|venmo|paypal|send me money|send btc|crypto investment)\M|\mguaranteed\M.{0,25}\mreturns\M' then
    v_signals := array_append(v_signals, 'FINANCIAL_SOLICITATION'); v_score := v_score + .90;
  end if;
  return jsonb_build_object('categories', v_signals, 'risk_score', least(1, v_score),
    'decision', case when array_length(v_signals, 1) is null then 'ALLOW'
      when 'PHONE_CONTACT' = any(v_signals) and ('EXTERNAL_MESSAGING' = any(v_signals) or 'PAID_CONTENT_PROMOTION' = any(v_signals)) then 'RESTRICT_PROFILE'
      else 'REQUIRE_REWRITE' end);
end $$;

create or replace function public.profile_guard_prevent_direct_public_text_write()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if current_setting('app.profile_guard_write', true) = 'on' then return new; end if;
  if (tg_op = 'INSERT' and concat_ws('', new.full_name, new.bio, new.occupation, new.education, new.looking_for, new.roots_note, new.future_ghana_plans) <> '')
    or new.full_name is distinct from old.full_name or new.bio is distinct from old.bio
    or new.occupation is distinct from old.occupation or new.education is distinct from old.education
    or new.looking_for is distinct from old.looking_for or new.roots_note is distinct from old.roots_note
    or new.future_ghana_plans is distinct from old.future_ghana_plans then
    raise exception using errcode = '42501', message = 'PROFILE_GUARD_REQUIRED';
  end if;
  return new;
end $$;
drop trigger if exists profile_guard_prevent_direct_public_text_write on public.profiles;
create trigger profile_guard_prevent_direct_public_text_write before insert or update on public.profiles
for each row execute function public.profile_guard_prevent_direct_public_text_write();

create or replace function public.profile_guard_prompt_write()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if current_user in ('postgres', 'service_role')
     and current_setting('app.profile_guard_write', true) = 'on' then
    return new;
  end if;
  raise exception using errcode = '42501', message = 'PROFILE_GUARD_REQUIRED';
end $$;
drop trigger if exists profile_guard_prompt_write on public.profile_prompts;
create trigger profile_guard_prompt_write before insert or update of prompt_title, answer on public.profile_prompts
for each row execute function public.profile_guard_prompt_write();

create or replace function public.rpc_update_profile_with_guard(p_updates jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog, auth as $$
declare
  v_profile public.profiles%rowtype;
  v_assessment jsonb;
  v_text text;
  v_keys text[];
  v_set text;
  v_allowed constant text[] := array['full_name','bio','avatar_url','hero_image_url','photos','profile_video','gender','age','region','tribe','roots','roots_note','roots_visibility','religion','min_age_interest','max_age_interest','age_preference_confirmed_at','current_country','current_country_code','city','location','latitude','longitude','location_precision','locality_geoname_id','locality_district','locality_admin1_code','locality_provider','location_updated_at','origin_country','origin_country_code','origin_country_source','occupation','education','height','looking_for','exercise_frequency','smoking','drinking','has_children','wants_children','personality_type','love_language','living_situation','pets','languages_spoken','years_in_diaspora','last_ghana_visit','future_ghana_plans','relationship_compass','onboarding_variant','profile_completed','identity_status','onboarding_completed_at','identity_finalized_at','phone_number','phone_verified'];
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' or octet_length(p_updates::text) > 20000 then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_UPDATE';
  end if;
  select * into v_profile from public.profiles where user_id = auth.uid() for update;
  if not found then raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND'; end if;
  select array_agg(key) into v_keys from jsonb_object_keys(p_updates) key;
  if exists (select 1 from unnest(coalesce(v_keys, '{}'::text[])) key where not (key = any(v_allowed))) then
    raise exception using errcode = '42501', message = 'PROFILE_FIELD_NOT_ALLOWED';
  end if;
  v_text := concat_ws(' ', p_updates->>'full_name', p_updates->>'bio', p_updates->>'occupation', p_updates->>'education', p_updates->>'looking_for', p_updates->>'roots_note', p_updates->>'future_ghana_plans');
  v_assessment := public.profile_guard_assess(v_text);
  if (v_assessment->>'decision') <> 'ALLOW' then
    insert into public.profile_moderation_events(user_id, profile_id, field_names, categories, risk_score, decision, source, detector_version, metadata)
    values (auth.uid(), v_profile.id, ARRAY(select key from unnest(v_keys) key where key = any(array['full_name','bio','occupation','education','looking_for','roots_note','future_ghana_plans'])), ARRAY(select jsonb_array_elements_text(v_assessment->'categories')), (v_assessment->>'risk_score')::numeric, v_assessment->>'decision', 'profile_write', '1.0.0', jsonb_build_object('signal_count', jsonb_array_length(v_assessment->'categories')));
    if (v_assessment->>'decision') = 'RESTRICT_PROFILE' then
      update public.profiles set profile_moderation_state = 'RESTRICTED', discoverable_in_vibes = false where id = v_profile.id;
    else
      update public.profiles set profile_moderation_state = 'ACTION_REQUIRED', discoverable_in_vibes = false where id = v_profile.id;
    end if;
    return jsonb_build_object('ok', false, 'code', 'PROFILE_CONTENT_NOT_ALLOWED', 'field_names', ARRAY(select key from unnest(v_keys) key where key = any(array['full_name','bio','occupation','education','looking_for','roots_note','future_ghana_plans'])));
  end if;
  select string_agg(format('%1$I = (jsonb_populate_record(null::public.profiles, $1)).%1$I', key), ', ') into v_set from unnest(v_keys) key;
  perform set_config('app.profile_guard_write', 'on', true);
  execute format('update public.profiles set %s, profile_moderation_state = case when profile_moderation_state in (''ACTION_REQUIRED'', ''RESTRICTED'') then ''CLEAR'' else profile_moderation_state end, discoverable_in_vibes = case when profile_moderation_state in (''ACTION_REQUIRED'', ''RESTRICTED'') then true else discoverable_in_vibes end, updated_at = timezone(''utc'', now()) where id = $2', v_set) using p_updates, v_profile.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rpc_update_profile_with_guard(jsonb) from public, anon, authenticated;

create table if not exists public.profile_guard_configuration (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  semantic_enabled boolean not null default false,
  enforcement_mode text not null default 'ENFORCE' check (enforcement_mode in ('OFF', 'REPORT_ONLY', 'ENFORCE')),
  backfill_enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);
insert into public.profile_guard_configuration(id) values (true) on conflict do nothing;
alter table public.profile_guard_configuration enable row level security;

create or replace function public.rpc_service_update_profile_with_guard(p_user_id uuid, p_updates jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog, auth as $$
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return public.rpc_update_profile_with_guard(p_updates);
end $$;
revoke all on function public.rpc_service_update_profile_with_guard(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_service_update_profile_with_guard(uuid, jsonb) to service_role;

create or replace function public.rpc_apply_profile_guard_semantic_decision(p_user_id uuid, p_category text, p_semantic_scores jsonb)
returns void language plpgsql security definer set search_path = public, pg_catalog, auth as $$
declare v_profile_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  select id into v_profile_id from public.profiles where user_id = p_user_id for update;
  if v_profile_id is null then raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND'; end if;
  insert into public.profile_moderation_events(user_id, profile_id, field_names, categories, risk_score, decision, source, detector_version, metadata)
  values (p_user_id, v_profile_id, array['semantic'], array[p_category], .80, 'HUMAN_REVIEW', 'profile_write', '1.0.0', jsonb_build_object('semantic_used', true, 'score_keys', array(select jsonb_object_keys(coalesce(p_semantic_scores, '{}'::jsonb)))));
  update public.profiles set profile_moderation_state = 'REVIEW_REQUIRED', discoverable_in_vibes = false where id = v_profile_id;
end $$;
revoke all on function public.rpc_apply_profile_guard_semantic_decision(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_apply_profile_guard_semantic_decision(uuid, text, jsonb) to service_role;

create or replace function public.rpc_resolve_profile_guard_review(p_profile_id uuid, p_state text, p_reason_code text)
returns void language plpgsql security definer set search_path = public, pg_catalog, auth as $$
begin
  if not public.is_admin_user(auth.uid()) then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  if p_state not in ('CLEAR', 'RESTRICTED', 'SUSPENDED') then raise exception using errcode = '22023', message = 'INVALID_REVIEW_STATE'; end if;
  update public.profiles set profile_moderation_state = case when p_state = 'SUSPENDED' then 'RESTRICTED' else p_state end, discoverable_in_vibes = p_state = 'CLEAR' where id = p_profile_id;
  update public.profile_moderation_events set reviewed_at = timezone('utc', now()), reviewed_by = auth.uid(), review_outcome = p_state, resolved_at = timezone('utc', now()), metadata = metadata || jsonb_build_object('resolution_reason_code', left(coalesce(p_reason_code, ''), 80)) where profile_id = p_profile_id and reviewed_at is null and decision = 'HUMAN_REVIEW';
end $$;
revoke all on function public.rpc_resolve_profile_guard_review(uuid, text, text) from public, anon;
grant execute on function public.rpc_resolve_profile_guard_review(uuid, text, text) to authenticated;

-- Controlled, resumable scanner. Run from the SQL editor/service role only;
-- report-only is the production default and no raw text is returned or logged.
create or replace function public.rpc_backfill_profile_contact_guard(
  p_batch_size integer default 100,
  p_after_profile_id uuid default null,
  p_enforce boolean default false
) returns table(profile_id uuid, decision text) language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  row_profile record;
  v_assessment jsonb;
  v_backfill_enabled boolean := false;
  v_enforcement_mode text := 'ENFORCE';
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_batch_size < 1 or p_batch_size > 500 then raise exception using errcode = '22023', message = 'INVALID_BATCH_SIZE'; end if;
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
    select id, user_id, full_name, bio, occupation, education, looking_for, roots_note, future_ghana_plans
    from public.profiles
    where deleted_at is null and (p_after_profile_id is null or id > p_after_profile_id)
    order by id limit p_batch_size
  loop
    v_assessment := public.profile_guard_assess(concat_ws(' ', row_profile.full_name, row_profile.bio, row_profile.occupation, row_profile.education, row_profile.looking_for, row_profile.roots_note, row_profile.future_ghana_plans));
    if (v_assessment->>'decision') <> 'ALLOW' then
      insert into public.profile_moderation_events(user_id, profile_id, field_names, categories, risk_score, decision, source, detector_version, metadata)
      values (row_profile.user_id, row_profile.id, array['profile_backfill'], ARRAY(select jsonb_array_elements_text(v_assessment->'categories')), (v_assessment->>'risk_score')::numeric, v_assessment->>'decision', 'backfill', '1.1.0', jsonb_build_object('signal_count', jsonb_array_length(v_assessment->'categories')))
      on conflict do nothing;
      if p_enforce then
        perform set_config('app.profile_guard_write', 'on', true);
        update public.profiles set
          profile_moderation_state = case when (v_assessment->>'decision') = 'RESTRICT_PROFILE' then 'RESTRICTED' else 'ACTION_REQUIRED' end,
          discoverable_in_vibes = false
        where id = row_profile.id;
      end if;
    end if;
    profile_id := row_profile.id; decision := v_assessment->>'decision'; return next;
  end loop;
end $$;
revoke all on function public.rpc_backfill_profile_contact_guard(integer, uuid, boolean) from public;
grant execute on function public.rpc_backfill_profile_contact_guard(integer, uuid, boolean) to service_role;

-- Hardened boundary additions. These definitions supersede the incremental
-- versions above while keeping this not-yet-applied migration reviewable.
revoke all on table public.profile_guard_configuration from public, anon, authenticated;
revoke all on table public.profile_moderation_events from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_guard_configuration to service_role;
grant select, insert, update, delete on table public.profile_moderation_events to service_role;

-- The Edge Function needs only the detector result. No profile text is stored
-- or returned by this function.
revoke all on function public.profile_guard_assess(text) from public, anon, authenticated;
grant execute on function public.profile_guard_assess(text) to service_role;

create or replace function public.profile_guard_structured_text_is_valid(
  p_field text,
  p_value text
)
returns boolean
language plpgsql immutable
set search_path = public, pg_catalog
as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
begin
  if v_value = '' then return true; end if;
  if p_field in ('city', 'region') then
    return char_length(v_value) <= 100
      and v_value ~ '^[[:alpha:]][[:alpha:] .''-]*$'
      and cardinality(regexp_split_to_array(v_value, '\s+')) <= 6
      and v_value !~* '\m(message|contact|follow|subscribe|buy|sale|offer|private|exclusive|whatsapp|telegram|instagram|signal|cashapp|venmo|paypal)\M'
      and (public.profile_guard_assess(v_value)->>'decision') = 'ALLOW';
  end if;
  if p_field = 'last_ghana_visit' then
    return char_length(v_value) <= 40
      and v_value ~ '^[[:alnum:]][[:alnum:] +,.()''/-]*$'
      and (public.profile_guard_assess(v_value)->>'decision') = 'ALLOW';
  end if;
  return false;
end;
$$;
revoke all on function public.profile_guard_structured_text_is_valid(text, text)
from public, anon, authenticated;

create or replace function public.profile_guard_location_is_derived(
  p_location text,
  p_city text,
  p_region text,
  p_country text
)
returns boolean
language sql immutable
set search_path = public, pg_catalog
as $$
  with values_normalized as (
    select
      nullif(btrim(coalesce(p_location, '')), '') as location_value,
      nullif(btrim(coalesce(p_city, '')), '') as city_value,
      nullif(btrim(coalesce(p_region, '')), '') as region_value,
      nullif(btrim(coalesce(p_country, '')), '') as country_value
  )
  select location_value is null or lower(location_value) = any(array_remove(array[
    lower(city_value),
    lower(concat_ws(', ', city_value, region_value)),
    lower(concat_ws(', ', city_value, country_value)),
    lower(concat_ws(', ', city_value, region_value, country_value)),
    lower(region_value),
    lower(concat_ws(', ', region_value, country_value)),
    lower(country_value)
  ], null))
  from values_normalized;
$$;
revoke all on function public.profile_guard_location_is_derived(text, text, text, text)
from public, anon, authenticated;

-- The only generic JSON object accepted by the privileged bridge is checked
-- against this narrow profile-editor allowlist. Identity, verification,
-- entitlement, account, moderation and ownership fields are intentionally absent.
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
    'full_name','bio','avatar_url','hero_image_url','photos','profile_video',
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
    'full_name','bio','occupation','education','looking_for','roots_note','future_ghana_plans'
  ];
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_updates is null or jsonb_typeof(p_updates) <> 'object'
     or octet_length(p_updates::text) > 20000 then
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

  select * into v_profile
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  if (p_updates ? 'city' and (p_updates->>'city') is distinct from v_profile.city
       and not public.profile_guard_structured_text_is_valid('city', p_updates->>'city'))
     or (p_updates ? 'region' and (p_updates->>'region') is distinct from v_profile.region
       and not public.profile_guard_structured_text_is_valid('region', p_updates->>'region'))
     or (p_updates ? 'last_ghana_visit'
       and (p_updates->>'last_ghana_visit') is distinct from v_profile.last_ghana_visit
       and not public.profile_guard_structured_text_is_valid(
         'last_ghana_visit', p_updates->>'last_ghana_visit'
       ))
     or ((p_updates ? 'location' or p_updates ? 'city' or p_updates ? 'region'
            or p_updates ? 'current_country')
       and coalesce(p_updates->>'location', v_profile.location)
         is distinct from v_profile.location
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
    coalesce(p_updates->>'bio', v_profile.bio),
    coalesce(p_updates->>'occupation', v_profile.occupation),
    coalesce(p_updates->>'education', v_profile.education),
    coalesce(p_updates->>'looking_for', v_profile.looking_for),
    coalesce(p_updates->>'roots_note', v_profile.roots_note),
    coalesce(p_updates->>'future_ghana_plans', v_profile.future_ghana_plans)
  );
  v_assessment := public.profile_guard_assess(v_text);
  select
    coalesce(configuration.enabled, true) as enabled,
    case when configuration.enforcement_mode in ('OFF', 'REPORT_ONLY', 'ENFORCE')
      then configuration.enforcement_mode else 'ENFORCE' end as enforcement_mode
  into v_config
  from public.profile_guard_configuration configuration
  where configuration.id = true;
  if not found then
    select true as enabled, 'ENFORCE'::text as enforcement_mode into v_config;
  end if;
  select coalesce(array_agg(key), '{}'::text[])
    into v_guarded_keys
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
      'profile_write', '1.1.0',
      jsonb_build_object(
        'signal_count', jsonb_array_length(v_assessment->'categories'),
        'prior_discoverable', v_profile.discoverable_in_vibes,
        'enforcement_mode', v_config.enforcement_mode
      )
    );
    if v_config.enforcement_mode = 'ENFORCE' then
      perform set_config('app.profile_guard_write', 'on', true);
      update public.profiles
      set profile_moderation_state = case
            when (v_assessment->>'decision') = 'RESTRICT_PROFILE' then 'RESTRICTED'
            else 'ACTION_REQUIRED'
          end,
          discoverable_in_vibes = false,
          updated_at = timezone('utc', now())
      where id = v_profile.id;
      return jsonb_build_object(
        'ok', false,
        'code', 'PROFILE_CONTENT_NOT_ALLOWED',
        'field_names', v_guarded_keys
      );
    end if;
  end if;

  if v_profile.profile_moderation_state in ('ACTION_REQUIRED', 'RESTRICTED')
     and (v_assessment->>'decision') = 'ALLOW' then
    select coalesce((event_row.metadata->>'prior_discoverable')::boolean, false)
      into v_restore_discoverable
    from public.profile_moderation_events event_row
    where event_row.profile_id = v_profile.id
      and event_row.source = 'profile_write'
      and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
    order by event_row.created_at desc
    limit 1;
  end if;

  select string_agg(
    format('%1$I = (jsonb_populate_record(null::public.profiles, $1)).%1$I', key),
    ', '
  ) into v_set from unnest(v_keys) key;
  perform set_config('app.profile_guard_write', 'on', true);
  execute format(
    'update public.profiles set %s,
       profile_moderation_state = case
         when profile_moderation_state in (''ACTION_REQUIRED'', ''RESTRICTED'') then ''CLEAR''
         else profile_moderation_state end,
       discoverable_in_vibes = case
         when profile_moderation_state in (''ACTION_REQUIRED'', ''RESTRICTED'') then $3
         else discoverable_in_vibes end,
       updated_at = timezone(''utc'', now())
     where id = $2',
    v_set
  ) using p_updates, v_profile.id, v_restore_discoverable;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.rpc_service_update_profile_with_guard(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.rpc_service_update_profile_with_guard(uuid, jsonb)
to service_role;

create or replace function public.rpc_service_finalize_profile_onboarding(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  if not v_profile.phone_verified
     or nullif(btrim(coalesce(v_profile.phone_number, '')), '') is null
     or nullif(btrim(coalesce(v_profile.full_name, '')), '') is null
     or v_profile.age is null
     or v_profile.gender is null
     or nullif(btrim(coalesce(v_profile.bio, '')), '') is null then
    raise exception using errcode = '42501', message = 'ONBOARDING_REQUIREMENTS_NOT_MET';
  end if;
  perform set_config('app.profile_guard_write', 'on', true);
  perform set_config('app.server_managed_update', 'on', true);
  update public.profiles
  set identity_status = 'active',
      onboarding_completed_at = coalesce(onboarding_completed_at, timezone('utc', now())),
      identity_finalized_at = coalesce(identity_finalized_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_profile.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.rpc_service_finalize_profile_onboarding(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_finalize_profile_onboarding(uuid)
to service_role;

create or replace function public.rpc_service_insert_profile_prompt_with_guard(
  p_user_id uuid,
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
  v_profile public.profiles%rowtype;
  v_assessment jsonb;
  v_config record;
  v_decision text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_prompt_key, '')), '') is null
     or nullif(btrim(coalesce(p_prompt_title, '')), '') is null
     or nullif(btrim(coalesce(p_answer, '')), '') is null
     or char_length(p_prompt_title) > 160
     or char_length(p_answer) > 1000
     or char_length(coalesce(p_hint_text, '')) > 300
     or p_prompt_type not in ('standard', 'guess')
     or p_reveal_policy not in ('never', 'after_correct') then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_PROMPT';
  end if;
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  v_assessment := public.profile_guard_assess(concat_ws(
    ' ', p_prompt_title, p_answer, p_hint_text,
    case when jsonb_typeof(p_guess_options) = 'array' then p_guess_options::text else null end
  ));
  select coalesce(configuration.enabled, true) as enabled,
    case when configuration.enforcement_mode in ('OFF', 'REPORT_ONLY', 'ENFORCE')
      then configuration.enforcement_mode else 'ENFORCE' end as enforcement_mode
  into v_config
  from public.profile_guard_configuration configuration where configuration.id = true;
  if not found then
    select true as enabled, 'ENFORCE'::text as enforcement_mode into v_config;
  end if;
  v_decision := v_assessment->>'decision';
  if v_config.enabled and v_decision <> 'ALLOW' then
    insert into public.profile_moderation_events(
      user_id, profile_id, field_names, categories, risk_score, decision,
      source, detector_version, metadata
    ) values (
      p_user_id, v_profile.id, array['profile_prompt'],
      array(select jsonb_array_elements_text(v_assessment->'categories')),
      (v_assessment->>'risk_score')::numeric,
      case when v_config.enforcement_mode = 'REPORT_ONLY'
        then 'ALLOW_AND_LOG' else v_decision end,
      'profile_write', '1.1.0',
      jsonb_build_object('enforcement_mode', v_config.enforcement_mode)
    );
    if v_config.enforcement_mode = 'ENFORCE' then
      perform set_config('app.profile_guard_write', 'on', true);
      update public.profiles
      set profile_moderation_state = case when v_decision = 'RESTRICT_PROFILE'
            then 'RESTRICTED' else 'ACTION_REQUIRED' end,
          discoverable_in_vibes = false,
          updated_at = timezone('utc', now())
      where id = v_profile.id;
      return jsonb_build_object('ok', false, 'code', 'PROFILE_CONTENT_NOT_ALLOWED');
    end if;
  end if;
  perform set_config('app.profile_guard_write', 'on', true);
  insert into public.profile_prompts(
    profile_id, prompt_key, prompt_title, prompt_type, answer, guess_mode,
    guess_options, hint_text, normalized_answer, reveal_policy
  ) values (
    v_profile.id, btrim(p_prompt_key), btrim(p_prompt_title), p_prompt_type,
    btrim(p_answer), p_guess_mode, p_guess_options, nullif(btrim(coalesce(p_hint_text, '')), ''),
    lower(regexp_replace(btrim(p_answer), '\s+', ' ', 'g')), p_reveal_policy
  );
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.rpc_service_insert_profile_prompt_with_guard(
  uuid, text, text, text, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_insert_profile_prompt_with_guard(
  uuid, text, text, text, text, text, jsonb, text, text
) to service_role;

-- The original authenticated helper would bypass semantic review. It remains
-- as a fail-closed compatibility stub only; it cannot update any field.
create or replace function public.rpc_update_profile_with_guard(p_updates jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
begin
  raise exception using errcode = '42501', message = 'PROFILE_GUARD_EDGE_REQUIRED';
end;
$$;
revoke all on function public.rpc_update_profile_with_guard(jsonb)
from public, anon, authenticated, service_role;

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
    p_user_id, v_profile_id, array['semantic'], array[left(coalesce(p_reason_code, ''), 80)],
    0, p_decision, 'profile_write', '1.1.0', jsonb_build_object('semantic_used', true)
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
  if v_score < 0.8 or v_score > 1 then
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
    'HUMAN_REVIEW', 'profile_write', '1.1.0',
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

create or replace function public.rpc_resolve_profile_guard_review(
  p_profile_id uuid,
  p_state text,
  p_reason_code text
)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_restore_discoverable boolean := false;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_state not in ('CLEAR', 'RESTRICTED', 'SUSPENDED') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_STATE';
  end if;
  if p_state = 'CLEAR' then
    select coalesce((event_row.metadata->>'prior_discoverable')::boolean, false)
      into v_restore_discoverable
    from public.profile_moderation_events event_row
    where event_row.profile_id = p_profile_id and event_row.decision = 'HUMAN_REVIEW'
    order by event_row.created_at desc limit 1;
  end if;
  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set profile_moderation_state = p_state,
      discoverable_in_vibes = case when p_state = 'CLEAR'
        then v_restore_discoverable else false end,
      updated_at = timezone('utc', now())
  where id = p_profile_id;
  update public.profile_moderation_events
  set reviewed_at = timezone('utc', now()),
      reviewed_by = auth.uid(),
      review_outcome = p_state,
      resolved_at = timezone('utc', now()),
      metadata = metadata || jsonb_build_object(
        'resolution_reason_code', left(coalesce(p_reason_code, ''), 80)
      )
  where profile_id = p_profile_id
    and reviewed_at is null
    and decision = 'HUMAN_REVIEW';
end;
$$;
revoke all on function public.rpc_resolve_profile_guard_review(uuid, text, text)
from public, anon;
grant execute on function public.rpc_resolve_profile_guard_review(uuid, text, text)
to authenticated;

create or replace function public.profile_guard_prevent_direct_public_text_write()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_trusted_write boolean := current_user in ('postgres', 'service_role')
    and current_setting('app.profile_guard_write', true) = 'on';
begin
  if tg_op = 'UPDATE'
     and new.profile_moderation_state is distinct from old.profile_moderation_state
     and not v_trusted_write then
    raise exception using errcode = '42501', message = 'PROFILE_MODERATION_STATE_SERVER_MANAGED';
  end if;

  if (tg_op = 'INSERT' or new.city is distinct from old.city)
       and not public.profile_guard_structured_text_is_valid('city', new.city)
     or (tg_op = 'INSERT' or new.region is distinct from old.region)
       and not public.profile_guard_structured_text_is_valid('region', new.region)
     or (tg_op = 'INSERT' or new.last_ghana_visit is distinct from old.last_ghana_visit)
       and not public.profile_guard_structured_text_is_valid(
         'last_ghana_visit', new.last_ghana_visit
       )
     or (tg_op = 'INSERT'
          or new.location is distinct from old.location
          or new.city is distinct from old.city
          or new.region is distinct from old.region
          or new.current_country is distinct from old.current_country)
       and not public.profile_guard_location_is_derived(
         new.location, new.city, new.region, new.current_country
       ) then
    raise exception using errcode = '22023', message = 'INVALID_STRUCTURED_PROFILE_FIELD';
  end if;

  if new.profile_moderation_state <> 'CLEAR' and new.discoverable_in_vibes then
    if v_trusted_write then
      new.discoverable_in_vibes := false;
    else
      raise exception using errcode = '42501', message = 'PROFILE_NOT_PUBLICLY_ELIGIBLE';
    end if;
  end if;

  if v_trusted_write then return new; end if;
  if (tg_op = 'INSERT' and concat_ws('', new.full_name, new.bio, new.occupation,
      new.education, new.looking_for, new.roots_note, new.future_ghana_plans) <> '')
    or (tg_op = 'UPDATE' and (
      new.full_name is distinct from old.full_name
      or new.bio is distinct from old.bio
      or new.occupation is distinct from old.occupation
      or new.education is distinct from old.education
      or new.looking_for is distinct from old.looking_for
      or new.roots_note is distinct from old.roots_note
      or new.future_ghana_plans is distinct from old.future_ghana_plans
    )) then
    raise exception using errcode = '42501', message = 'PROFILE_GUARD_REQUIRED';
  end if;
  return new;
end;
$$;

create or replace function public.profile_guard_protect_system_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_trusted_write boolean := current_user in ('postgres', 'service_role')
    and (
      current_setting('app.profile_guard_write', true) = 'on'
      or current_setting('app.server_managed_update', true) = 'on'
    );
begin
  if not v_trusted_write and (
    new.profile_completed is distinct from old.profile_completed
    or new.identity_status is distinct from old.identity_status
    or new.onboarding_completed_at is distinct from old.onboarding_completed_at
    or new.identity_finalized_at is distinct from old.identity_finalized_at
    or new.profile_moderation_state is distinct from old.profile_moderation_state
  ) then
    raise exception using errcode = '42501', message = 'PROFILE_SYSTEM_FIELD_SERVER_MANAGED';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_guard_protect_system_fields on public.profiles;
create trigger profile_guard_protect_system_fields
before update of profile_completed, identity_status, onboarding_completed_at,
  identity_finalized_at, profile_moderation_state
on public.profiles
for each row execute function public.profile_guard_protect_system_fields();

-- Authoritative stranger-facing predicate. New public surfacing features must
-- compose this function rather than testing moderation state ad hoc.
create or replace function public.can_profile_surface_publicly(p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.user_id is not null
      and profile.deleted_at is null
      and profile.account_state = 'active'
      and coalesce(profile.is_active, true)
      and coalesce(profile.profile_completed, false)
      and coalesce(profile.discoverable_in_vibes, true)
      and coalesce(profile.matchmaking_mode, false) = false
      and profile.profile_moderation_state = 'CLEAR'
  );
$$;
revoke all on function public.can_profile_surface_publicly(uuid)
from public, anon, authenticated;

-- Existing romantic eligibility remains authoritative for relationship, age,
-- block and Circle rules; it now composes the public-surfacing predicate for
-- both participants.
create or replace function public.is_romantically_eligible(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_context_type text default 'global',
  p_context_id uuid default null
)
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select public.can_profile_surface_publicly(p_actor_profile_id)
    and public.can_profile_surface_publicly(p_target_profile_id)
    and exists (
      select 1
      from public.profiles actor
      join public.profiles target on target.id = p_target_profile_id
      where actor.id = p_actor_profile_id
        and actor.id <> target.id
        and (
          upper(btrim(coalesce(actor.gender::text, ''))) not in ('MALE', 'FEMALE')
          or upper(btrim(coalesce(target.gender::text, ''))) not in ('MALE', 'FEMALE')
          or upper(btrim(actor.gender::text)) <> upper(btrim(target.gender::text))
        )
        and (actor.age_preference_confirmed_at is null or actor.min_age_interest is null
          or target.age is null or target.age >= actor.min_age_interest)
        and (actor.age_preference_confirmed_at is null or actor.max_age_interest is null
          or target.age is null or target.age <= actor.max_age_interest)
        and (target.age_preference_confirmed_at is null or target.min_age_interest is null
          or actor.age is null or actor.age >= target.min_age_interest)
        and (target.age_preference_confirmed_at is null or target.max_age_interest is null
          or actor.age is null or actor.age <= target.max_age_interest)
        and not exists (
          select 1 from public.blocks blocked
          where (blocked.blocker_id = actor.user_id and blocked.blocked_id = target.user_id)
             or (blocked.blocker_id = target.user_id and blocked.blocked_id = actor.user_id)
        )
        and (
          lower(coalesce(p_context_type, 'global')) <> 'circle'
          or (
            p_context_id is not null
            and exists (
              select 1
              from public.circle_members actor_member
              join public.circle_dating_preferences actor_preference
                on actor_preference.circle_id = actor_member.circle_id
               and actor_preference.profile_id = actor_member.profile_id
              where actor_member.circle_id = p_context_id
                and actor_member.profile_id = actor.id
                and actor_member.status = 'active'
                and actor_member.is_visible is not false
                and actor_preference.opted_in
                and actor_preference.open_to_intents
            )
            and exists (
              select 1
              from public.circle_members target_member
              join public.circle_dating_preferences target_preference
                on target_preference.circle_id = target_member.circle_id
               and target_preference.profile_id = target_member.profile_id
              where target_member.circle_id = p_context_id
                and target_member.profile_id = target.id
                and target_member.status = 'active'
                and target_member.is_visible is not false
                and target_preference.opted_in
                and target_preference.open_to_intents
            )
          )
        )
    );
$$;
revoke all on function public.is_romantically_eligible(uuid, uuid, text, uuid)
from public, anon, authenticated;

-- Quick Connect has additional session, presence, safety-hold and repeat-pair
-- rules, so its existing evaluator is retained and only composes the canonical
-- profile predicate.
create or replace function public.live_quick_connect_pair_is_eligible(
  p_session_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.live_sessions session
      join public.live_participants a
        on a.session_id = session.id and a.user_id = p_user_a
      join public.live_participants b
        on b.session_id = session.id and b.user_id = p_user_b
      join public.live_quick_connect_participants qa
        on qa.session_id = session.id and qa.user_id = p_user_a
      join public.live_quick_connect_participants qb
        on qb.session_id = session.id and qb.user_id = p_user_b
      join public.profiles pa on pa.id = a.profile_id and pa.user_id = a.user_id
      join public.profiles pb on pb.id = b.profile_id and pb.user_id = b.user_id
      where session.id = p_session_id
        and session.format = 'quick_connect'
        and session.status = 'live'
        and a.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and b.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and qa.state = 'waiting' and qb.state = 'waiting'
        and qa.connection_state = 'connected' and qb.connection_state = 'connected'
        and qa.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
        and qb.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
        and public.can_profile_surface_publicly(pa.id)
        and public.can_profile_surface_publicly(pb.id)
        and coalesce(pa.verification_level, 0) >= 1
        and coalesce(pb.verification_level, 0) >= 1
        and (
          (pa.gender = 'MALE'::public.gender and pb.gender = 'FEMALE'::public.gender)
          or (pa.gender = 'FEMALE'::public.gender and pb.gender = 'MALE'::public.gender)
        )
        and (pa.age_preference_confirmed_at is null or pa.min_age_interest is null
          or pb.age is null or pb.age >= pa.min_age_interest)
        and (pa.age_preference_confirmed_at is null or pa.max_age_interest is null
          or pb.age is null or pb.age <= pa.max_age_interest)
        and (pb.age_preference_confirmed_at is null or pb.min_age_interest is null
          or pa.age is null or pa.age >= pb.min_age_interest)
        and (pb.age_preference_confirmed_at is null or pb.max_age_interest is null
          or pa.age is null or pa.age <= pb.max_age_interest)
        and not public.live_quick_connect_has_active_safety_hold(p_user_a)
        and not public.live_quick_connect_has_active_safety_hold(p_user_b)
        and not exists (
          select 1 from public.blocks blocked
          where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
             or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
        )
    )
    and not exists (
      select 1
      from public.live_private_sparks spark
      where (
        (spark.state = 'awaiting_consent' and (
          spark.consent_expires_at is null
          or spark.consent_expires_at > timezone('utc', now())
        ))
        or (spark.state = 'active' and (
          spark.active_expires_at is null
          or spark.active_expires_at > timezone('utc', now())
        ))
      )
      and (
        p_user_a in (spark.participant_a_user_id, spark.participant_b_user_id)
        or p_user_b in (spark.participant_a_user_id, spark.participant_b_user_id)
      )
    )
    and (
      select count(*)
      from public.live_quick_connect_pairings previous
      where previous.session_id = p_session_id
        and least(previous.participant_a_user_id, previous.participant_b_user_id)
          = least(p_user_a, p_user_b)
        and greatest(previous.participant_a_user_id, previous.participant_b_user_id)
          = greatest(p_user_a, p_user_b)
    ) < 2
    and not exists (
      select 1
      from public.live_quick_connect_pairings previous
      where previous.session_id = p_session_id
        and least(previous.participant_a_user_id, previous.participant_b_user_id)
          = least(p_user_a, p_user_b)
        and greatest(previous.participant_a_user_id, previous.participant_b_user_id)
          = greatest(p_user_a, p_user_b)
        and (
          previous.state <> 'round_incomplete'
          or previous.completion_reason not in ('reconnect_grace_expired', 'media_admission_failed')
          or exists (
            select 1
            from public.live_quick_connect_safety_checks safety
            where safety.pairing_id = previous.id
              and (safety.status <> 'completed' or safety.experience <> 'respectful')
          )
        )
    );
$$;
revoke all on function public.live_quick_connect_pair_is_eligible(uuid, uuid, uuid)
from public, anon, authenticated;

create or replace function public.live_pool_profile_is_enabled(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.user_id = p_user_id
      and public.can_profile_surface_publicly(profile.id)
  ) and coalesce((
    select preferences.allow_pooled_live_sessions
    from public.notification_prefs preferences
    where preferences.user_id = p_user_id
  ), true);
$$;
revoke all on function public.live_pool_profile_is_enabled(uuid)
from public, anon, authenticated;

-- Direct reads may still serve an owner, an established match, or a fellow
-- active Circle member. Those are relationship-scoped reads, not stranger
-- discovery, and therefore do not reopen public surfacing.
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
    exists (select 1 from public.profiles p where p.id = p_profile_id and p.user_id = auth.uid())
    or public.can_profile_surface_publicly(p_profile_id)
    or exists (
      select 1 from public.matches match_row, viewer
      where match_row.status = 'ACCEPTED'::public.match_status
        and viewer.id = any(array[match_row.user1_id, match_row.user2_id])
        and p_profile_id = any(array[match_row.user1_id, match_row.user2_id])
    )
    or exists (
      select 1
      from public.circle_members viewer_member
      join viewer on viewer.id = viewer_member.profile_id
      join public.circle_members target_member
        on target_member.circle_id = viewer_member.circle_id
       and target_member.profile_id = p_profile_id
      where viewer_member.status = 'active'
        and target_member.status = 'active'
    )
  );
$$;
revoke all on function public.can_authenticated_user_view_profile(uuid)
from public, anon, authenticated;

create or replace function public.get_viewed_profile_prompts(
  p_profile_id uuid,
  p_viewer_profile_id uuid default null
)
returns table(
  id uuid, profile_id uuid, prompt_key text, prompt_title text,
  prompt_type text, answer text, guess_mode text, guess_options jsonb,
  hint_text text, reveal_policy text, viewer_guess text,
  viewer_guess_is_correct boolean, created_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_authorized_viewer uuid;
begin
  if not public.can_authenticated_user_view_profile(p_profile_id) then return; end if;
  if p_viewer_profile_id is not null then
    select profile.id into v_authorized_viewer
    from public.profiles profile
    where profile.id = p_viewer_profile_id and profile.user_id = auth.uid()
    limit 1;
  end if;
  return query
  select prompt.id, prompt.profile_id, prompt.prompt_key, prompt.prompt_title,
    coalesce(prompt.prompt_type, 'standard'),
    case
      when coalesce(prompt.prompt_type, 'standard') = 'standard' then prompt.answer
      when coalesce(prompt.reveal_policy, 'never') = 'after_correct'
        and coalesce(guess.is_correct, false) then prompt.answer
      else ''
    end,
    prompt.guess_mode, prompt.guess_options, prompt.hint_text,
    coalesce(prompt.reveal_policy, 'never'), guess.guessed_value, guess.is_correct,
    prompt.created_at
  from public.profile_prompts prompt
  left join public.profile_prompt_guesses guess
    on guess.profile_prompt_id = prompt.id
   and guess.viewer_profile_id = v_authorized_viewer
  where prompt.profile_id = p_profile_id
  order by prompt.created_at desc;
end;
$$;
revoke all on function public.get_viewed_profile_prompts(uuid, uuid) from public, anon;
grant execute on function public.get_viewed_profile_prompts(uuid, uuid) to authenticated;

drop policy if exists "Users can view any profile" on public.profiles;
drop policy if exists "Users can view available profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists profiles_select_owner on public.profiles;
create policy profiles_select_authorized on public.profiles
for select to authenticated
using (public.can_authenticated_user_view_profile(id));

commit;
