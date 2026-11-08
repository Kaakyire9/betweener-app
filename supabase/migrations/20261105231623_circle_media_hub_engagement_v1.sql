begin;

create table public.circle_media_saved_items (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, pulse_item_id)
);

create table public.circle_media_submissions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  asset_id uuid not null unique references public.circle_media_assets(id) on delete cascade,
  submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  subtitle text,
  body text,
  status text not null default 'pending_moderation',
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint circle_media_submission_status_valid check (status in ('pending_moderation', 'pending_host_review', 'published', 'rejected', 'withdrawn')),
  constraint circle_media_submission_title_valid check (char_length(btrim(title)) between 1 and 140)
);

create index circle_media_submissions_host_queue_idx
  on public.circle_media_submissions(circle_id, status, created_at)
  where status in ('pending_moderation', 'pending_host_review');

create table public.circle_media_reactions (
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (pulse_item_id, profile_id),
  constraint circle_media_reaction_valid check (reaction in ('love', 'spark', 'laugh', 'useful'))
);

create table public.circle_media_daily_analytics (
  circle_id uuid not null references public.circles(id) on delete cascade,
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  event_day date not null default (timezone('utc', now()))::date,
  opens bigint not null default 0,
  play_starts bigint not null default 0,
  completions bigint not null default 0,
  discussion_opens bigint not null default 0,
  saves bigint not null default 0,
  reactions bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (pulse_item_id, event_day),
  constraint circle_media_analytics_nonnegative check (
    opens >= 0 and play_starts >= 0 and completions >= 0 and discussion_opens >= 0 and saves >= 0 and reactions >= 0
  )
);

alter table public.circle_media_saved_items enable row level security;
alter table public.circle_media_submissions enable row level security;
alter table public.circle_media_reactions enable row level security;
alter table public.circle_media_daily_analytics enable row level security;
revoke all on table public.circle_media_saved_items, public.circle_media_submissions, public.circle_media_reactions, public.circle_media_daily_analytics from public, anon, authenticated;
grant all on table public.circle_media_saved_items, public.circle_media_submissions, public.circle_media_reactions, public.circle_media_daily_analytics to service_role;

create or replace function private.record_circle_media_aggregate_event(p_pulse_item_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_circle_id uuid;
begin
  select item.circle_id into v_circle_id
  from public.circle_pulse_items item
  where item.id = p_pulse_item_id and item.item_type = 'media' and item.status = 'active';
  if v_circle_id is null or not public.is_circle_member(v_circle_id, auth.uid()) then return; end if;
  if p_event not in ('open', 'play_start', 'complete', 'discussion_open', 'save', 'reaction') then return; end if;
  insert into public.circle_media_daily_analytics(circle_id, pulse_item_id)
  values (v_circle_id, p_pulse_item_id)
  on conflict (pulse_item_id, event_day) do update set
    opens = public.circle_media_daily_analytics.opens + case when p_event = 'open' then 1 else 0 end,
    play_starts = public.circle_media_daily_analytics.play_starts + case when p_event = 'play_start' then 1 else 0 end,
    completions = public.circle_media_daily_analytics.completions + case when p_event = 'complete' then 1 else 0 end,
    discussion_opens = public.circle_media_daily_analytics.discussion_opens + case when p_event = 'discussion_open' then 1 else 0 end,
    saves = public.circle_media_daily_analytics.saves + case when p_event = 'save' then 1 else 0 end,
    reactions = public.circle_media_daily_analytics.reactions + case when p_event = 'reaction' then 1 else 0 end,
    updated_at = timezone('utc', now());
end;
$$;

create or replace function private.toggle_circle_media_saved(p_pulse_item_id uuid, p_actor_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_circle_id uuid; v_saved boolean;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_profile_id and p.user_id = auth.uid() and p.deleted_at is null) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select item.circle_id into v_circle_id from public.circle_pulse_items item
  where item.id = p_pulse_item_id and item.item_type = 'media' and item.status = 'active';
  if v_circle_id is null or not public.is_circle_member(v_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;
  delete from public.circle_media_saved_items where profile_id = p_actor_profile_id and pulse_item_id = p_pulse_item_id;
  if found then return false; end if;
  insert into public.circle_media_saved_items(profile_id, pulse_item_id, circle_id) values (p_actor_profile_id, p_pulse_item_id, v_circle_id);
  perform private.record_circle_media_aggregate_event(p_pulse_item_id, 'save');
  return true;
end;
$$;

create or replace function private.toggle_circle_media_reaction(p_pulse_item_id uuid, p_actor_profile_id uuid, p_reaction text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_circle_id uuid; v_existing text;
begin
  if p_reaction not in ('love', 'spark', 'laugh', 'useful') then raise exception 'invalid_media_reaction'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_profile_id and p.user_id = auth.uid() and p.deleted_at is null) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select item.circle_id into v_circle_id from public.circle_pulse_items item
  where item.id = p_pulse_item_id and item.item_type = 'media' and item.status = 'active';
  if v_circle_id is null or not public.is_circle_member(v_circle_id, auth.uid()) then raise exception 'circle_membership_required' using errcode = '42501'; end if;
  select reaction into v_existing from public.circle_media_reactions where pulse_item_id = p_pulse_item_id and profile_id = p_actor_profile_id;
  if v_existing = p_reaction then
    delete from public.circle_media_reactions where pulse_item_id = p_pulse_item_id and profile_id = p_actor_profile_id;
    return null;
  end if;
  insert into public.circle_media_reactions(pulse_item_id, circle_id, profile_id, reaction)
  values (p_pulse_item_id, v_circle_id, p_actor_profile_id, p_reaction)
  on conflict (pulse_item_id, profile_id) do update set reaction = excluded.reaction, updated_at = timezone('utc', now());
  perform private.record_circle_media_aggregate_event(p_pulse_item_id, 'reaction');
  return p_reaction;
end;
$$;

create or replace function private.submit_circle_media_asset_to_queue(
  p_asset_id uuid, p_actor_profile_id uuid, p_title text, p_subtitle text default null, p_body text default null
)
returns public.circle_media_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare v_asset public.circle_media_assets%rowtype; v_submission public.circle_media_submissions%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_profile_id and p.user_id = auth.uid() and p.deleted_at is null) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into v_asset from public.circle_media_assets where id = p_asset_id for update;
  if v_asset.id is null or v_asset.uploader_user_id <> auth.uid() or v_asset.uploader_profile_id <> p_actor_profile_id then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.is_circle_member(v_asset.circle_id, auth.uid()) then raise exception 'circle_membership_required' using errcode = '42501'; end if;
  if v_asset.status not in ('quarantined', 'ready') then raise exception 'circle_media_asset_not_submittable'; end if;
  insert into public.circle_media_submissions(circle_id, asset_id, submitted_by_profile_id, title, subtitle, body, status)
  values (v_asset.circle_id, v_asset.id, p_actor_profile_id, btrim(p_title), nullif(btrim(coalesce(p_subtitle,'')),''), nullif(btrim(coalesce(p_body,'')),''), case when v_asset.status = 'ready' then 'pending_host_review' else 'pending_moderation' end)
  returning * into v_submission;
  return v_submission;
end;
$$;

create or replace function private.get_my_circle_media_saved(p_circle_id uuid, p_actor_profile_id uuid)
returns table(pulse_item_id uuid)
language sql security definer set search_path = '' stable as $$
  select saved.pulse_item_id from public.circle_media_saved_items saved
  join public.profiles profile on profile.id = saved.profile_id and profile.user_id = auth.uid()
  where saved.circle_id = p_circle_id and saved.profile_id = p_actor_profile_id and public.is_circle_member(p_circle_id, auth.uid());
$$;

create or replace function private.get_circle_media_submission_queue(p_circle_id uuid)
returns table(
  submission_id uuid,
  asset_id uuid,
  title text,
  subtitle text,
  body text,
  status text,
  submitter_profile_id uuid,
  submitter_name text,
  media_type text,
  poster_object_path text,
  created_at timestamptz
)
language sql security definer set search_path = '' stable as $$
  select submission.id, submission.asset_id, submission.title, submission.subtitle, submission.body,
    submission.status, submission.submitted_by_profile_id, coalesce(profile.full_name, 'Circle member'),
    asset.media_type, asset.poster_object_path, submission.created_at
  from public.circle_media_submissions submission
  join public.circle_media_assets asset on asset.id = submission.asset_id
  left join public.profiles profile on profile.id = submission.submitted_by_profile_id
  where submission.circle_id = p_circle_id
    and submission.status in ('pending_moderation', 'pending_host_review')
    and public.can_manage_circle_pulse(p_circle_id, auth.uid())
  order by submission.created_at;
$$;

create or replace function private.get_circle_media_reaction_summaries(p_circle_id uuid, p_actor_profile_id uuid)
returns table(pulse_item_id uuid, reaction text, reaction_count bigint, my_reaction boolean)
language sql security definer set search_path = '' stable as $$
  select media_reaction.pulse_item_id, media_reaction.reaction, count(*)::bigint,
    bool_or(media_reaction.profile_id = p_actor_profile_id)
  from public.circle_media_reactions media_reaction
  join public.profiles viewer on viewer.id = p_actor_profile_id and viewer.user_id = auth.uid()
  where media_reaction.circle_id = p_circle_id and public.is_circle_member(p_circle_id, auth.uid())
  group by media_reaction.pulse_item_id, media_reaction.reaction;
$$;

create or replace function private.review_circle_media_submission(
  p_submission_id uuid,
  p_actor_profile_id uuid,
  p_approve boolean
)
returns public.circle_media_submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_submission public.circle_media_submissions%rowtype;
  v_asset public.circle_media_assets%rowtype;
  v_item_id uuid;
begin
  if not exists (select 1 from public.profiles profile where profile.id = p_actor_profile_id and profile.user_id = auth.uid() and profile.deleted_at is null) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_submission from public.circle_media_submissions where id = p_submission_id for update;
  if v_submission.id is null or not public.can_manage_circle_pulse(v_submission.circle_id, auth.uid()) then raise exception 'host_required' using errcode = '42501'; end if;
  if v_submission.status <> 'pending_host_review' then raise exception 'media_submission_not_ready_for_review'; end if;
  select * into v_asset from public.circle_media_assets where id = v_submission.asset_id for update;
  if v_asset.status <> 'ready' or v_asset.moderation_status <> 'approved' then raise exception 'media_asset_not_approved'; end if;
  if not p_approve then
    update public.circle_media_submissions set status = 'rejected', reviewed_by_profile_id = p_actor_profile_id, reviewed_at = timezone('utc', now()), updated_at = timezone('utc', now()) where id = v_submission.id returning * into v_submission;
    update public.circle_media_assets set status = 'rejected', purge_after = timezone('utc', now()) + interval '7 days', updated_at = timezone('utc', now()) where id = v_asset.id;
    return v_submission;
  end if;
  insert into public.circle_pulse_items(circle_id, item_type, title, subtitle, body, image_url, media_url, media_type, media_asset_id, status, priority, starts_at, expires_at, created_by_profile_id, created_by_user_id)
  values (v_submission.circle_id, 'media', v_submission.title, v_submission.subtitle, v_submission.body,
    case when v_asset.media_type = 'image' then v_asset.object_path else v_asset.poster_object_path end,
    v_asset.object_path, v_asset.media_type, v_asset.id, 'active', 0, timezone('utc', now()), timezone('utc', now()) + interval '90 days', p_actor_profile_id, auth.uid())
  returning id into v_item_id;
  update public.circle_media_assets set status = 'published', pulse_item_id = v_item_id, published_at = timezone('utc', now()), expires_at = timezone('utc', now()) + interval '90 days', updated_at = timezone('utc', now()) where id = v_asset.id;
  update public.circle_media_submissions set status = 'published', reviewed_by_profile_id = p_actor_profile_id, reviewed_at = timezone('utc', now()), updated_at = timezone('utc', now()) where id = v_submission.id returning * into v_submission;
  return v_submission;
end;
$$;

create or replace function private.sync_circle_media_submission_readiness()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    update public.circle_media_submissions set status = 'pending_host_review', updated_at = timezone('utc', now()) where asset_id = new.id and status = 'pending_moderation';
  elsif new.status = 'rejected' then
    update public.circle_media_submissions set status = 'rejected', reviewed_at = timezone('utc', now()), updated_at = timezone('utc', now()) where asset_id = new.id and status in ('pending_moderation','pending_host_review');
  end if;
  return new;
end; $$;
drop trigger if exists circle_media_submission_readiness on public.circle_media_assets;
create trigger circle_media_submission_readiness after update of status on public.circle_media_assets for each row execute function private.sync_circle_media_submission_readiness();

create or replace function public.rpc_get_my_circle_media_saved(p_circle_id uuid, p_actor_profile_id uuid)
returns table(pulse_item_id uuid) language sql security definer set search_path = '' stable as $$ select * from private.get_my_circle_media_saved(p_circle_id, p_actor_profile_id); $$;
create or replace function public.rpc_toggle_circle_media_saved(p_pulse_item_id uuid, p_actor_profile_id uuid)
returns boolean language sql security definer set search_path = '' as $$ select private.toggle_circle_media_saved(p_pulse_item_id, p_actor_profile_id); $$;
create or replace function public.rpc_toggle_circle_media_reaction(p_pulse_item_id uuid, p_actor_profile_id uuid, p_reaction text)
returns text language sql security definer set search_path = '' as $$ select private.toggle_circle_media_reaction(p_pulse_item_id, p_actor_profile_id, p_reaction); $$;
create or replace function public.rpc_record_circle_media_aggregate_event(p_pulse_item_id uuid, p_event text)
returns void language sql security definer set search_path = '' as $$ select private.record_circle_media_aggregate_event(p_pulse_item_id, p_event); $$;
create or replace function public.rpc_submit_circle_media_asset_to_queue(p_asset_id uuid, p_actor_profile_id uuid, p_title text, p_subtitle text default null, p_body text default null)
returns public.circle_media_submissions language sql security definer set search_path = '' as $$ select private.submit_circle_media_asset_to_queue(p_asset_id, p_actor_profile_id, p_title, p_subtitle, p_body); $$;
create or replace function public.rpc_get_circle_media_submission_queue(p_circle_id uuid)
returns table(submission_id uuid, asset_id uuid, title text, subtitle text, body text, status text, submitter_profile_id uuid, submitter_name text, media_type text, poster_object_path text, created_at timestamptz)
language sql security definer set search_path = '' stable as $$ select * from private.get_circle_media_submission_queue(p_circle_id); $$;
create or replace function public.rpc_review_circle_media_submission(p_submission_id uuid, p_actor_profile_id uuid, p_approve boolean)
returns public.circle_media_submissions language sql security definer set search_path = '' as $$ select private.review_circle_media_submission(p_submission_id, p_actor_profile_id, p_approve); $$;
create or replace function public.rpc_get_circle_media_reaction_summaries(p_circle_id uuid, p_actor_profile_id uuid)
returns table(pulse_item_id uuid, reaction text, reaction_count bigint, my_reaction boolean)
language sql security definer set search_path = '' stable as $$ select * from private.get_circle_media_reaction_summaries(p_circle_id, p_actor_profile_id); $$;

revoke all on function public.rpc_get_my_circle_media_saved(uuid, uuid) from public, anon;
revoke all on function public.rpc_toggle_circle_media_saved(uuid, uuid) from public, anon;
revoke all on function public.rpc_toggle_circle_media_reaction(uuid, uuid, text) from public, anon;
revoke all on function public.rpc_record_circle_media_aggregate_event(uuid, text) from public, anon;
revoke all on function public.rpc_submit_circle_media_asset_to_queue(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.rpc_get_circle_media_submission_queue(uuid) from public, anon;
revoke all on function public.rpc_review_circle_media_submission(uuid, uuid, boolean) from public, anon;
revoke all on function public.rpc_get_circle_media_reaction_summaries(uuid, uuid) from public, anon;
grant execute on function public.rpc_get_my_circle_media_saved(uuid, uuid), public.rpc_toggle_circle_media_saved(uuid, uuid), public.rpc_toggle_circle_media_reaction(uuid, uuid, text), public.rpc_record_circle_media_aggregate_event(uuid, text), public.rpc_submit_circle_media_asset_to_queue(uuid, uuid, text, text, text), public.rpc_get_circle_media_submission_queue(uuid), public.rpc_review_circle_media_submission(uuid, uuid, boolean), public.rpc_get_circle_media_reaction_summaries(uuid, uuid) to authenticated, service_role;

commit;
