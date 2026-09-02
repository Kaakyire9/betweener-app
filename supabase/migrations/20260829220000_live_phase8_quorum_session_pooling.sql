-- Betweener Live Phase 8: pairability-aware quorum and cross-session pooling.
-- This is intentionally separate from the Phase 7 single-session Quick Connect pool.

begin;

alter table public.notification_prefs
  add column if not exists allow_pooled_live_sessions boolean not null default true,
  add column if not exists live_pool_offers boolean not null default true;

alter table public.live_sessions
  add column if not exists quorum_pairability_required boolean not null default false,
  add column if not exists quorum_required_pairs integer not null default 1;

alter table public.live_sessions drop constraint if exists live_sessions_quorum_pairs_valid;
alter table public.live_sessions add constraint live_sessions_quorum_pairs_valid
  check (quorum_required_pairs between 0 and 5000);

create table public.live_pool_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  allowed_formats text[] not null default array['hosted_match_night','circle_live','special_event']::text[],
  allowed_context_types text[] not null default array['circle','match_night','diaspora','special_event']::text[],
  maximum_start_delta_minutes integer not null default 120,
  minimum_verification_level integer not null default 1,
  geography_mode text not null default 'same_country',
  required_tags text[] not null default '{}'::text[],
  blocked_session_ids uuid[] not null default '{}'::uuid[],
  explanation text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint live_pool_rules_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint live_pool_rules_explanation_length check (char_length(btrim(explanation)) between 1 and 280),
  constraint live_pool_rules_formats_valid check (
    cardinality(allowed_formats) > 0
    and allowed_formats <@ array['hosted_match_night','circle_live','special_event','invite_only']::text[]
  ),
  constraint live_pool_rules_contexts_valid check (
    cardinality(allowed_context_types) > 0
    and allowed_context_types <@ array['global','circle','gathering','match_night','diaspora','special_event','invite_only']::text[]
  ),
  constraint live_pool_rules_time_valid check (maximum_start_delta_minutes between 15 and 1440),
  constraint live_pool_rules_verification_valid check (minimum_verification_level between 0 and 10),
  constraint live_pool_rules_geography_valid check (geography_mode in ('any','same_country','diaspora'))
);

create table public.live_session_pools (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.live_pool_rules(id) on delete restrict,
  primary_session_id uuid not null references public.live_sessions(id) on delete restrict,
  state text not null default 'offered',
  explanation text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  offered_at timestamptz not null default timezone('utc',now()),
  activated_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint live_session_pools_state_valid check (state in ('preview','offered','active','cancelled','completed')),
  constraint live_session_pools_explanation_length check (char_length(btrim(explanation)) between 1 and 500)
);

create table public.live_session_pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.live_session_pools(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete restrict,
  origin_context_type text not null,
  origin_context_id uuid,
  is_primary boolean not null default false,
  added_at timestamptz not null default timezone('utc',now()),
  constraint live_session_pool_members_origin_valid check (
    origin_context_type in ('global','circle','gathering','match_night','diaspora','special_event','invite_only')
  ),
  constraint live_session_pool_members_unique unique(pool_id,session_id)
);

create table public.live_session_pool_offers (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.live_session_pools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_session_id uuid not null references public.live_sessions(id) on delete restrict,
  destination_session_id uuid not null references public.live_sessions(id) on delete restrict,
  state text not null default 'pending',
  explanation text not null,
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint live_session_pool_offers_state_valid check (state in ('pending','accepted','declined','expired','withdrawn')),
  constraint live_session_pool_offers_distinct_sessions check (source_session_id <> destination_session_id),
  constraint live_session_pool_offers_unique unique(pool_id,user_id)
);

create table public.live_pool_decision_audit (
  id bigint generated always as identity primary key,
  pool_id uuid references public.live_session_pools(id) on delete set null,
  source_session_id uuid not null references public.live_sessions(id) on delete cascade,
  candidate_session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  decision text not null,
  reason_codes text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  constraint live_pool_decision_audit_decision_valid check (decision in ('eligible','excluded','offered','activated','cancelled')),
  constraint live_pool_decision_audit_metadata_object check (jsonb_typeof(metadata)='object')
);

create table public.live_quorum_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  status text not null,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc',now()),
  constraint live_quorum_updates_status_valid check (status in ('almost_ready','confirmed'))
);

create table public.live_pool_offer_updates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc',now())
);

create index live_pool_rules_enabled_idx on public.live_pool_rules(enabled,updated_at desc);
create index live_session_pools_primary_idx on public.live_session_pools(primary_session_id,state);
create index live_session_pool_members_session_idx on public.live_session_pool_members(session_id,pool_id);
create index live_session_pool_offers_user_idx on public.live_session_pool_offers(user_id,state,expires_at);
create index live_pool_audit_sessions_idx on public.live_pool_decision_audit(source_session_id,candidate_session_id,created_at desc);

create trigger live_pool_rules_set_updated_at before update on public.live_pool_rules
for each row execute function public.set_updated_at();
create trigger live_session_pools_set_updated_at before update on public.live_session_pools
for each row execute function public.set_updated_at();
create trigger live_session_pool_offers_set_updated_at before update on public.live_session_pool_offers
for each row execute function public.set_updated_at();

create or replace function public.enforce_live_session_pool_member_invariants()
returns trigger
language plpgsql
set search_path=public,pg_catalog
as $$
begin
  if exists (
    select 1
    from public.live_session_pool_members m
    join public.live_session_pools p on p.id=m.pool_id
    where m.session_id=new.session_id
      and m.pool_id<>new.pool_id
      and p.state in ('offered','active')
  ) then
    raise exception 'live_session_already_pooled' using errcode='23505';
  end if;
  if new.is_primary and exists (
    select 1 from public.live_session_pool_members m
    where m.pool_id=new.pool_id and m.is_primary and m.id<>new.id
  ) then
    raise exception 'live_pool_primary_already_exists' using errcode='23505';
  end if;
  return new;
end;
$$;

create trigger live_session_pool_member_invariants
before insert or update on public.live_session_pool_members
for each row execute function public.enforce_live_session_pool_member_invariants();

create or replace function public.live_pool_profile_is_enabled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
  select coalesce((
    select np.allow_pooled_live_sessions
    from public.notification_prefs np where np.user_id=p_user_id
  ),true)
$$;

create or replace function public.live_pool_formats_compatible(p_format_a text,p_format_b text)
returns boolean
language sql
immutable
set search_path=public,pg_catalog
as $$
  select p_format_a<>'quick_connect' and p_format_b<>'quick_connect'
    and (
      (p_format_a='invite_only' and p_format_b='invite_only')
      or (p_format_a<>'invite_only' and p_format_b<>'invite_only')
    )
$$;

create or replace function public.live_cross_session_pair_is_eligible(
  p_session_a uuid,
  p_user_a uuid,
  p_session_b uuid,
  p_user_b uuid,
  p_minimum_verification integer default 1,
  p_geography_mode text default 'any'
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
  select p_session_a<>p_session_b and p_user_a<>p_user_b and exists (
    select 1
    from public.live_participants a
    join public.live_participants b on b.session_id=p_session_b and b.user_id=p_user_b
    join public.profiles pa on pa.id=a.profile_id
    join public.profiles pb on pb.id=b.profile_id
    where a.session_id=p_session_a and a.user_id=p_user_a
      and a.rsvp_status='going' and b.rsvp_status='going'
      and a.open_to_introductions and b.open_to_introductions
      and a.role<>'host' and b.role<>'host'
      and a.state not in ('left','removed','banned') and b.state not in ('left','removed','banned')
      and public.live_pool_profile_is_enabled(a.user_id)
      and public.live_pool_profile_is_enabled(b.user_id)
      and pa.deleted_at is null and pb.deleted_at is null
      and pa.account_state='active' and pb.account_state='active'
      and pa.profile_completed and pb.profile_completed
      and coalesce(pa.is_active,true) and coalesce(pb.is_active,true)
      and coalesce(pa.verification_level,0)>=greatest(0,p_minimum_verification)
      and coalesce(pb.verification_level,0)>=greatest(0,p_minimum_verification)
      and (
        upper(btrim(coalesce(pa.gender::text,''))) not in ('MALE','FEMALE')
        or upper(btrim(coalesce(pb.gender::text,''))) not in ('MALE','FEMALE')
        or upper(btrim(pa.gender::text))<>upper(btrim(pb.gender::text))
      )
      and (pa.age_preference_confirmed_at is null or pa.min_age_interest is null or pb.age is null or pb.age>=pa.min_age_interest)
      and (pa.age_preference_confirmed_at is null or pa.max_age_interest is null or pb.age is null or pb.age<=pa.max_age_interest)
      and (pb.age_preference_confirmed_at is null or pb.min_age_interest is null or pa.age is null or pa.age>=pb.min_age_interest)
      and (pb.age_preference_confirmed_at is null or pb.max_age_interest is null or pa.age is null or pa.age<=pb.max_age_interest)
      and (
        p_geography_mode='any'
        or (p_geography_mode='same_country' and nullif(pa.current_country_code,'') is not null and pa.current_country_code=pb.current_country_code)
        or (p_geography_mode='diaspora' and nullif(pa.origin_country_code,'') is not null and pa.origin_country_code=pb.origin_country_code)
      )
      and not exists (
        select 1 from public.blocks blocked
        where (blocked.blocker_id=p_user_a and blocked.blocked_id=p_user_b)
           or (blocked.blocker_id=p_user_b and blocked.blocked_id=p_user_a)
      )
  )
$$;

revoke all on function public.live_pool_profile_is_enabled(uuid) from public,anon,authenticated;
revoke all on function public.live_pool_formats_compatible(text,text) from public,anon,authenticated;
revoke all on function public.live_cross_session_pair_is_eligible(uuid,uuid,uuid,uuid,integer,text) from public,anon,authenticated;

create or replace function public.live_quorum_snapshot_internal(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_session public.live_sessions;
  v_users uuid[];
  v_used uuid[] := '{}'::uuid[];
  v_user uuid;
  v_peer uuid;
  v_attendance integer := 0;
  v_intro_count integer := 0;
  v_pairs integer := 0;
  v_reached boolean;
begin
  select * into v_session from public.live_sessions where id=p_session_id;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode='P0002'; end if;

  select count(*)::integer,
         count(*) filter(where p.open_to_introductions and p.role<>'host')::integer,
         coalesce(array_agg(p.user_id order by p.created_at) filter(where p.open_to_introductions and p.role<>'host'),'{}'::uuid[])
    into v_attendance,v_intro_count,v_users
  from public.live_participants p
  join public.profiles pr on pr.id=p.profile_id
  where p.session_id=p_session_id and p.rsvp_status='going'
    and p.state not in ('left','removed','banned')
    and pr.deleted_at is null and pr.account_state='active' and pr.profile_completed;

  foreach v_user in array v_users loop
    if v_user=any(v_used) then continue; end if;
    select candidate into v_peer
    from unnest(v_users) candidate
    where candidate<>v_user and not(candidate=any(v_used))
      and public.live_match_pair_is_eligible(p_session_id,v_user,candidate)
    limit 1;
    if v_peer is not null then
      v_used:=array_append(array_append(v_used,v_user),v_peer);
      v_pairs:=v_pairs+1;
    end if;
    v_peer:=null;
  end loop;

  v_reached:=v_attendance>=v_session.minimum_participants
    and (not v_session.quorum_pairability_required or v_pairs>=v_session.quorum_required_pairs);

  return jsonb_build_object(
    'session_id',v_session.id,
    'status',case when v_session.status in ('confirmed','backstage','live','ending','ended') or v_reached then 'confirmed' else 'almost_ready' end,
    'attendance_count',v_attendance,
    'minimum_attendance',v_session.minimum_participants,
    'introduction_ready_count',v_intro_count,
    'viable_pair_count',v_pairs,
    'required_pair_count',case when v_session.quorum_pairability_required then v_session.quorum_required_pairs else 0 end,
    'pairability_required',v_session.quorum_pairability_required,
    'reached',v_reached or v_session.status in ('confirmed','backstage','live','ending','ended'),
    'server_now',timezone('utc',now())
  );
end;
$$;

create or replace function public.live_evaluate_quorum(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_session public.live_sessions;
  v_snapshot jsonb;
  v_previous text;
  v_status text;
begin
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null then return null; end if;
  v_snapshot:=public.live_quorum_snapshot_internal(p_session_id);
  v_previous:=v_session.status;
  if v_session.status='scheduled' and not (v_snapshot->>'reached')::boolean then
    update public.live_sessions set status='waiting_for_quorum' where id=p_session_id;
  elsif v_session.status in ('scheduled','waiting_for_quorum') and (v_snapshot->>'reached')::boolean then
    update public.live_sessions set status='confirmed',quorum_reached_at=coalesce(quorum_reached_at,timezone('utc',now())) where id=p_session_id;
  end if;
  select status into v_status from public.live_sessions where id=p_session_id;
  if v_status is distinct from v_previous then
    insert into public.live_session_events(session_id,event_type,from_state,to_state,metadata)
    values(p_session_id,'quorum_evaluated',v_previous,v_status,jsonb_build_object(
      'attendance_count',v_snapshot->'attendance_count','viable_pair_count',v_snapshot->'viable_pair_count'
    ));
  end if;
  insert into public.live_quorum_updates(session_id,status,version,updated_at)
  values(p_session_id,case when v_status in ('confirmed','backstage','live','ending','ended') then 'confirmed' else 'almost_ready' end,1,timezone('utc',now()))
  on conflict(session_id) do update set status=excluded.status,version=public.live_quorum_updates.version+1,updated_at=excluded.updated_at;
  return public.live_quorum_snapshot_internal(p_session_id);
end;
$$;

create or replace function public.live_participant_quorum_changed()
returns trigger
language plpgsql
set search_path=public,pg_catalog
as $$
begin
  if tg_op='DELETE' then
    perform public.live_evaluate_quorum(old.session_id);
    return old;
  end if;
  perform public.live_evaluate_quorum(new.session_id);
  return new;
end;
$$;

create trigger live_participants_quorum_changed
after insert or delete or update of rsvp_status,open_to_introductions,state on public.live_participants
for each row execute function public.live_participant_quorum_changed();

create or replace function public.live_pool_exclusion_reasons(
  p_source_session_id uuid,
  p_candidate_session_id uuid,
  p_rule_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_source public.live_sessions;
  v_candidate public.live_sessions;
  v_rule public.live_pool_rules;
  v_reasons text[] := '{}'::text[];
  v_tags text[];
  v_cross_pair boolean;
begin
  select * into v_source from public.live_sessions where id=p_source_session_id;
  select * into v_candidate from public.live_sessions where id=p_candidate_session_id;
  select * into v_rule from public.live_pool_rules where id=p_rule_id;
  if v_source.id is null or v_candidate.id is null or v_rule.id is null then return array['not_found']; end if;
  if not v_rule.enabled then v_reasons:=array_append(v_reasons,'rule_disabled'); end if;
  if v_source.id=v_candidate.id then v_reasons:=array_append(v_reasons,'same_session'); end if;
  if v_source.status not in ('scheduled','waiting_for_quorum','confirmed') or v_candidate.status not in ('scheduled','waiting_for_quorum','confirmed') then
    v_reasons:=array_append(v_reasons,'session_unavailable');
  end if;
  if not(v_source.format=any(v_rule.allowed_formats)) or not(v_candidate.format=any(v_rule.allowed_formats)) then
    v_reasons:=array_append(v_reasons,'format_not_allowed');
  end if;
  if not public.live_pool_formats_compatible(v_source.format,v_candidate.format) then
    v_reasons:=array_append(v_reasons,'formats_incompatible');
  end if;
  if v_source.format='quick_connect' or v_candidate.format='quick_connect' then
    v_reasons:=array_append(v_reasons,'quick_connect_is_separate');
  end if;
  if not(v_source.context_type=any(v_rule.allowed_context_types)) or not(v_candidate.context_type=any(v_rule.allowed_context_types)) then
    v_reasons:=array_append(v_reasons,'context_not_allowed');
  end if;
  if v_source.scheduled_start is null or v_candidate.scheduled_start is null
     or abs(extract(epoch from(v_source.scheduled_start-v_candidate.scheduled_start))/60)>v_rule.maximum_start_delta_minutes then
    v_reasons:=array_append(v_reasons,'time_not_aligned');
  end if;
  if v_source.id=any(v_rule.blocked_session_ids) or v_candidate.id=any(v_rule.blocked_session_ids) then
    v_reasons:=array_append(v_reasons,'blocked_by_admin_rule');
  end if;
  v_tags:=array(
    select distinct tag from (
      select jsonb_array_elements_text(coalesce(v_source.configuration#>'{pooling,tags}','[]'::jsonb)) tag
      intersect
      select jsonb_array_elements_text(coalesce(v_candidate.configuration#>'{pooling,tags}','[]'::jsonb)) tag
    ) aligned
  );
  if cardinality(v_rule.required_tags)>0 and not(v_rule.required_tags<@coalesce(v_tags,'{}'::text[])) then
    v_reasons:=array_append(v_reasons,'required_tags_missing');
  end if;
  if exists(
    select 1 from public.live_session_pool_members m join public.live_session_pools p on p.id=m.pool_id
    where m.session_id in (v_source.id,v_candidate.id) and p.state in ('offered','active')
  ) then v_reasons:=array_append(v_reasons,'session_already_pooled'); end if;
  if exists(
    select 1
    from public.live_participants a join public.live_participants b on b.session_id=v_candidate.id
    join public.blocks bl on (bl.blocker_id=a.user_id and bl.blocked_id=b.user_id) or (bl.blocker_id=b.user_id and bl.blocked_id=a.user_id)
    where a.session_id=v_source.id and a.rsvp_status='going' and b.rsvp_status='going'
      and public.live_pool_profile_is_enabled(a.user_id) and public.live_pool_profile_is_enabled(b.user_id)
  ) then v_reasons:=array_append(v_reasons,'unsafe_block_relationship'); end if;
  select exists(
    select 1 from public.live_participants a cross join public.live_participants b
    where a.session_id=v_source.id and b.session_id=v_candidate.id
      and public.live_cross_session_pair_is_eligible(v_source.id,a.user_id,v_candidate.id,b.user_id,v_rule.minimum_verification_level,v_rule.geography_mode)
  ) into v_cross_pair;
  if not v_cross_pair then v_reasons:=array_append(v_reasons,'no_viable_cross_session_pair'); end if;
  return v_reasons;
end;
$$;

revoke all on function public.live_quorum_snapshot_internal(uuid) from public,anon,authenticated;
revoke all on function public.live_evaluate_quorum(uuid) from public,anon,authenticated;
revoke all on function public.live_pool_exclusion_reasons(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.rpc_get_live_quorum_pooling_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_quorum jsonb;
  v_offer jsonb;
  v_pool jsonb;
  v_allowed boolean;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_session_forbidden' using errcode='42501';
  end if;
  -- Reads never mutate the invalidation projection. RSVP/configuration triggers
  -- perform evaluation so a Realtime refresh cannot create an update loop.
  v_quorum:=public.live_quorum_snapshot_internal(p_session_id);
  v_allowed:=public.live_pool_profile_is_enabled(auth.uid());
  select jsonb_build_object(
    'id',o.id,'pool_id',o.pool_id,'source_session_id',o.source_session_id,
    'destination_session_id',o.destination_session_id,'destination_title',destination.title,
    'state',o.state,'explanation',o.explanation,'expires_at',o.expires_at
  ) into v_offer
  from public.live_session_pool_offers o
  join public.live_sessions destination on destination.id=o.destination_session_id
  where o.user_id=auth.uid() and o.source_session_id=p_session_id
    and o.state='pending' and o.expires_at>timezone('utc',now())
  order by o.created_at desc limit 1;
  select jsonb_build_object(
    'id',p.id,'state',p.state,'primary_session_id',p.primary_session_id,
    'primary_title',primary_session.title,'explanation',p.explanation,
    'origin_context_type',member.origin_context_type,'origin_context_id',member.origin_context_id,
    'my_offer_state',(
      select own_offer.state from public.live_session_pool_offers own_offer
      where own_offer.pool_id=p.id and own_offer.user_id=auth.uid() limit 1
    )
  ) into v_pool
  from public.live_session_pool_members member
  join public.live_session_pools p on p.id=member.pool_id
  join public.live_sessions primary_session on primary_session.id=p.primary_session_id
  where member.session_id=p_session_id and p.state in ('offered','active') limit 1;
  return jsonb_build_object(
    'quorum',v_quorum,'allow_pooled_live_sessions',v_allowed,
    'offer',v_offer,'pool',v_pool,
    'can_manage_pooling',public.is_admin_user(auth.uid()),
    'server_now',timezone('utc',now())
  );
end;
$$;

create or replace function public.rpc_set_live_pooling_preference(p_allowed boolean)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  insert into public.notification_prefs(user_id,allow_pooled_live_sessions)
  values(auth.uid(),coalesce(p_allowed,false))
  on conflict(user_id) do update set allow_pooled_live_sessions=excluded.allow_pooled_live_sessions,updated_at=timezone('utc',now());
  if not coalesce(p_allowed,false) then
    update public.live_session_pool_offers set state='withdrawn',responded_at=timezone('utc',now())
    where user_id=auth.uid() and state='pending';
  end if;
  insert into public.live_pool_offer_updates(user_id,version,updated_at)
  values(auth.uid(),1,timezone('utc',now()))
  on conflict(user_id) do update set version=public.live_pool_offer_updates.version+1,updated_at=excluded.updated_at;
  return coalesce(p_allowed,false);
end;
$$;

create or replace function public.rpc_configure_live_quorum(
  p_session_id uuid,
  p_minimum_attendance integer,
  p_pairability_required boolean,
  p_required_pairs integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
begin
  if not (
    public.has_live_capability(p_session_id,'live.start_session')
    or public.is_admin_user(auth.uid())
  ) then raise exception 'live_quorum_manage_forbidden' using errcode='42501'; end if;
  if p_minimum_attendance not between 2 and 10000 or p_required_pairs not between 0 and 5000 then
    raise exception 'live_quorum_configuration_invalid' using errcode='22023';
  end if;
  update public.live_sessions set
    minimum_participants=p_minimum_attendance,
    quorum_pairability_required=coalesce(p_pairability_required,false),
    quorum_required_pairs=case when coalesce(p_pairability_required,false) then greatest(1,p_required_pairs) else 0 end
  where id=p_session_id and status in ('draft','scheduled','waiting_for_quorum');
  if not found then raise exception 'live_quorum_configuration_unavailable' using errcode='42501'; end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,metadata)
  values(p_session_id,auth.uid(),'quorum_configured',jsonb_build_object(
    'minimum_attendance',p_minimum_attendance,
    'pairability_required',coalesce(p_pairability_required,false),
    'required_pairs',case when coalesce(p_pairability_required,false) then greatest(1,p_required_pairs) else 0 end
  ));
  return public.live_evaluate_quorum(p_session_id);
end;
$$;

create or replace function public.rpc_preview_live_pool_candidates(p_session_id uuid,p_rule_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_rule public.live_pool_rules;
  v_candidates jsonb;
begin
  if not public.is_admin_user(auth.uid()) then raise exception 'live_pool_admin_required' using errcode='42501'; end if;
  if p_rule_id is null then
    select * into v_rule from public.live_pool_rules where enabled order by updated_at desc limit 1;
  else select * into v_rule from public.live_pool_rules where id=p_rule_id; end if;
  if v_rule.id is null then return jsonb_build_object('rule',null,'candidates','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id',s.id,'title',s.title,'format',s.format,'context_type',s.context_type,
    'scheduled_start',s.scheduled_start,'eligible',cardinality(reasons)=0,
    'reason_codes',reasons,'reason_texts',array(
      select case reason
        when 'format_not_allowed' then 'These event formats cannot be combined.'
        when 'formats_incompatible' then 'These event formats need different privacy boundaries.'
        when 'quick_connect_is_separate' then 'Quick Connect uses its own participant pool.'
        when 'context_not_allowed' then 'The community contexts do not fit this rule.'
        when 'time_not_aligned' then 'The event times are too far apart.'
        when 'blocked_by_admin_rule' then 'An administrator has blocked this combination.'
        when 'required_tags_missing' then 'Required event themes are missing.'
        when 'session_already_pooled' then 'One event already belongs to a Live pool.'
        when 'unsafe_block_relationship' then 'A private safety boundary prevents this combination.'
        when 'no_viable_cross_session_pair' then 'The combined room would not create viable introductions.'
        else 'This event is not currently eligible.' end
      from unnest(reasons) reason
    )
  ) order by s.scheduled_start),'[]'::jsonb) into v_candidates
  from (
    select candidate.*,public.live_pool_exclusion_reasons(p_session_id,candidate.id,v_rule.id) reasons
    from public.live_sessions candidate where candidate.id<>p_session_id
      and candidate.status in ('scheduled','waiting_for_quorum','confirmed')
  ) s;
  return jsonb_build_object(
    'rule',jsonb_build_object('id',v_rule.id,'name',v_rule.name,'explanation',v_rule.explanation),
    'candidates',v_candidates
  );
end;
$$;

create or replace function public.rpc_create_live_session_pool(
  p_source_session_id uuid,
  p_candidate_session_id uuid,
  p_rule_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_rule public.live_pool_rules;
  v_source public.live_sessions;
  v_candidate public.live_sessions;
  v_primary public.live_sessions;
  v_secondary public.live_sessions;
  v_pool_id uuid;
  v_reasons text[];
  v_explanation text;
begin
  if not public.is_admin_user(auth.uid()) then raise exception 'live_pool_admin_required' using errcode='42501'; end if;
  select * into v_rule from public.live_pool_rules where id=p_rule_id for update;
  select * into v_source from public.live_sessions where id=p_source_session_id for update;
  select * into v_candidate from public.live_sessions where id=p_candidate_session_id for update;
  v_reasons:=public.live_pool_exclusion_reasons(p_source_session_id,p_candidate_session_id,p_rule_id);
  insert into public.live_pool_decision_audit(source_session_id,candidate_session_id,actor_user_id,decision,reason_codes)
  values(p_source_session_id,p_candidate_session_id,auth.uid(),case when cardinality(v_reasons)=0 then 'eligible' else 'excluded' end,v_reasons);
  if cardinality(v_reasons)>0 then raise exception 'live_pool_ineligible:%',array_to_string(v_reasons,',') using errcode='42501'; end if;
  if v_source.scheduled_start<=v_candidate.scheduled_start then v_primary:=v_source; v_secondary:=v_candidate;
  else v_primary:=v_candidate; v_secondary:=v_source; end if;
  v_explanation:=format('We are bringing %s and %s together. %s',v_source.title,v_candidate.title,v_rule.explanation);
  insert into public.live_session_pools(rule_id,primary_session_id,state,explanation,created_by_user_id)
  values(v_rule.id,v_primary.id,'offered',v_explanation,auth.uid()) returning id into v_pool_id;
  insert into public.live_session_pool_members(pool_id,session_id,origin_context_type,origin_context_id,is_primary)
  values(v_pool_id,v_primary.id,v_primary.context_type,v_primary.context_id,true),
        (v_pool_id,v_secondary.id,v_secondary.context_type,v_secondary.context_id,false);
  insert into public.live_session_pool_offers(pool_id,user_id,profile_id,source_session_id,destination_session_id,state,explanation,expires_at)
  select v_pool_id,p.user_id,p.profile_id,v_secondary.id,v_primary.id,'pending',v_explanation,
         least(v_primary.scheduled_start,timezone('utc',now())+interval '24 hours')
  from public.live_participants p join public.profiles pr on pr.id=p.profile_id
  where p.session_id=v_secondary.id and p.rsvp_status='going' and p.role<>'host'
    and p.state not in ('left','removed','banned') and public.live_pool_profile_is_enabled(p.user_id)
    and coalesce(pr.verification_level,0)>=v_rule.minimum_verification_level;
  insert into public.live_pool_offer_updates(user_id,version,updated_at)
  select distinct o.user_id,1,timezone('utc',now()) from public.live_session_pool_offers o where o.pool_id=v_pool_id
  on conflict(user_id) do update set version=public.live_pool_offer_updates.version+1,updated_at=excluded.updated_at;
  insert into public.live_pool_decision_audit(pool_id,source_session_id,candidate_session_id,actor_user_id,decision)
  values(v_pool_id,p_source_session_id,p_candidate_session_id,auth.uid(),'offered');
  return v_pool_id;
end;
$$;

create or replace function public.rpc_respond_live_pool_offer(p_offer_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_offer public.live_session_pool_offers;
  v_source_participant public.live_participants;
  v_destination public.live_sessions;
  v_rule public.live_pool_rules;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_offer from public.live_session_pool_offers where id=p_offer_id and user_id=auth.uid() for update;
  if v_offer.id is null then raise exception 'live_pool_offer_not_found' using errcode='P0002'; end if;
  if v_offer.state<>'pending' or v_offer.expires_at<=timezone('utc',now()) then raise exception 'live_pool_offer_unavailable' using errcode='42501'; end if;
  if p_accept and not public.live_pool_profile_is_enabled(auth.uid()) then raise exception 'live_pooling_opted_out' using errcode='42501'; end if;
  select rule.* into v_rule
  from public.live_session_pools pool join public.live_pool_rules rule on rule.id=pool.rule_id
  where pool.id=v_offer.pool_id and pool.state in ('offered','active');
  if p_accept and v_rule.id is null then raise exception 'live_pool_unavailable' using errcode='42501'; end if;
  select * into v_destination from public.live_sessions where id=v_offer.destination_session_id for update;
  if p_accept and v_destination.status not in ('scheduled','waiting_for_quorum','confirmed','backstage') then raise exception 'live_pool_destination_unavailable' using errcode='42501'; end if;
  select * into v_source_participant from public.live_participants where session_id=v_offer.source_session_id and user_id=auth.uid();
  if p_accept and exists(
    select 1 from public.live_participants destination_person
    join public.blocks blocked on
      (blocked.blocker_id=auth.uid() and blocked.blocked_id=destination_person.user_id)
      or (blocked.blocker_id=destination_person.user_id and blocked.blocked_id=auth.uid())
    where destination_person.session_id=v_offer.destination_session_id
      and destination_person.rsvp_status='going'
  ) then raise exception 'live_pool_safety_boundary' using errcode='42501'; end if;
  if p_accept and not exists(
    select 1 from public.live_participants destination_person
    where destination_person.session_id=v_offer.destination_session_id
      and public.live_cross_session_pair_is_eligible(
        v_offer.source_session_id,auth.uid(),v_offer.destination_session_id,destination_person.user_id,
        v_rule.minimum_verification_level,v_rule.geography_mode
      )
  ) then raise exception 'live_pool_no_longer_viable' using errcode='42501'; end if;
  update public.live_session_pool_offers set state=case when p_accept then 'accepted' else 'declined' end,responded_at=timezone('utc',now()) where id=v_offer.id;
  if p_accept then
    insert into public.live_participants(session_id,user_id,profile_id,origin_context_type,origin_context_id,role,state,rsvp_status,open_to_introductions)
    values(v_offer.destination_session_id,auth.uid(),v_offer.profile_id,
      coalesce(v_source_participant.origin_context_type,'global'),v_source_participant.origin_context_id,
      'audience','confirmed','going',coalesce(v_source_participant.open_to_introductions,false))
    on conflict(session_id,user_id) do update set rsvp_status='going';
    insert into public.live_participant_roles(session_id,user_id,role,assigned_by_user_id)
    values(v_offer.destination_session_id,auth.uid(),'audience',auth.uid()) on conflict do nothing;
    update public.live_session_pools set state='active',activated_at=coalesce(activated_at,timezone('utc',now())) where id=v_offer.pool_id and state='offered';
    insert into public.live_session_events(session_id,actor_user_id,event_type,metadata)
    values(v_offer.destination_session_id,auth.uid(),'pool_offer_accepted',jsonb_build_object(
      'pool_id',v_offer.pool_id,'origin_context_type',v_source_participant.origin_context_type,
      'origin_context_id',v_source_participant.origin_context_id
    ));
  end if;
  insert into public.live_pool_offer_updates(user_id,version,updated_at)
  values(auth.uid(),1,timezone('utc',now()))
  on conflict(user_id) do update set version=public.live_pool_offer_updates.version+1,updated_at=excluded.updated_at;
  return public.rpc_get_live_quorum_pooling_snapshot(v_offer.source_session_id);
end;
$$;

create or replace function public.rpc_upsert_live_pool_rule(
  p_rule_id uuid,
  p_name text,
  p_enabled boolean,
  p_allowed_formats text[],
  p_allowed_context_types text[],
  p_maximum_start_delta_minutes integer,
  p_minimum_verification_level integer,
  p_geography_mode text,
  p_required_tags text[],
  p_blocked_session_ids uuid[],
  p_explanation text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare v_id uuid;
begin
  if not public.is_admin_user(auth.uid()) then raise exception 'live_pool_admin_required' using errcode='42501'; end if;
  insert into public.live_pool_rules(id,name,enabled,allowed_formats,allowed_context_types,maximum_start_delta_minutes,
    minimum_verification_level,geography_mode,required_tags,blocked_session_ids,explanation,created_by_user_id,updated_by_user_id)
  values(coalesce(p_rule_id,gen_random_uuid()),btrim(p_name),p_enabled,p_allowed_formats,p_allowed_context_types,
    p_maximum_start_delta_minutes,p_minimum_verification_level,p_geography_mode,coalesce(p_required_tags,'{}'),
    coalesce(p_blocked_session_ids,'{}'),btrim(p_explanation),auth.uid(),auth.uid())
  on conflict(id) do update set name=excluded.name,enabled=excluded.enabled,allowed_formats=excluded.allowed_formats,
    allowed_context_types=excluded.allowed_context_types,maximum_start_delta_minutes=excluded.maximum_start_delta_minutes,
    minimum_verification_level=excluded.minimum_verification_level,geography_mode=excluded.geography_mode,
    required_tags=excluded.required_tags,blocked_session_ids=excluded.blocked_session_ids,explanation=excluded.explanation,
    updated_by_user_id=auth.uid(),updated_at=timezone('utc',now())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rpc_get_live_quorum_pooling_snapshot(uuid) from public,anon;
revoke all on function public.rpc_set_live_pooling_preference(boolean) from public,anon;
revoke all on function public.rpc_configure_live_quorum(uuid,integer,boolean,integer) from public,anon;
revoke all on function public.rpc_preview_live_pool_candidates(uuid,uuid) from public,anon;
revoke all on function public.rpc_create_live_session_pool(uuid,uuid,uuid) from public,anon;
revoke all on function public.rpc_respond_live_pool_offer(uuid,boolean) from public,anon;
revoke all on function public.rpc_upsert_live_pool_rule(uuid,text,boolean,text[],text[],integer,integer,text,text[],uuid[],text) from public,anon;
grant execute on function public.rpc_get_live_quorum_pooling_snapshot(uuid) to authenticated;
grant execute on function public.rpc_set_live_pooling_preference(boolean) to authenticated;
grant execute on function public.rpc_configure_live_quorum(uuid,integer,boolean,integer) to authenticated;
grant execute on function public.rpc_preview_live_pool_candidates(uuid,uuid) to authenticated;
grant execute on function public.rpc_create_live_session_pool(uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_respond_live_pool_offer(uuid,boolean) to authenticated;
grant execute on function public.rpc_upsert_live_pool_rule(uuid,text,boolean,text[],text[],integer,integer,text,text[],uuid[],text) to authenticated;

alter table public.live_pool_rules enable row level security;
alter table public.live_session_pools enable row level security;
alter table public.live_session_pool_members enable row level security;
alter table public.live_session_pool_offers enable row level security;
alter table public.live_pool_decision_audit enable row level security;
alter table public.live_quorum_updates enable row level security;
alter table public.live_pool_offer_updates enable row level security;

create policy live_pool_rules_admin_select on public.live_pool_rules for select to authenticated using(public.is_admin_user(auth.uid()));
create policy live_session_pools_admin_select on public.live_session_pools for select to authenticated using(public.is_admin_user(auth.uid()));
create policy live_session_pool_members_admin_select on public.live_session_pool_members for select to authenticated using(public.is_admin_user(auth.uid()));
create policy live_session_pool_offers_own_select on public.live_session_pool_offers for select to authenticated using(user_id=auth.uid());
create policy live_pool_decision_audit_admin_select on public.live_pool_decision_audit for select to authenticated using(public.is_admin_user(auth.uid()));
create policy live_quorum_updates_visible_select on public.live_quorum_updates for select to authenticated using(public.can_view_live_session(session_id,auth.uid()));
create policy live_pool_offer_updates_own_select on public.live_pool_offer_updates for select to authenticated using(user_id=auth.uid());

revoke all on public.live_pool_rules,public.live_session_pools,public.live_session_pool_members,
  public.live_session_pool_offers,public.live_pool_decision_audit,public.live_quorum_updates,public.live_pool_offer_updates
  from public,anon,authenticated;
grant select on public.live_pool_rules,public.live_session_pools,public.live_session_pool_members,public.live_pool_decision_audit to authenticated;
grant select on public.live_session_pool_offers,public.live_quorum_updates,public.live_pool_offer_updates to authenticated;

alter publication supabase_realtime add table public.live_quorum_updates;
alter publication supabase_realtime add table public.live_pool_offer_updates;

-- Bring existing scheduled events into the explicit quorum lifecycle once.
-- Future evaluations are driven only by RSVP/configuration transitions.
do $$
declare v_session record;
begin
  for v_session in
    select id from public.live_sessions where status in ('scheduled','waiting_for_quorum') order by id
  loop
    perform public.live_evaluate_quorum(v_session.id);
  end loop;
end;
$$;

commit;
