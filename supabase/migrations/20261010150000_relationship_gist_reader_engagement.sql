-- Relationship Gist 2.0 reader engagement: private reflections, edition-scoped
-- reactions, and payload-free reader analytics. Additive and default-off in clients.

begin;

create table if not exists public.relationship_gist_reactions (
  edition_id uuid not null references public.relationship_gist_editions(id) on delete restrict,
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('helpful', 'resonated', 'made_me_think')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (edition_id, user_id)
);

create table if not exists public.relationship_gist_reflections (
  edition_id uuid not null references public.relationship_gist_editions(id) on delete restrict,
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (edition_id, user_id)
);

create table if not exists public.relationship_gist_engagement_receipts (
  operation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_kind text not null check (operation_kind in (
    'reaction_set', 'reaction_remove', 'reflection_upsert', 'reflection_delete'
  )),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, operation_id)
);

create table if not exists public.relationship_gist_reader_events (
  id bigint generated always as identity primary key,
  client_event_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id uuid not null references public.relationship_gist_editions(id) on delete restrict,
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  event_type text not null check (event_type in (
    'impression', 'open', 'progress', 'save', 'unsave', 'share',
    'reaction_set', 'reaction_remove', 'reflection_created',
    'reflection_updated', 'reflection_deleted', 'returning_reader'
  )),
  progress_bucket smallint check (progress_bucket is null or progress_bucket in (0, 25, 50, 75, 100)),
  source text not null check (source in ('circles', 'saved_library', 'canonical_reader')),
  session_id uuid,
  occurred_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, client_event_id)
);

create table if not exists public.relationship_gist_engagement_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null default timezone('utc'::text, now()),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, action)
);

create index if not exists relationship_gist_reactions_revision_idx
  on public.relationship_gist_reactions (revision_id, reaction);
create index if not exists relationship_gist_reflections_user_idx
  on public.relationship_gist_reflections (user_id, updated_at desc);
create index if not exists relationship_gist_reader_events_edition_idx
  on public.relationship_gist_reader_events (edition_id, event_type, occurred_at desc);
create index if not exists relationship_gist_reader_events_returning_idx
  on public.relationship_gist_reader_events (user_id, edition_id, occurred_at desc)
  where event_type = 'open';

alter table public.relationship_gist_reactions enable row level security;
alter table public.relationship_gist_reflections enable row level security;
alter table public.relationship_gist_engagement_receipts enable row level security;
alter table public.relationship_gist_reader_events enable row level security;
alter table public.relationship_gist_engagement_rate_limits enable row level security;

revoke all on table public.relationship_gist_reactions from public, anon, authenticated;
revoke all on table public.relationship_gist_reflections from public, anon, authenticated;
revoke all on table public.relationship_gist_engagement_receipts from public, anon, authenticated;
revoke all on table public.relationship_gist_reader_events from public, anon, authenticated;
revoke all on table public.relationship_gist_engagement_rate_limits from public, anon, authenticated;
grant all on table public.relationship_gist_reactions to service_role;
grant all on table public.relationship_gist_reflections to service_role;
grant all on table public.relationship_gist_engagement_receipts to service_role;
grant all on table public.relationship_gist_reader_events to service_role;
grant all on table public.relationship_gist_engagement_rate_limits to service_role;

create or replace function public.relationship_gist_engagement_consume_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window interval
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_count integer;
begin
  insert into public.relationship_gist_engagement_rate_limits (
    user_id, action, window_started_at, request_count, updated_at
  ) values (p_user_id, p_action, v_now, 1, v_now)
  on conflict (user_id, action) do update
  set window_started_at = case
        when public.relationship_gist_engagement_rate_limits.window_started_at <= v_now - p_window
          then v_now else public.relationship_gist_engagement_rate_limits.window_started_at end,
      request_count = case
        when public.relationship_gist_engagement_rate_limits.window_started_at <= v_now - p_window
          then 1 else public.relationship_gist_engagement_rate_limits.request_count + 1 end,
      updated_at = v_now
  returning request_count into v_count;
  if v_count > p_limit then
    raise exception 'relationship_gist_engagement_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.relationship_gist_engagement_consume_rate_limit(uuid,text,integer,interval)
  from public, anon, authenticated;

create or replace function public.relationship_gist_engagement_resolve(
  p_gist_id uuid,
  p_revision_id uuid default null
)
returns table (edition_id uuid, revision_id uuid)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select edition.id, revision.id
  from public.relationship_gist_editions edition
  join lateral (
    select candidate.id
    from public.relationship_gist_revisions candidate
    where candidate.edition_id = edition.id
      and (
        (p_revision_id is not null and candidate.id = p_revision_id
          and candidate.status in ('published', 'superseded'))
        or
        (p_revision_id is null and (
          candidate.status = 'published'
          or (candidate.status = 'scheduled'
            and candidate.scheduled_for <= timezone('utc'::text, now()))
        ))
      )
    order by
      case when candidate.id = p_revision_id then 0 else 1 end,
      case when candidate.status = 'scheduled' then 0 else 1 end,
      coalesce(candidate.scheduled_for, candidate.published_at) desc nulls last,
      candidate.revision_number desc
    limit 1
  ) revision on true
  where edition.legacy_gist_id = p_gist_id
    and exists (
      select 1 from public.relationship_gist_revisions visible
      where visible.edition_id = edition.id
        and (visible.status = 'published' or (
          visible.status = 'scheduled'
          and visible.scheduled_for <= timezone('utc'::text, now())
        ))
    );
$$;

revoke all on function public.relationship_gist_engagement_resolve(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.rpc_get_relationship_gist_engagement(
  p_gist_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_resolved record;
  v_reaction public.relationship_gist_reactions%rowtype;
  v_reflection public.relationship_gist_reflections%rowtype;
  v_counts jsonb;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v_resolved from public.relationship_gist_engagement_resolve(p_gist_id, null);
  if v_resolved.edition_id is null then raise exception 'relationship_gist_unavailable' using errcode = 'P0002'; end if;

  select * into v_reaction from public.relationship_gist_reactions reaction
  where reaction.edition_id = v_resolved.edition_id and reaction.user_id = v_user;
  select * into v_reflection from public.relationship_gist_reflections reflection
  where reflection.edition_id = v_resolved.edition_id and reflection.user_id = v_user;
  select jsonb_build_object(
    'helpful', count(*) filter (where reaction = 'helpful'),
    'resonated', count(*) filter (where reaction = 'resonated'),
    'made_me_think', count(*) filter (where reaction = 'made_me_think')
  ) into v_counts
  from public.relationship_gist_reactions where edition_id = v_resolved.edition_id;

  return jsonb_build_object(
    'gist_id', p_gist_id,
    'edition_id', v_resolved.edition_id,
    'revision_id', v_resolved.revision_id,
    'reaction', v_reaction.reaction,
    'reaction_revision_id', v_reaction.revision_id,
    'reaction_counts', v_counts,
    'reflection', case when v_reflection.edition_id is null then null else jsonb_build_object(
      'body', v_reflection.body,
      'revision_id', v_reflection.revision_id,
      'created_at', v_reflection.created_at,
      'updated_at', v_reflection.updated_at
    ) end
  );
end;
$$;

create or replace function public.rpc_set_relationship_gist_reaction(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_gist_id uuid,
  p_revision_id uuid,
  p_reaction text default null,
  p_source text default 'canonical_reader'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_resolved record;
  v_existing jsonb;
  v_result jsonb;
  v_event text;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_owner_user_id is distinct from v_user then raise exception 'relationship_gist_owner_mismatch' using errcode = '42501'; end if;
  if p_reaction is not null and p_reaction not in ('helpful','resonated','made_me_think') then
    raise exception 'relationship_gist_reaction_invalid';
  end if;
  if p_source not in ('circles','saved_library','canonical_reader') then
    raise exception 'relationship_gist_source_invalid';
  end if;
  select result into v_existing from public.relationship_gist_engagement_receipts
  where user_id = v_user and operation_id = p_operation_id;
  if v_existing is not null then return v_existing || jsonb_build_object('delivery', 'duplicate'); end if;
  perform public.relationship_gist_engagement_consume_rate_limit(v_user, 'reaction', 30, interval '1 minute');
  select * into v_resolved from public.relationship_gist_engagement_resolve(p_gist_id, p_revision_id);
  if v_resolved.edition_id is null then raise exception 'relationship_gist_revision_unavailable' using errcode = 'P0002'; end if;

  if p_reaction is null then
    delete from public.relationship_gist_reactions
    where edition_id = v_resolved.edition_id and user_id = v_user;
    v_event := 'reaction_remove';
  else
    insert into public.relationship_gist_reactions (edition_id, revision_id, user_id, reaction)
    values (v_resolved.edition_id, v_resolved.revision_id, v_user, p_reaction)
    on conflict (edition_id, user_id) do update
    set revision_id = excluded.revision_id, reaction = excluded.reaction,
        updated_at = timezone('utc'::text, now());
    v_event := 'reaction_set';
  end if;
  v_result := jsonb_build_object(
    'delivery', 'processed', 'gist_id', p_gist_id,
    'edition_id', v_resolved.edition_id, 'revision_id', v_resolved.revision_id,
    'reaction', p_reaction
  );
  insert into public.relationship_gist_engagement_receipts(operation_id,user_id,operation_kind,result)
  values (p_operation_id,v_user,v_event,v_result);
  insert into public.relationship_gist_reader_events(
    client_event_id,user_id,edition_id,revision_id,event_type,source
  ) values (p_operation_id,v_user,v_resolved.edition_id,v_resolved.revision_id,v_event,p_source)
  on conflict (user_id,client_event_id) do nothing;
  return v_result;
end;
$$;

create or replace function public.rpc_upsert_relationship_gist_reflection(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_gist_id uuid,
  p_revision_id uuid,
  p_body text,
  p_source text default 'canonical_reader'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_resolved record;
  v_existing jsonb;
  v_created boolean;
  v_result jsonb;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_owner_user_id is distinct from v_user then raise exception 'relationship_gist_owner_mismatch' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 2000 then
    raise exception 'relationship_gist_reflection_invalid';
  end if;
  if p_source not in ('circles','saved_library','canonical_reader') then raise exception 'relationship_gist_source_invalid'; end if;
  select result into v_existing from public.relationship_gist_engagement_receipts
  where user_id = v_user and operation_id = p_operation_id;
  if v_existing is not null then return v_existing || jsonb_build_object('delivery','duplicate'); end if;
  perform public.relationship_gist_engagement_consume_rate_limit(v_user, 'reflection', 12, interval '1 minute');
  select * into v_resolved from public.relationship_gist_engagement_resolve(p_gist_id,p_revision_id);
  if v_resolved.edition_id is null then raise exception 'relationship_gist_revision_unavailable' using errcode = 'P0002'; end if;
  v_created := not exists (
    select 1 from public.relationship_gist_reflections
    where edition_id = v_resolved.edition_id and user_id = v_user
  );
  insert into public.relationship_gist_reflections(edition_id,revision_id,user_id,body)
  values (v_resolved.edition_id,v_resolved.revision_id,v_user,btrim(p_body))
  on conflict (edition_id,user_id) do update
  set revision_id=excluded.revision_id,body=excluded.body,updated_at=timezone('utc'::text,now());
  v_result := jsonb_build_object(
    'delivery','processed','gist_id',p_gist_id,'edition_id',v_resolved.edition_id,
    'revision_id',v_resolved.revision_id,'created',v_created
  );
  -- The receipt deliberately excludes private reflection text.
  insert into public.relationship_gist_engagement_receipts(operation_id,user_id,operation_kind,result)
  values (p_operation_id,v_user,'reflection_upsert',v_result);
  insert into public.relationship_gist_reader_events(
    client_event_id,user_id,edition_id,revision_id,event_type,source
  ) values (
    p_operation_id,v_user,v_resolved.edition_id,v_resolved.revision_id,
    case when v_created then 'reflection_created' else 'reflection_updated' end,p_source
  ) on conflict (user_id,client_event_id) do nothing;
  return v_result;
end;
$$;

create or replace function public.rpc_delete_relationship_gist_reflection(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_gist_id uuid,
  p_revision_id uuid,
  p_source text default 'canonical_reader'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_resolved record;
  v_existing jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_owner_user_id is distinct from v_user then raise exception 'relationship_gist_owner_mismatch' using errcode = '42501'; end if;
  if p_source not in ('circles','saved_library','canonical_reader') then raise exception 'relationship_gist_source_invalid'; end if;
  select result into v_existing from public.relationship_gist_engagement_receipts
  where user_id=v_user and operation_id=p_operation_id;
  if v_existing is not null then return v_existing || jsonb_build_object('delivery','duplicate'); end if;
  perform public.relationship_gist_engagement_consume_rate_limit(v_user,'reflection',12,interval '1 minute');
  select * into v_resolved from public.relationship_gist_engagement_resolve(p_gist_id,p_revision_id);
  if v_resolved.edition_id is null then raise exception 'relationship_gist_revision_unavailable' using errcode='P0002'; end if;
  delete from public.relationship_gist_reflections
  where edition_id=v_resolved.edition_id and user_id=v_user;
  v_result := jsonb_build_object(
    'delivery','processed','gist_id',p_gist_id,'edition_id',v_resolved.edition_id,
    'revision_id',v_resolved.revision_id,'deleted',found
  );
  insert into public.relationship_gist_engagement_receipts(operation_id,user_id,operation_kind,result)
  values (p_operation_id,v_user,'reflection_delete',v_result);
  insert into public.relationship_gist_reader_events(
    client_event_id,user_id,edition_id,revision_id,event_type,source
  ) values (p_operation_id,v_user,v_resolved.edition_id,v_resolved.revision_id,'reflection_deleted',p_source)
  on conflict (user_id,client_event_id) do nothing;
  return v_result;
end;
$$;

create or replace function public.rpc_record_relationship_gist_reader_event(
  p_client_event_id uuid,
  p_owner_user_id uuid,
  p_gist_id uuid,
  p_revision_id uuid,
  p_event_type text,
  p_progress_bucket smallint default null,
  p_source text default 'canonical_reader',
  p_session_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_resolved record;
  v_returning boolean := false;
  v_inserted integer := 0;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_owner_user_id is distinct from v_user then raise exception 'relationship_gist_owner_mismatch' using errcode='42501'; end if;
  if p_event_type not in ('impression','open','progress','save','unsave','share') then
    raise exception 'relationship_gist_event_invalid';
  end if;
  if p_progress_bucket is not null and p_progress_bucket not in (0,25,50,75,100) then
    raise exception 'relationship_gist_progress_bucket_invalid';
  end if;
  if p_event_type = 'progress' and p_progress_bucket is null then
    raise exception 'relationship_gist_progress_bucket_required';
  end if;
  if p_source not in ('circles','saved_library','canonical_reader') then raise exception 'relationship_gist_source_invalid'; end if;
  if exists (
    select 1 from public.relationship_gist_reader_events
    where user_id=v_user and client_event_id=p_client_event_id
  ) then
    return jsonb_build_object('recorded',false,'delivery','duplicate');
  end if;
  perform public.relationship_gist_engagement_consume_rate_limit(v_user,'analytics',120,interval '1 minute');
  select * into v_resolved from public.relationship_gist_engagement_resolve(p_gist_id,p_revision_id);
  if v_resolved.edition_id is null then raise exception 'relationship_gist_revision_unavailable' using errcode='P0002'; end if;

  if p_event_type = 'open' then
    select exists (
      select 1 from public.relationship_gist_reader_events prior
      where prior.user_id=v_user and prior.edition_id=v_resolved.edition_id
        and prior.event_type='open'
        and prior.occurred_at < date_trunc('day', timezone('utc'::text,now()))
    ) into v_returning;
  end if;
  insert into public.relationship_gist_reader_events(
    client_event_id,user_id,edition_id,revision_id,event_type,progress_bucket,source,session_id
  ) values (
    p_client_event_id,v_user,v_resolved.edition_id,v_resolved.revision_id,
    p_event_type,p_progress_bucket,p_source,p_session_id
  ) on conflict (user_id,client_event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_returning and v_inserted > 0 then
    insert into public.relationship_gist_reader_events(
      client_event_id,user_id,edition_id,revision_id,event_type,source,session_id
    ) values (
      gen_random_uuid(),v_user,v_resolved.edition_id,v_resolved.revision_id,
      'returning_reader',p_source,p_session_id
    );
  end if;
  return jsonb_build_object(
    'recorded',v_inserted > 0,
    'delivery',case when v_inserted > 0 then 'processed' else 'duplicate' end
  );
end;
$$;

revoke all on function public.rpc_get_relationship_gist_engagement(uuid) from public, anon;
revoke all on function public.rpc_set_relationship_gist_reaction(uuid,uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.rpc_upsert_relationship_gist_reflection(uuid,uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.rpc_delete_relationship_gist_reflection(uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.rpc_record_relationship_gist_reader_event(uuid,uuid,uuid,uuid,text,smallint,text,uuid) from public, anon;
grant execute on function public.rpc_get_relationship_gist_engagement(uuid) to authenticated, service_role;
grant execute on function public.rpc_set_relationship_gist_reaction(uuid,uuid,uuid,uuid,text,text) to authenticated, service_role;
grant execute on function public.rpc_upsert_relationship_gist_reflection(uuid,uuid,uuid,uuid,text,text) to authenticated, service_role;
grant execute on function public.rpc_delete_relationship_gist_reflection(uuid,uuid,uuid,uuid,text) to authenticated, service_role;
grant execute on function public.rpc_record_relationship_gist_reader_event(uuid,uuid,uuid,uuid,text,smallint,text,uuid) to authenticated, service_role;

commit;
