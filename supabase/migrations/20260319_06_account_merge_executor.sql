create table if not exists public.merged_accounts (
  source_user_id uuid primary key references auth.users(id) on delete restrict,
  source_profile_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  merge_case_id uuid not null unique references public.account_merge_cases(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'reverted')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint merged_accounts_distinct_users check (source_user_id <> target_user_id),
  constraint merged_accounts_distinct_profiles check (source_profile_id <> target_profile_id)
);

create index if not exists merged_accounts_target_user_id_idx
  on public.merged_accounts (target_user_id, created_at desc);

alter table public.merged_accounts enable row level security;

revoke all on public.merged_accounts from anon, authenticated;

create table if not exists public.account_merge_execution_failures (
  id uuid primary key default gen_random_uuid(),
  merge_case_id uuid references public.account_merge_cases(id) on delete cascade,
  source_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  sqlstate text,
  failed_step text,
  error_message text not null,
  error_detail text,
  error_hint text,
  error_context text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists account_merge_execution_failures_case_idx
  on public.account_merge_execution_failures (merge_case_id, created_at desc);

alter table public.account_merge_execution_failures enable row level security;

revoke all on public.account_merge_execution_failures from anon, authenticated;

create or replace function public.rpc_get_merged_account_redirect()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_record public.merged_accounts%rowtype;
  v_target_email text;
  v_target_email_hint text;
  v_target_email_local text;
  v_target_email_domain text;
  v_target_methods text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
    into v_record
  from public.merged_accounts
  where source_user_id = auth.uid()
    and status = 'active'
  limit 1;

  if v_record.source_user_id is null then
    return jsonb_build_object('is_merged', false);
  end if;

  select u.email
    into v_target_email
  from auth.users u
  where u.id = v_record.target_user_id
  limit 1;

  if v_target_email is not null and position('@' in v_target_email) > 1 then
    v_target_email_local := split_part(v_target_email, '@', 1);
    v_target_email_domain := split_part(v_target_email, '@', 2);
    v_target_email_hint :=
      left(v_target_email_local, 1)
      || repeat('*', greatest(char_length(v_target_email_local) - 1, 2))
      || '@'
      || left(v_target_email_domain, 1)
      || repeat('*', greatest(char_length(v_target_email_domain) - 3, 2))
      || right(v_target_email_domain, 2);
  end if;

  select coalesce(array_agg(distinct lower(i.provider) order by lower(i.provider)), array[]::text[])
    into v_target_methods
  from auth.identities i
  where i.user_id = v_record.target_user_id;

  return jsonb_build_object(
    'is_merged', true,
    'target_user_id', v_record.target_user_id,
    'target_profile_id', v_record.target_profile_id,
    'merge_case_id', v_record.merge_case_id,
    'kept_email_hint', v_target_email_hint,
    'kept_sign_in_methods', to_jsonb(coalesce(v_target_methods, array[]::text[])),
    'message', 'This sign-in method is attached to an older Betweener account that has already been merged.'
  );
end;
$$;

create or replace function public.rpc_admin_execute_account_merge_case(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_case public.account_merge_cases%rowtype;
  v_source_profile public.profiles%rowtype;
  v_target_profile public.profiles%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_count bigint := 0;
  v_counts jsonb := '{}'::jsonb;
  v_execution_summary jsonb;
  v_last_step text := 'initialize';
  v_sqlstate text;
  v_error_message text;
  v_error_detail text;
  v_error_hint text;
  v_error_context text;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  v_last_step := 'load_merge_case';
  select *
    into v_case
  from public.account_merge_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'merge case not found';
  end if;

  if coalesce(lower(v_case.status), '') not in ('approved', 'scheduled') then
    raise exception 'merge case must be approved before execution';
  end if;

  if exists (
    select 1
    from public.merged_accounts ma
    where ma.merge_case_id = v_case.id
       or ma.source_user_id = v_case.source_user_id
  ) then
    raise exception 'merge case already executed';
  end if;

  v_last_step := 'load_source_profile';
  select *
    into v_source_profile
  from public.profiles
  where id = coalesce(
    v_case.source_profile_id,
    (select p.id from public.profiles p where p.user_id = v_case.source_user_id limit 1)
  )
  limit 1;

  v_last_step := 'load_target_profile';
  select *
    into v_target_profile
  from public.profiles
  where id = coalesce(
    v_case.target_profile_id,
    (select p.id from public.profiles p where p.user_id = v_case.target_user_id limit 1)
  )
  limit 1;

  if v_source_profile.id is null or v_target_profile.id is null then
    raise exception 'source and target profiles are required';
  end if;

  if v_source_profile.id = v_target_profile.id or v_case.source_user_id = v_case.target_user_id then
    raise exception 'source and target accounts must be different';
  end if;

  create temporary table tmp_merge_counts (
    label text primary key,
    moved_count bigint not null default 0
  ) on commit drop;

  create temporary table tmp_swipe_pairs (
    swiper_id uuid not null,
    target_id uuid not null,
    action text not null,
    created_at timestamptz not null
  ) on commit drop;

  create temporary table tmp_match_pairs (
    user1_id uuid not null,
    user2_id uuid not null,
    status text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
  ) on commit drop;

  create temporary table tmp_intent_requests (
    id uuid not null,
    actor_id uuid not null,
    recipient_id uuid not null,
    type text not null,
    message text null,
    suggested_time timestamptz null,
    suggested_place text null,
    status text not null,
    created_at timestamptz not null,
    expires_at timestamptz not null,
    metadata jsonb not null
  ) on commit drop;

  create temporary table tmp_date_plans (
    id uuid not null,
    accepted_at timestamptz null,
    accepted_by_profile_id uuid null,
    city text null,
    concierge_requested boolean not null,
    concierge_requested_at timestamptz null,
    concierge_requested_by_profile_id uuid null,
    created_at timestamptz not null,
    creator_profile_id uuid not null,
    creator_user_id uuid not null,
    declined_at timestamptz null,
    declined_by_profile_id uuid null,
    lat double precision null,
    lng double precision null,
    message_id uuid null,
    note text null,
    parent_plan_id uuid null,
    place_address text null,
    place_badges jsonb not null,
    place_name text not null,
    place_source text not null,
    place_summary text null,
    recipient_profile_id uuid not null,
    recipient_user_id uuid not null,
    response_kind text not null,
    scheduled_for timestamptz not null,
    status text not null,
    updated_at timestamptz not null,
    venue_id uuid null
  ) on commit drop;

  create temporary table tmp_concierge_requests (
    id uuid not null,
    date_plan_id uuid not null,
    requested_by_profile_id uuid not null,
    requested_by_user_id uuid not null,
    assigned_admin_user_id uuid null,
    status text not null,
    note text null,
    resolved_at timestamptz null,
    created_at timestamptz not null,
    updated_at timestamptz not null
  ) on commit drop;

  v_last_step := 'merge_verification_requests';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'verification_requests') then
    update public.verification_requests
       set user_id = v_case.target_user_id
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('verification_requests_user_id', v_count);

    update public.verification_requests
       set profile_id = v_target_profile.id
     where profile_id = v_source_profile.id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('verification_requests_profile_id', v_count);
  end if;

  v_last_step := 'merge_push_tokens';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_tokens') then
    update public.push_tokens
       set user_id = v_case.target_user_id,
           updated_at = v_now
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('push_tokens', v_count);
  end if;

  v_last_step := 'merge_notification_prefs';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_prefs') then
    select count(*)
      into v_count
    from public.notification_prefs
    where user_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('notification_prefs', v_count);

    create temporary table tmp_notification_pref_rows on commit drop as
    select
      np.id,
      v_case.target_user_id as user_id,
      np.push_enabled,
      np.inapp_enabled,
      np.messages,
      np.reactions,
      np.likes,
      np.superlikes,
      np.matches,
      np.moments,
      np.verification,
      np.announcements,
      np.preview_text,
      np.message_reactions,
      np.notes,
      np.gifts,
      np.boosts,
      np.quiet_hours_enabled,
      np.quiet_hours_start,
      np.quiet_hours_end,
      np.quiet_hours_tz,
      np.updated_at,
      case when np.user_id = v_case.target_user_id then 0 else 1 end as source_rank
    from public.notification_prefs np
    where np.user_id in (v_case.source_user_id, v_case.target_user_id);

    if exists (select 1 from tmp_notification_pref_rows) then
      delete from public.notification_prefs
      where user_id in (v_case.source_user_id, v_case.target_user_id);

      insert into public.notification_prefs (
        id,
        user_id,
        push_enabled,
        inapp_enabled,
        messages,
        reactions,
        likes,
        superlikes,
        matches,
        moments,
        verification,
        announcements,
        preview_text,
        updated_at,
        message_reactions,
        notes,
        gifts,
        boosts,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
        quiet_hours_tz
      )
      select
        chosen.id,
        chosen.user_id,
        chosen.push_enabled,
        chosen.inapp_enabled,
        chosen.messages,
        chosen.reactions,
        chosen.likes,
        chosen.superlikes,
        chosen.matches,
        chosen.moments,
        chosen.verification,
        chosen.announcements,
        chosen.preview_text,
        chosen.updated_at,
        chosen.message_reactions,
        chosen.notes,
        chosen.gifts,
        chosen.boosts,
        chosen.quiet_hours_enabled,
        chosen.quiet_hours_start,
        chosen.quiet_hours_end,
        chosen.quiet_hours_tz
      from (
        select distinct on (user_id)
          id,
          user_id,
          push_enabled,
          inapp_enabled,
          messages,
          reactions,
          likes,
          superlikes,
          matches,
          moments,
          verification,
          announcements,
          preview_text,
          updated_at,
          message_reactions,
          notes,
          gifts,
          boosts,
          quiet_hours_enabled,
          quiet_hours_start,
          quiet_hours_end,
          quiet_hours_tz
        from tmp_notification_pref_rows
        order by user_id, source_rank asc, updated_at desc, id desc
      ) chosen;
    end if;
  end if;

  v_last_step := 'merge_settings';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'settings') then
    select count(*)
      into v_count
    from public.settings
    where user_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('settings', v_count);

    create temporary table tmp_settings_rows on commit drop as
    select
      s.id,
      v_case.target_user_id as user_id,
      s.notifications,
      s.show_online,
      s.dark_mode,
      s.show_age,
      s.show_distance,
      s.created_at,
      s.updated_at,
      case when s.user_id = v_case.target_user_id then 0 else 1 end as source_rank
    from public.settings s
    where s.user_id in (v_case.source_user_id, v_case.target_user_id);

    if exists (select 1 from tmp_settings_rows) then
      delete from public.settings
      where user_id in (v_case.source_user_id, v_case.target_user_id);

      insert into public.settings (
        id,
        user_id,
        notifications,
        show_online,
        dark_mode,
        show_age,
        show_distance,
        created_at,
        updated_at
      )
      select
        chosen.id,
        chosen.user_id,
        chosen.notifications,
        chosen.show_online,
        chosen.dark_mode,
        chosen.show_age,
        chosen.show_distance,
        chosen.created_at,
        chosen.updated_at
      from (
        select distinct on (user_id)
          id,
          user_id,
          notifications,
          show_online,
          dark_mode,
          show_age,
          show_distance,
          created_at,
          updated_at
        from tmp_settings_rows
        order by user_id, source_rank asc, updated_at desc, created_at desc, id desc
      ) chosen;
    end if;
  end if;

  v_last_step := 'merge_subscriptions';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscriptions') then
    select count(*)
      into v_count
    from public.subscriptions
    where user_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('subscriptions', v_count);

    create temporary table tmp_subscription_rows on commit drop as
    select
      s.id,
      v_case.target_user_id as user_id,
      s.type,
      s.started_at,
      s.ends_at,
      s.is_active,
      s.source,
      s.external_customer_id,
      s.external_product_id,
      s.external_entitlement,
      s.external_environment,
      s.updated_at,
      case when s.user_id = v_case.target_user_id then 0 else 1 end as source_rank
    from public.subscriptions s
    where s.user_id in (v_case.source_user_id, v_case.target_user_id);

    delete from public.subscriptions
    where user_id in (v_case.source_user_id, v_case.target_user_id);

    insert into public.subscriptions (
      id,
      user_id,
      type,
      started_at,
      ends_at,
      is_active,
      source,
      external_customer_id,
      external_product_id,
      external_entitlement,
      external_environment,
      updated_at
    )
    select
      ranked.id,
      ranked.user_id,
      ranked.type,
      ranked.started_at,
      ranked.ends_at,
      ranked.is_active,
      ranked.source,
      ranked.external_customer_id,
      ranked.external_product_id,
      ranked.external_entitlement,
      ranked.external_environment,
      ranked.updated_at
    from (
      select
        id,
        user_id,
        type,
        started_at,
        ends_at,
        is_active,
        source,
        external_customer_id,
        external_product_id,
        external_entitlement,
        external_environment,
        updated_at
      from tmp_subscription_rows
      where external_product_id is null

      union all

      select
        deduped.id,
        deduped.user_id,
        deduped.type,
        deduped.started_at,
        deduped.ends_at,
        deduped.is_active,
        deduped.source,
        deduped.external_customer_id,
        deduped.external_product_id,
        deduped.external_entitlement,
        deduped.external_environment,
        deduped.updated_at
      from (
        select distinct on (source, external_product_id, ends_at)
          id,
          user_id,
          type,
          started_at,
          ends_at,
          is_active,
          source,
          external_customer_id,
          external_product_id,
          external_entitlement,
          external_environment,
          updated_at,
          source_rank
        from tmp_subscription_rows
        where external_product_id is not null
        order by
          source,
          external_product_id,
          ends_at,
          is_active desc,
          updated_at desc,
          started_at desc,
          source_rank asc,
          id desc
      ) deduped
    ) ranked;
  end if;

  v_last_step := 'merge_photos';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'photos') then
    select count(*)
      into v_count
    from public.photos
    where user_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('photos', v_count);

    create temporary table tmp_photo_candidates on commit drop as
    select
      p.id,
      p.url,
      v_case.target_user_id as user_id,
      p.is_primary,
      p.ordering,
      p.created_at,
      case when p.user_id = v_case.target_user_id then 0 else 1 end as source_rank
    from public.photos p
    where p.user_id in (v_case.source_user_id, v_case.target_user_id);

    delete from public.photos
    where user_id in (v_case.source_user_id, v_case.target_user_id);

    create temporary table tmp_photo_rows on commit drop as
    select
      deduped.id,
      deduped.url,
      deduped.user_id,
      case
        when row_number() over (
          order by
            deduped.is_primary desc,
            deduped.source_rank asc,
            deduped.ordering asc,
            deduped.created_at asc,
            deduped.id asc
        ) = 1 then true
        else false
      end as is_primary,
      row_number() over (
        order by
          deduped.is_primary desc,
          deduped.source_rank asc,
          deduped.ordering asc,
          deduped.created_at asc,
          deduped.id asc
      ) - 1 as ordering,
      deduped.created_at
    from (
      select distinct on (url)
        id,
        url,
        user_id,
        is_primary,
        ordering,
        created_at,
        source_rank
      from tmp_photo_candidates
      order by
        url,
        source_rank asc,
        is_primary desc,
        ordering asc,
        created_at asc,
        id asc
    ) deduped;

    insert into public.photos (
      id,
      url,
      user_id,
      is_primary,
      ordering,
      created_at
    )
    select
      id,
      url,
      user_id,
      is_primary,
      ordering,
      created_at
    from tmp_photo_rows;
  end if;

  v_last_step := 'merge_inbox_items';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inbox_items') then
    update public.inbox_items
       set user_id = v_case.target_user_id
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('inbox_items', v_count);
  end if;

  v_last_step := 'merge_phone_verifications';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'phone_verifications') then
    update public.phone_verifications
       set user_id = v_case.target_user_id,
           updated_at = v_now
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('phone_verifications', v_count);
  end if;

  v_last_step := 'merge_signup_events';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'signup_events') then
    update public.signup_events
       set user_id = v_case.target_user_id,
           updated_at = v_now
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('signup_events', v_count);
  end if;

  v_last_step := 'merge_travel_history';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'travel_history') then
    update public.travel_history
       set user_id = v_case.target_user_id
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('travel_history', v_count);
  end if;

  v_last_step := 'merge_user_location_profiles';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_location_profiles') then
    select count(*)
      into v_count
    from public.user_location_profiles
    where user_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('user_location_profiles', v_count);

    create temporary table tmp_user_location_profile_rows on commit drop as
    select
      ulp.id,
      ulp.created_at,
      ulp.current_address,
      ulp.current_location,
      ulp.current_travel_mode,
      ulp.diaspora_status,
      ulp.ghana_region,
      ulp.home_address,
      ulp.home_location,
      ulp.hometown,
      ulp.is_traveling,
      ulp.location_sharing,
      ulp.location_updated_at,
      ulp.privacy_level,
      ulp.traditional_area,
      ulp.travel_confidence,
      ulp.tribe,
      ulp.updated_at,
      v_case.target_user_id as user_id,
      ulp.work_address,
      ulp.work_location,
      ulp.years_in_diaspora,
      case when ulp.user_id = v_case.target_user_id then 0 else 1 end as source_rank
    from public.user_location_profiles ulp
    where ulp.user_id in (v_case.source_user_id, v_case.target_user_id);

    if exists (select 1 from tmp_user_location_profile_rows) then
      delete from public.user_location_profiles
      where user_id in (v_case.source_user_id, v_case.target_user_id);

      insert into public.user_location_profiles (
        id,
        created_at,
        current_address,
        current_location,
        current_travel_mode,
        diaspora_status,
        ghana_region,
        home_address,
        home_location,
        hometown,
        is_traveling,
        location_sharing,
        location_updated_at,
        privacy_level,
        traditional_area,
        travel_confidence,
        tribe,
        updated_at,
        user_id,
        work_address,
        work_location,
        years_in_diaspora
      )
      select
        chosen.id,
        chosen.created_at,
        chosen.current_address,
        chosen.current_location,
        chosen.current_travel_mode,
        chosen.diaspora_status,
        chosen.ghana_region,
        chosen.home_address,
        chosen.home_location,
        chosen.hometown,
        chosen.is_traveling,
        chosen.location_sharing,
        chosen.location_updated_at,
        chosen.privacy_level,
        chosen.traditional_area,
        chosen.travel_confidence,
        chosen.tribe,
        chosen.updated_at,
        chosen.user_id,
        chosen.work_address,
        chosen.work_location,
        chosen.years_in_diaspora
      from (
        select distinct on (user_id)
          id,
          created_at,
          current_address,
          current_location,
          current_travel_mode,
          diaspora_status,
          ghana_region,
          home_address,
          home_location,
          hometown,
          is_traveling,
          location_sharing,
          location_updated_at,
          privacy_level,
          traditional_area,
          travel_confidence,
          tribe,
          updated_at,
          user_id,
          work_address,
          work_location,
          years_in_diaspora
        from tmp_user_location_profile_rows
        order by
          user_id,
          source_rank asc,
          updated_at desc nulls last,
          created_at desc nulls last,
          id desc
      ) chosen;
    end if;
  end if;

  v_last_step := 'merge_user_statuses';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_statuses') then
    update public.user_statuses
       set user_id = v_case.target_user_id,
           updated_at = v_now
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('user_statuses', v_count);
  end if;

  v_last_step := 'merge_moments';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'moments') then
    update public.moments
       set user_id = v_case.target_user_id
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('moments', v_count);
  end if;

  v_last_step := 'merge_moment_comments';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'moment_comments') then
    update public.moment_comments
       set user_id = v_case.target_user_id
     where user_id = v_case.source_user_id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('moment_comments', v_count);
  end if;

  v_last_step := 'merge_profile_interests';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_interests') then
    delete from public.profile_interests pi
    using public.profile_interests existing_pi
    where pi.profile_id = v_source_profile.id
      and existing_pi.profile_id = v_target_profile.id
      and existing_pi.interest_id = pi.interest_id;

    update public.profile_interests
       set profile_id = v_target_profile.id
     where profile_id = v_source_profile.id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_interests', v_count);
  end if;

  v_last_step := 'merge_profile_prompts';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_prompts') then
    update public.profile_prompts
       set profile_id = v_target_profile.id,
           updated_at = v_now
     where profile_id = v_source_profile.id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_prompts', v_count);
  end if;

  v_last_step := 'merge_profile_boosts';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_boosts') then
    update public.profile_boosts
       set user_id = v_target_profile.id
     where user_id = v_source_profile.id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_boosts', v_count);
  end if;

  v_last_step := 'merge_profile_notes';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_notes') then
    create temporary table tmp_profile_notes_rows on commit drop as
    select
      pn.id,
      case when pn.profile_id = v_source_profile.id then v_target_profile.id else pn.profile_id end as profile_id,
      case when pn.sender_id = v_case.source_user_id then v_case.target_user_id else pn.sender_id end as sender_id,
      pn.note,
      pn.created_at
    from public.profile_notes pn
    where pn.profile_id = v_source_profile.id
       or pn.sender_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_notes', v_count);

    delete from public.profile_notes
    where profile_id = v_source_profile.id
       or sender_id = v_case.source_user_id;

    insert into public.profile_notes (
      id,
      profile_id,
      sender_id,
      note,
      created_at
    )
    select
      id,
      profile_id,
      sender_id,
      note,
      created_at
    from tmp_profile_notes_rows
    where not (
      profile_id = v_target_profile.id
      and sender_id = v_case.target_user_id
    );
  end if;

  v_last_step := 'merge_profile_gifts';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_gifts') then
    create temporary table tmp_profile_gifts_rows on commit drop as
    select
      pg.id,
      case when pg.profile_id = v_source_profile.id then v_target_profile.id else pg.profile_id end as profile_id,
      case when pg.sender_id = v_case.source_user_id then v_case.target_user_id else pg.sender_id end as sender_id,
      pg.gift_type,
      pg.created_at
    from public.profile_gifts pg
    where pg.profile_id = v_source_profile.id
       or pg.sender_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_gifts', v_count);

    delete from public.profile_gifts
    where profile_id = v_source_profile.id
       or sender_id = v_case.source_user_id;

    insert into public.profile_gifts (
      id,
      profile_id,
      sender_id,
      gift_type,
      created_at
    )
    select
      id,
      profile_id,
      sender_id,
      gift_type,
      created_at
    from tmp_profile_gifts_rows
    where not (
      profile_id = v_target_profile.id
      and sender_id = v_case.target_user_id
    );
  end if;

  v_last_step := 'merge_circles';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'circles') then
    update public.circles
       set created_by_profile_id = v_target_profile.id,
           updated_at = v_now
     where created_by_profile_id = v_source_profile.id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('circles', v_count);
  end if;

  v_last_step := 'merge_reports';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reports') then
    select count(*)
      into v_count
    from public.reports
    where reporter_id = v_case.source_user_id
       or reported_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('reports', v_count);

    delete from public.reports
    where (reporter_id = v_case.source_user_id and reported_id = v_case.target_user_id)
       or (reporter_id = v_case.target_user_id and reported_id = v_case.source_user_id);

    update public.reports
       set reporter_id = case
             when reporter_id = v_case.source_user_id then v_case.target_user_id
             else reporter_id
           end,
           reported_id = case
             when reported_id = v_case.source_user_id then v_case.target_user_id
             else reported_id
           end
     where reporter_id = v_case.source_user_id
        or reported_id = v_case.source_user_id;
  end if;

  v_last_step := 'merge_blocks';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'blocks') then
    create temporary table tmp_blocks on commit drop as
    select
      case when blocker_id = v_case.source_user_id then v_case.target_user_id else blocker_id end as blocker_id,
      case when blocked_id = v_case.source_user_id then v_case.target_user_id else blocked_id end as blocked_id,
      created_at
    from public.blocks
    where blocker_id = v_case.source_user_id
       or blocked_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('blocks', v_count);

    delete from public.blocks
    where blocker_id = v_case.source_user_id
       or blocked_id = v_case.source_user_id;

    delete from public.blocks b
    using (
      select distinct blocker_id, blocked_id
      from tmp_blocks
      where blocker_id <> blocked_id
    ) conflicts
    where b.blocker_id = conflicts.blocker_id
      and b.blocked_id = conflicts.blocked_id;

    insert into public.blocks (id, blocker_id, blocked_id, created_at)
    select gen_random_uuid(), blocker_id, blocked_id, min(created_at)
    from tmp_blocks
    where blocker_id <> blocked_id
    group by blocker_id, blocked_id;
  end if;

  v_last_step := 'merge_chat_prefs';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chat_prefs') then
    create temporary table tmp_chat_prefs on commit drop as
    select
      case when user_id = v_case.source_user_id then v_case.target_user_id else user_id end as user_id,
      case when peer_id = v_case.source_user_id then v_case.target_user_id else peer_id end as peer_id,
      muted,
      pinned,
      updated_at
    from public.chat_prefs
    where user_id = v_case.source_user_id
       or peer_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('chat_prefs', v_count);

    delete from public.chat_prefs
    where user_id = v_case.source_user_id
       or peer_id = v_case.source_user_id;

    delete from public.chat_prefs cp
    using (
      select distinct user_id, peer_id
      from tmp_chat_prefs
      where user_id <> peer_id
    ) conflicts
    where cp.user_id = conflicts.user_id
      and cp.peer_id = conflicts.peer_id;

    insert into public.chat_prefs (id, user_id, peer_id, muted, pinned, updated_at)
    select
      gen_random_uuid(),
      user_id,
      peer_id,
      bool_or(muted),
      bool_or(pinned),
      max(updated_at)
    from tmp_chat_prefs
    where user_id <> peer_id
    group by user_id, peer_id;
  end if;

  v_last_step := 'merge_messages';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages') then
    select count(*)
      into v_count
    from public.messages
    where sender_id = v_case.source_user_id
       or receiver_id = v_case.source_user_id;
    insert into tmp_merge_counts (label, moved_count) values ('messages', v_count);

    delete from public.messages
    where (sender_id = v_case.source_user_id and receiver_id = v_case.target_user_id)
       or (sender_id = v_case.target_user_id and receiver_id = v_case.source_user_id);

    update public.messages
       set sender_id = case
             when sender_id = v_case.source_user_id then v_case.target_user_id
             else sender_id
           end,
           receiver_id = case
             when receiver_id = v_case.source_user_id then v_case.target_user_id
             else receiver_id
           end
     where sender_id = v_case.source_user_id
        or receiver_id = v_case.source_user_id;
  end if;

  v_last_step := 'merge_message_reactions';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'message_reactions') then
    create temporary table tmp_message_reactions on commit drop as
    select
      message_id,
      case when user_id = v_case.source_user_id then v_case.target_user_id else user_id end as user_id,
      emoji,
      created_at,
      id
    from public.message_reactions
    where user_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('message_reactions', v_count);

    delete from public.message_reactions
    where user_id = v_case.source_user_id;

    delete from public.message_reactions mr
    using (
      select distinct message_id, user_id
      from tmp_message_reactions
    ) conflicts
    where mr.message_id = conflicts.message_id
      and mr.user_id = conflicts.user_id;

    insert into public.message_reactions (id, message_id, user_id, emoji, created_at)
    select
      gen_random_uuid(),
      ranked.message_id,
      ranked.user_id,
      ranked.emoji,
      ranked.created_at
    from (
      select distinct on (message_id, user_id)
        message_id,
        user_id,
        emoji,
        created_at
      from tmp_message_reactions
      order by message_id, user_id, created_at desc, id desc
    ) ranked;
  end if;

  v_last_step := 'merge_message_pins';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'message_pins') then
    create temporary table tmp_message_pins on commit drop as
    select
      message_id,
      case when user_id = v_case.source_user_id then v_case.target_user_id else user_id end as user_id,
      case when peer_id = v_case.source_user_id then v_case.target_user_id else peer_id end as peer_id,
      created_at,
      id
    from public.message_pins
    where user_id = v_case.source_user_id
       or peer_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('message_pins', v_count);

    delete from public.message_pins
    where user_id = v_case.source_user_id
       or peer_id = v_case.source_user_id;

    delete from public.message_pins mp
    using (
      select distinct message_id, user_id
      from tmp_message_pins
      where user_id <> peer_id
    ) conflicts
    where mp.message_id = conflicts.message_id
      and mp.user_id = conflicts.user_id;

    insert into public.message_pins (id, message_id, user_id, peer_id, created_at)
    select
      gen_random_uuid(),
      ranked.message_id,
      ranked.user_id,
      ranked.peer_id,
      ranked.created_at
    from (
      select distinct on (message_id, user_id)
        message_id,
        user_id,
        peer_id,
        created_at
      from tmp_message_pins
      where user_id <> peer_id
      order by message_id, user_id, created_at desc, id desc
    ) ranked;
  end if;

  v_last_step := 'merge_message_hides';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'message_hides') then
    create temporary table tmp_message_hides on commit drop as
    select
      message_id,
      case when user_id = v_case.source_user_id then v_case.target_user_id else user_id end as user_id,
      case when peer_id = v_case.source_user_id then v_case.target_user_id else peer_id end as peer_id,
      created_at,
      id
    from public.message_hides
    where user_id = v_case.source_user_id
       or peer_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('message_hides', v_count);

    delete from public.message_hides
    where user_id = v_case.source_user_id
       or peer_id = v_case.source_user_id;

    delete from public.message_hides mh
    using (
      select distinct message_id, user_id
      from tmp_message_hides
      where user_id <> peer_id
    ) conflicts
    where mh.message_id = conflicts.message_id
      and mh.user_id = conflicts.user_id;

    insert into public.message_hides (id, message_id, user_id, peer_id, created_at)
    select
      gen_random_uuid(),
      ranked.message_id,
      ranked.user_id,
      ranked.peer_id,
      ranked.created_at
    from (
      select distinct on (message_id, user_id)
        message_id,
        user_id,
        peer_id,
        created_at
      from tmp_message_hides
      where user_id <> peer_id
      order by message_id, user_id, created_at desc, id desc
    ) ranked;
  end if;

  v_last_step := 'merge_moment_reactions';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'moment_reactions') then
    create temporary table tmp_moment_reactions on commit drop as
    select
      moment_id,
      case when user_id = v_case.source_user_id then v_case.target_user_id else user_id end as user_id,
      emoji,
      created_at,
      id
    from public.moment_reactions
    where user_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('moment_reactions', v_count);

    delete from public.moment_reactions
    where user_id = v_case.source_user_id;

    delete from public.moment_reactions mr
    using (
      select distinct moment_id, user_id
      from tmp_moment_reactions
    ) conflicts
    where mr.moment_id = conflicts.moment_id
      and mr.user_id = conflicts.user_id;

    insert into public.moment_reactions (id, moment_id, user_id, emoji, created_at)
    select
      gen_random_uuid(),
      ranked.moment_id,
      ranked.user_id,
      ranked.emoji,
      ranked.created_at
    from (
      select distinct on (moment_id, user_id)
        moment_id,
        user_id,
        emoji,
        created_at
      from tmp_moment_reactions
      order by moment_id, user_id, created_at desc, id desc
    ) ranked;
  end if;

  v_last_step := 'merge_profile_prompt_guesses';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_prompt_guesses') then
    create temporary table tmp_profile_prompt_guesses on commit drop as
    select
      profile_prompt_id,
      case when target_profile_id = v_source_profile.id then v_target_profile.id else target_profile_id end as target_profile_id,
      case when viewer_profile_id = v_source_profile.id then v_target_profile.id else viewer_profile_id end as viewer_profile_id,
      guessed_value,
      normalized_guess,
      is_correct,
      attempts_count,
      created_at,
      updated_at,
      id
    from public.profile_prompt_guesses
    where target_profile_id = v_source_profile.id
       or viewer_profile_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_prompt_guesses', v_count);

    delete from public.profile_prompt_guesses
    where target_profile_id = v_source_profile.id
       or viewer_profile_id = v_source_profile.id;

    delete from public.profile_prompt_guesses ppg
    using (
      select distinct profile_prompt_id, viewer_profile_id
      from tmp_profile_prompt_guesses
    ) conflicts
    where ppg.profile_prompt_id = conflicts.profile_prompt_id
      and ppg.viewer_profile_id = conflicts.viewer_profile_id;

    insert into public.profile_prompt_guesses (
      id,
      profile_prompt_id,
      target_profile_id,
      viewer_profile_id,
      guessed_value,
      normalized_guess,
      is_correct,
      attempts_count,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      ranked.profile_prompt_id,
      ranked.target_profile_id,
      ranked.viewer_profile_id,
      ranked.guessed_value,
      ranked.normalized_guess,
      ranked.is_correct,
      ranked.attempts_count,
      ranked.created_at,
      ranked.updated_at
    from (
      select distinct on (profile_prompt_id, viewer_profile_id)
        profile_prompt_id,
        target_profile_id,
        viewer_profile_id,
        guessed_value,
        normalized_guess,
        is_correct,
        attempts_count,
        created_at,
        updated_at
      from tmp_profile_prompt_guesses
      order by profile_prompt_id, viewer_profile_id, updated_at desc, id desc
    ) ranked;
  end if;

  v_last_step := 'merge_profile_image_reactions';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_image_reactions') then
    create temporary table tmp_profile_image_reactions on commit drop as
    select
      case when profile_id = v_source_profile.id then v_target_profile.id else profile_id end as profile_id,
      image_url,
      case when reactor_user_id = v_case.source_user_id then v_case.target_user_id else reactor_user_id end as reactor_user_id,
      emoji,
      created_at,
      id
    from public.profile_image_reactions
    where profile_id = v_source_profile.id
       or reactor_user_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_image_reactions', v_count);

    delete from public.profile_image_reactions
    where profile_id = v_source_profile.id
       or reactor_user_id = v_case.source_user_id;

    delete from public.profile_image_reactions pir
    using (
      select distinct profile_id, image_url, reactor_user_id
      from tmp_profile_image_reactions
    ) conflicts
    where pir.profile_id = conflicts.profile_id
      and pir.image_url = conflicts.image_url
      and pir.reactor_user_id = conflicts.reactor_user_id;

    insert into public.profile_image_reactions (id, profile_id, image_url, reactor_user_id, emoji, created_at)
    select
      gen_random_uuid(),
      ranked.profile_id,
      ranked.image_url,
      ranked.reactor_user_id,
      ranked.emoji,
      ranked.created_at
    from (
      select distinct on (profile_id, image_url, reactor_user_id)
        profile_id,
        image_url,
        reactor_user_id,
        emoji,
        created_at
      from tmp_profile_image_reactions
      order by profile_id, image_url, reactor_user_id, created_at desc, id desc
    ) ranked;
  end if;

  v_last_step := 'merge_profile_signals';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_signals') then
    create temporary table tmp_profile_signals on commit drop as
    select
      case when profile_id = v_source_profile.id then v_target_profile.id else profile_id end as profile_id,
      case when target_profile_id = v_source_profile.id then v_target_profile.id else target_profile_id end as target_profile_id,
      opened_profile_count,
      dwell_score,
      liked,
      intro_video_started,
      intro_video_completed,
      last_interacted_at
    from public.profile_signals
    where profile_id = v_source_profile.id
       or target_profile_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('profile_signals', v_count);

    delete from public.profile_signals
    where profile_id = v_source_profile.id
       or target_profile_id = v_source_profile.id;

    delete from public.profile_signals ps
    using (
      select distinct profile_id, target_profile_id
      from tmp_profile_signals
      where profile_id <> target_profile_id
    ) conflicts
    where ps.profile_id = conflicts.profile_id
      and ps.target_profile_id = conflicts.target_profile_id;

    insert into public.profile_signals (
      id,
      profile_id,
      target_profile_id,
      opened_profile_count,
      dwell_score,
      liked,
      intro_video_started,
      intro_video_completed,
      last_interacted_at
    )
    select
      gen_random_uuid(),
      profile_id,
      target_profile_id,
      sum(opened_profile_count),
      least(sum(dwell_score), 100000),
      bool_or(liked),
      bool_or(intro_video_started),
      bool_or(intro_video_completed),
      max(last_interacted_at)
    from tmp_profile_signals
    where profile_id <> target_profile_id
    group by profile_id, target_profile_id;
  end if;

  v_last_step := 'merge_circle_members';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'circle_members') then
    create temporary table tmp_circle_members on commit drop as
    select
      circle_id,
      case when profile_id = v_source_profile.id then v_target_profile.id else profile_id end as profile_id,
      role,
      status,
      is_visible,
      created_at
    from public.circle_members
    where profile_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('circle_members', v_count);

    delete from public.circle_members
    where profile_id = v_source_profile.id;

    delete from public.circle_members cm
    using (
      select distinct circle_id, profile_id
      from tmp_circle_members
    ) conflicts
    where cm.circle_id = conflicts.circle_id
      and cm.profile_id = conflicts.profile_id;

    insert into public.circle_members (id, circle_id, profile_id, role, status, is_visible, created_at)
    select
      gen_random_uuid(),
      ranked.circle_id,
      ranked.profile_id,
      ranked.role,
      ranked.status,
      ranked.is_visible,
      ranked.created_at
    from (
      select distinct on (circle_id, profile_id)
        circle_id,
        profile_id,
        role,
        status,
        is_visible,
        created_at
      from (
        select
          circle_id,
          profile_id,
          role,
          status,
          bool_or(is_visible) over (partition by circle_id, profile_id) as is_visible,
          min(created_at) over (partition by circle_id, profile_id) as created_at,
          case role
            when 'leader' then 3
            when 'matchmaker' then 2
            else 1
          end as role_rank,
          case status
            when 'active' then 3
            when 'pending' then 2
            else 1
          end as status_rank
        from tmp_circle_members
      ) ranked_input
      order by circle_id, profile_id, role_rank desc, status_rank desc, created_at asc
    ) ranked;
  end if;

  v_last_step := 'merge_swipes';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'swipes') then
    insert into tmp_swipe_pairs (swiper_id, target_id, action, created_at)
    select
      case when swiper_id = v_source_profile.id then v_target_profile.id else swiper_id end as swiper_id,
      case when target_id = v_source_profile.id then v_target_profile.id else target_id end as target_id,
      action,
      created_at
    from public.swipes
    where swiper_id = v_source_profile.id
       or target_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('swipes', v_count);

    delete from public.swipes
    where swiper_id = v_source_profile.id
       or target_id = v_source_profile.id;

    delete from public.swipes s
    using (
      select distinct swiper_id, target_id
      from tmp_swipe_pairs
      where swiper_id <> target_id
    ) conflicts
    where s.swiper_id = conflicts.swiper_id
      and s.target_id = conflicts.target_id;

    insert into public.swipes (id, swiper_id, target_id, action, created_at)
    select
      gen_random_uuid(),
      ranked.swiper_id,
      ranked.target_id,
      ranked.action,
      ranked.created_at
    from (
      select distinct on (swiper_id, target_id)
        swiper_id,
        target_id,
        action,
        created_at
      from (
        select
          swiper_id,
          target_id,
          action,
          created_at,
          case action
            when 'SUPERLIKE' then 3
            when 'LIKE' then 2
            else 1
          end as action_rank
        from tmp_swipe_pairs
        where swiper_id <> target_id
      ) ranked_input
      order by swiper_id, target_id, action_rank desc, created_at desc
    ) ranked;
  end if;

  v_last_step := 'merge_matches';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'matches') then
    insert into tmp_match_pairs (user1_id, user2_id, status, created_at, updated_at)
    select
      least(
        case when user1_id = v_source_profile.id then v_target_profile.id else user1_id end,
        case when user2_id = v_source_profile.id then v_target_profile.id else user2_id end
      ) as user1_id,
      greatest(
        case when user1_id = v_source_profile.id then v_target_profile.id else user1_id end,
        case when user2_id = v_source_profile.id then v_target_profile.id else user2_id end
      ) as user2_id,
      status,
      created_at,
      updated_at
    from public.matches
    where user1_id = v_source_profile.id
       or user2_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('matches', v_count);

    delete from public.matches
    where user1_id = v_source_profile.id
       or user2_id = v_source_profile.id;

    delete from public.matches m
    using (
      select distinct user1_id, user2_id
      from tmp_match_pairs
      where user1_id <> user2_id
    ) conflicts
    where least(m.user1_id, m.user2_id) = conflicts.user1_id
      and greatest(m.user1_id, m.user2_id) = conflicts.user2_id;

    insert into public.matches (id, user1_id, user2_id, status, created_at, updated_at)
    select
      gen_random_uuid(),
      ranked.user1_id,
      ranked.user2_id,
      ranked.status,
      ranked.created_at,
      ranked.updated_at
    from (
      select distinct on (user1_id, user2_id)
        user1_id,
        user2_id,
        status,
        created_at,
        updated_at
      from (
        select
          user1_id,
          user2_id,
          status,
          created_at,
          updated_at,
          case status
            when 'ACCEPTED' then 3
            when 'PENDING' then 2
            else 1
          end as status_rank
        from tmp_match_pairs
        where user1_id <> user2_id
      ) ranked_input
      order by user1_id, user2_id, status_rank desc, updated_at desc, created_at asc
    ) ranked;
  end if;
 
  v_last_step := 'merge_intent_requests';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'intent_requests') then
    insert into tmp_intent_requests (
      id,
      actor_id,
      recipient_id,
      type,
      message,
      suggested_time,
      suggested_place,
      status,
      created_at,
      expires_at,
      metadata
    )
    select
      id,
      case when actor_id = v_source_profile.id then v_target_profile.id else actor_id end as actor_id,
      case when recipient_id = v_source_profile.id then v_target_profile.id else recipient_id end as recipient_id,
      type,
      message,
      suggested_time,
      suggested_place,
      status,
      created_at,
      expires_at,
      metadata
    from public.intent_requests
    where actor_id = v_source_profile.id
       or recipient_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('intent_requests', v_count);

    insert into tmp_intent_requests (
      id,
      actor_id,
      recipient_id,
      type,
      message,
      suggested_time,
      suggested_place,
      status,
      created_at,
      expires_at,
      metadata
    )
    select
      ir.id,
      ir.actor_id,
      ir.recipient_id,
      ir.type,
      ir.message,
      ir.suggested_time,
      ir.suggested_place,
      ir.status,
      ir.created_at,
      ir.expires_at,
      ir.metadata
    from public.intent_requests ir
    where ir.status = 'pending'
      and ir.id not in (select id from tmp_intent_requests)
      and exists (
        select 1
        from tmp_intent_requests moved
        where moved.status = 'pending'
          and moved.type = ir.type
          and moved.actor_id = ir.actor_id
          and moved.recipient_id = ir.recipient_id
      );

    delete from public.intent_requests
    where id in (select id from tmp_intent_requests);

    insert into public.intent_requests (
      id,
      recipient_id,
      actor_id,
      type,
      message,
      suggested_time,
      suggested_place,
      status,
      created_at,
      expires_at,
      metadata
    )
    select
      coalesce(ranked.id, gen_random_uuid()),
      ranked.recipient_id,
      ranked.actor_id,
      ranked.type,
      ranked.message,
      ranked.suggested_time,
      ranked.suggested_place,
      ranked.status,
      ranked.created_at,
      ranked.expires_at,
      ranked.metadata
    from (
      select distinct on (
        actor_id,
        recipient_id,
        type,
        case when status = 'pending' then 'pending' else id::text end
      )
        id,
        actor_id,
        recipient_id,
        type,
        message,
        suggested_time,
        suggested_place,
        status,
        created_at,
        expires_at,
        metadata
      from tmp_intent_requests
      where actor_id <> recipient_id
      order by
        actor_id,
        recipient_id,
        type,
        case when status = 'pending' then 'pending' else id::text end,
        created_at desc,
        id desc
    ) ranked;
  end if;

  v_last_step := 'merge_date_plans';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'date_plans') then
    insert into tmp_date_plans (
      id,
      accepted_at,
      accepted_by_profile_id,
      city,
      concierge_requested,
      concierge_requested_at,
      concierge_requested_by_profile_id,
      created_at,
      creator_profile_id,
      creator_user_id,
      declined_at,
      declined_by_profile_id,
      lat,
      lng,
      message_id,
      note,
      parent_plan_id,
      place_address,
      place_badges,
      place_name,
      place_source,
      place_summary,
      recipient_profile_id,
      recipient_user_id,
      response_kind,
      scheduled_for,
      status,
      updated_at,
      venue_id
    )
    select
      id,
      accepted_at,
      case when accepted_by_profile_id = v_source_profile.id then v_target_profile.id else accepted_by_profile_id end as accepted_by_profile_id,
      city,
      concierge_requested,
      concierge_requested_at,
      case when concierge_requested_by_profile_id = v_source_profile.id then v_target_profile.id else concierge_requested_by_profile_id end as concierge_requested_by_profile_id,
      created_at,
      case when creator_profile_id = v_source_profile.id then v_target_profile.id else creator_profile_id end as creator_profile_id,
      case when creator_user_id = v_case.source_user_id then v_case.target_user_id else creator_user_id end as creator_user_id,
      declined_at,
      case when declined_by_profile_id = v_source_profile.id then v_target_profile.id else declined_by_profile_id end as declined_by_profile_id,
      lat,
      lng,
      message_id,
      note,
      parent_plan_id,
      place_address,
      place_badges,
      place_name,
      place_source,
      place_summary,
      case when recipient_profile_id = v_source_profile.id then v_target_profile.id else recipient_profile_id end as recipient_profile_id,
      case when recipient_user_id = v_case.source_user_id then v_case.target_user_id else recipient_user_id end as recipient_user_id,
      response_kind,
      scheduled_for,
      status,
      updated_at,
      venue_id
    from public.date_plans
    where creator_profile_id = v_source_profile.id
       or recipient_profile_id = v_source_profile.id
       or creator_user_id = v_case.source_user_id
       or recipient_user_id = v_case.source_user_id
       or accepted_by_profile_id = v_source_profile.id
       or declined_by_profile_id = v_source_profile.id
       or concierge_requested_by_profile_id = v_source_profile.id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('date_plans', v_count);

    insert into tmp_date_plans (
      id,
      accepted_at,
      accepted_by_profile_id,
      city,
      concierge_requested,
      concierge_requested_at,
      concierge_requested_by_profile_id,
      created_at,
      creator_profile_id,
      creator_user_id,
      declined_at,
      declined_by_profile_id,
      lat,
      lng,
      message_id,
      note,
      parent_plan_id,
      place_address,
      place_badges,
      place_name,
      place_source,
      place_summary,
      recipient_profile_id,
      recipient_user_id,
      response_kind,
      scheduled_for,
      status,
      updated_at,
      venue_id
    )
    select
      dp.id,
      dp.accepted_at,
      dp.accepted_by_profile_id,
      dp.city,
      dp.concierge_requested,
      dp.concierge_requested_at,
      dp.concierge_requested_by_profile_id,
      dp.created_at,
      dp.creator_profile_id,
      dp.creator_user_id,
      dp.declined_at,
      dp.declined_by_profile_id,
      dp.lat,
      dp.lng,
      dp.message_id,
      dp.note,
      dp.parent_plan_id,
      dp.place_address,
      dp.place_badges,
      dp.place_name,
      dp.place_source,
      dp.place_summary,
      dp.recipient_profile_id,
      dp.recipient_user_id,
      dp.response_kind,
      dp.scheduled_for,
      dp.status,
      dp.updated_at,
      dp.venue_id
    from public.date_plans dp
    where dp.status = 'pending'
      and dp.id not in (select id from tmp_date_plans)
      and exists (
        select 1
        from tmp_date_plans moved
        where moved.status = 'pending'
          and least(moved.creator_profile_id, moved.recipient_profile_id) = least(dp.creator_profile_id, dp.recipient_profile_id)
          and greatest(moved.creator_profile_id, moved.recipient_profile_id) = greatest(dp.creator_profile_id, dp.recipient_profile_id)
      );

    insert into tmp_concierge_requests (
      id,
      date_plan_id,
      requested_by_profile_id,
      requested_by_user_id,
      assigned_admin_user_id,
      status,
      note,
      resolved_at,
      created_at,
      updated_at
    )
    select
      cr.id,
      cr.date_plan_id,
      case when cr.requested_by_profile_id = v_source_profile.id then v_target_profile.id else cr.requested_by_profile_id end as requested_by_profile_id,
      case when cr.requested_by_user_id = v_case.source_user_id then v_case.target_user_id else cr.requested_by_user_id end as requested_by_user_id,
      cr.assigned_admin_user_id,
      cr.status,
      cr.note,
      cr.resolved_at,
      cr.created_at,
      cr.updated_at
    from public.date_plan_concierge_requests cr
    where cr.date_plan_id in (select id from tmp_date_plans);

    delete from public.date_plan_concierge_requests
    where date_plan_id in (select id from tmp_date_plans);

    delete from public.date_plans
    where id in (select id from tmp_date_plans);

    create temporary table tmp_date_plans_insert on commit drop as
    select
      id,
      accepted_at,
      accepted_by_profile_id,
      city,
      case
        when status = 'pending' and row_number() over (
          partition by least(creator_profile_id, recipient_profile_id), greatest(creator_profile_id, recipient_profile_id)
          order by updated_at desc, created_at desc, id desc
        ) > 1 then false
        else concierge_requested
      end as concierge_requested,
      case
        when status = 'pending' and row_number() over (
          partition by least(creator_profile_id, recipient_profile_id), greatest(creator_profile_id, recipient_profile_id)
          order by updated_at desc, created_at desc, id desc
        ) > 1 then null
        else concierge_requested_at
      end as concierge_requested_at,
      case
        when status = 'pending' and row_number() over (
          partition by least(creator_profile_id, recipient_profile_id), greatest(creator_profile_id, recipient_profile_id)
          order by updated_at desc, created_at desc, id desc
        ) > 1 then null
        else concierge_requested_by_profile_id
      end as concierge_requested_by_profile_id,
      created_at,
      creator_profile_id,
      creator_user_id,
      case
        when status = 'pending' and row_number() over (
          partition by least(creator_profile_id, recipient_profile_id), greatest(creator_profile_id, recipient_profile_id)
          order by updated_at desc, created_at desc, id desc
        ) > 1 then v_now
        else declined_at
      end as declined_at,
      declined_by_profile_id,
      lat,
      lng,
      message_id,
      note,
      parent_plan_id,
      place_address,
      place_badges,
      place_name,
      place_source,
      place_summary,
      recipient_profile_id,
      recipient_user_id,
      response_kind,
      scheduled_for,
      case
        when status = 'pending' and row_number() over (
          partition by least(creator_profile_id, recipient_profile_id), greatest(creator_profile_id, recipient_profile_id)
          order by updated_at desc, created_at desc, id desc
        ) > 1 then 'cancelled'
        else status
      end as status,
      v_now as updated_at,
      venue_id
    from tmp_date_plans
    where creator_profile_id <> recipient_profile_id;

    insert into public.date_plans (
      id,
      accepted_at,
      accepted_by_profile_id,
      city,
      concierge_requested,
      concierge_requested_at,
      concierge_requested_by_profile_id,
      created_at,
      creator_profile_id,
      creator_user_id,
      declined_at,
      declined_by_profile_id,
      lat,
      lng,
      message_id,
      note,
      parent_plan_id,
      place_address,
      place_badges,
      place_name,
      place_source,
      place_summary,
      recipient_profile_id,
      recipient_user_id,
      response_kind,
      scheduled_for,
      status,
      updated_at,
      venue_id
    )
    select
      id,
      accepted_at,
      accepted_by_profile_id,
      city,
      concierge_requested,
      concierge_requested_at,
      concierge_requested_by_profile_id,
      created_at,
      creator_profile_id,
      creator_user_id,
      declined_at,
      declined_by_profile_id,
      lat,
      lng,
      message_id,
      note,
      parent_plan_id,
      place_address,
      place_badges,
      place_name,
      place_source,
      place_summary,
      recipient_profile_id,
      recipient_user_id,
      response_kind,
      scheduled_for,
      status,
      updated_at,
      venue_id
    from tmp_date_plans_insert;

    insert into public.date_plan_concierge_requests (
      id,
      date_plan_id,
      requested_by_profile_id,
      requested_by_user_id,
      assigned_admin_user_id,
      status,
      note,
      resolved_at,
      created_at,
      updated_at
    )
    select
      cr.id,
      cr.date_plan_id,
      cr.requested_by_profile_id,
      cr.requested_by_user_id,
      cr.assigned_admin_user_id,
      case
        when dpi.status = 'cancelled' then 'cancelled'
        else cr.status
      end as status,
      cr.note,
      case
        when dpi.status = 'cancelled' and cr.resolved_at is null then v_now
        else cr.resolved_at
      end as resolved_at,
      cr.created_at,
      v_now
    from tmp_concierge_requests cr
    join tmp_date_plans_insert dpi
      on dpi.id = cr.date_plan_id;
  end if;

  v_last_step := 'merge_system_messages';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'system_messages') then
    create temporary table tmp_system_messages on commit drop as
    select
      id,
      case when user_id = v_case.source_user_id then v_case.target_user_id else user_id end as user_id,
      case when peer_user_id = v_case.source_user_id then v_case.target_user_id else peer_user_id end as peer_user_id,
      intent_request_id,
      event_type,
      text,
      created_at,
      metadata
    from public.system_messages
    where user_id = v_case.source_user_id
       or peer_user_id = v_case.source_user_id;

    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('system_messages', v_count);

    insert into tmp_system_messages (
      id,
      user_id,
      peer_user_id,
      intent_request_id,
      event_type,
      text,
      created_at,
      metadata
    )
    select
      sm.id,
      sm.user_id,
      sm.peer_user_id,
      sm.intent_request_id,
      sm.event_type,
      sm.text,
      sm.created_at,
      sm.metadata
    from public.system_messages sm
    where sm.intent_request_id is not null
      and sm.id not in (select id from tmp_system_messages)
      and exists (
        select 1
        from tmp_system_messages moved
        where moved.intent_request_id = sm.intent_request_id
          and moved.user_id = sm.user_id
      );

    delete from public.system_messages
    where id in (select id from tmp_system_messages);

    insert into public.system_messages (
      id,
      user_id,
      peer_user_id,
      intent_request_id,
      event_type,
      text,
      created_at,
      metadata
    )
    select
      coalesce(ranked.id, gen_random_uuid()),
      ranked.user_id,
      ranked.peer_user_id,
      ranked.intent_request_id,
      ranked.event_type,
      ranked.text,
      ranked.created_at,
      ranked.metadata
    from (
      select distinct on (
        coalesce(intent_request_id::text, id::text),
        user_id,
        peer_user_id,
        event_type
      )
        id,
        user_id,
        peer_user_id,
        intent_request_id,
        event_type,
        text,
        created_at,
        metadata
      from tmp_system_messages
      where user_id <> peer_user_id
      order by
        coalesce(intent_request_id::text, id::text),
        user_id,
        peer_user_id,
        event_type,
        created_at desc,
        id desc
    ) ranked;
  end if;

  v_last_step := 'merge_account_recovery_requests';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'account_recovery_requests') then
    update public.account_recovery_requests
       set requester_user_id = v_case.target_user_id,
           requester_profile_id = case
             when requester_profile_id = v_source_profile.id then v_target_profile.id
             else requester_profile_id
           end,
           updated_at = v_now
     where requester_user_id = v_case.source_user_id
        or requester_profile_id = v_source_profile.id;
    get diagnostics v_count = row_count;
    insert into tmp_merge_counts (label, moved_count) values ('account_recovery_requests', v_count);

    update public.account_recovery_requests
       set status = 'resolved',
           reviewed_by = auth.uid(),
           reviewed_at = v_now,
           review_notes = case
             when review_notes is null or btrim(review_notes) = '' then 'Merge executed.'
             else review_notes || E'\nMerge executed.'
           end,
           updated_at = v_now
     where linked_merge_case_id = v_case.id
       and status <> 'resolved';
  end if;

  v_last_step := 'merge_account_recovery_request_events';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'account_recovery_request_events') then
    v_count := 0;
    insert into tmp_merge_counts (label, moved_count) values ('account_recovery_request_events', v_count);

    insert into public.account_recovery_request_events (
      request_id,
      event_type,
      actor_user_id,
      metadata
    )
    select
      arr.id,
      'merge_executed',
      auth.uid(),
      jsonb_build_object(
        'merge_case_id', v_case.id,
        'target_user_id', v_case.target_user_id,
        'target_profile_id', v_target_profile.id
      )
    from public.account_recovery_requests arr
    where arr.linked_merge_case_id = v_case.id;
  end if;

  v_last_step := 'merge_account_merge_cases';
  update public.account_merge_cases
     set requester_user_id = case
           when requester_user_id = v_case.source_user_id then v_case.target_user_id
           else requester_user_id
         end,
         source_profile_id = v_source_profile.id,
         target_profile_id = v_target_profile.id,
         reviewed_by = coalesce(reviewed_by, auth.uid()),
         reviewed_at = coalesce(reviewed_at, v_now)
   where requester_user_id = v_case.source_user_id
      or id = v_case.id;
  get diagnostics v_count = row_count;
  insert into tmp_merge_counts (label, moved_count) values ('account_merge_cases', v_count);

  v_last_step := 'merge_account_merge_events';
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'account_merge_events') then
    v_count := 0;
    insert into tmp_merge_counts (label, moved_count) values ('account_merge_events', v_count);
  end if;

  v_last_step := 'insert_merged_account';
  insert into public.merged_accounts (
    source_user_id,
    source_profile_id,
    target_user_id,
    target_profile_id,
    merge_case_id,
    status,
    note,
    created_by,
    created_at
  )
  values (
    v_case.source_user_id,
    v_source_profile.id,
    v_case.target_user_id,
    v_target_profile.id,
    v_case.id,
    'active',
    'Merged via admin executor.',
    auth.uid(),
    v_now
  );

  v_last_step := 'archive_source_profile';
  update public.profiles
     set deleted_at = coalesce(deleted_at, v_now),
         is_active = false,
         online = false,
         updated_at = v_now
   where id = v_source_profile.id;

  v_last_step := 'build_execution_summary';
  select coalesce(jsonb_object_agg(label, moved_count), '{}'::jsonb)
    into v_counts
  from tmp_merge_counts;

  v_execution_summary := jsonb_build_object(
    'success', true,
    'executed_at', v_now,
    'counts', v_counts,
    'source_user_id', v_case.source_user_id,
    'source_profile_id', v_source_profile.id,
    'target_user_id', v_case.target_user_id,
    'target_profile_id', v_target_profile.id,
    'source_profile_archived', true
  );

  v_last_step := 'finalize_merge_case';
  update public.account_merge_cases
     set status = 'completed',
         source_profile_id = v_source_profile.id,
         target_profile_id = v_target_profile.id,
         execution_summary = v_execution_summary,
         executed_by = auth.uid(),
         executed_at = v_now,
         reviewed_by = coalesce(reviewed_by, auth.uid()),
         reviewed_at = coalesce(reviewed_at, v_now),
         resolved_at = v_now,
         updated_at = v_now
   where id = v_case.id;

  insert into public.account_merge_events (
    merge_case_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_case.id,
    'case_executed',
    auth.uid(),
    v_execution_summary
  );

  return v_execution_summary;
exception
  when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_error_message = message_text,
      v_error_detail = pg_exception_detail,
      v_error_hint = pg_exception_hint,
      v_error_context = pg_exception_context;

    v_execution_summary := jsonb_build_object(
      'success', false,
      'failed_at', timezone('utc'::text, now()),
      'sqlstate', v_sqlstate,
      'failed_step', v_last_step,
      'error_message', coalesce(v_error_message, 'Unknown merge executor error'),
      'error_detail', v_error_detail,
      'error_hint', v_error_hint,
      'source_user_id', v_case.source_user_id,
      'source_profile_id', v_source_profile.id,
      'target_user_id', v_case.target_user_id,
      'target_profile_id', v_target_profile.id
    );

    insert into public.account_merge_execution_failures (
      merge_case_id,
      source_user_id,
      target_user_id,
      actor_user_id,
      sqlstate,
      failed_step,
      error_message,
      error_detail,
      error_hint,
      error_context,
      context
    )
    values (
      v_case.id,
      v_case.source_user_id,
      v_case.target_user_id,
      auth.uid(),
      v_sqlstate,
      v_last_step,
      coalesce(v_error_message, 'Unknown merge executor error'),
      v_error_detail,
      v_error_hint,
      v_error_context,
      jsonb_build_object(
        'case_status', v_case.status,
        'source_profile_id', v_source_profile.id,
        'target_profile_id', v_target_profile.id
      )
    );

    if v_case.id is not null and coalesce(lower(v_case.status), '') in ('approved', 'scheduled') then
      update public.account_merge_cases
         set status = 'failed',
             execution_summary = v_execution_summary,
             executed_by = auth.uid(),
             executed_at = timezone('utc'::text, now()),
             resolved_at = timezone('utc'::text, now()),
             updated_at = timezone('utc'::text, now())
       where id = v_case.id;

      insert into public.account_merge_events (
        merge_case_id,
        event_type,
        actor_user_id,
        metadata
      )
      values (
        v_case.id,
        'case_execution_failed',
        auth.uid(),
        v_execution_summary
      );
    end if;

    return v_execution_summary;
end;
$$;

revoke all on function public.rpc_get_merged_account_redirect() from public;
revoke all on function public.rpc_admin_execute_account_merge_case(uuid) from public;

grant execute on function public.rpc_get_merged_account_redirect() to authenticated;
grant execute on function public.rpc_admin_execute_account_merge_case(uuid) to authenticated;
