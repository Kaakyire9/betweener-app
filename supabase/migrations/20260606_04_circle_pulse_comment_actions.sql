alter table public.circle_pulse_comments
  add column if not exists edited_at timestamptz,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists pinned_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists circle_pulse_comments_item_pinned_idx
  on public.circle_pulse_comments (pulse_item_id, pinned_at desc)
  where pinned_at is not null;

create table if not exists public.circle_pulse_comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.circle_pulse_comments(id) on delete cascade,
  editor_profile_id uuid not null references public.profiles(id) on delete cascade,
  editor_user_id uuid not null references auth.users(id) on delete cascade,
  previous_body text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_pulse_comment_edits_previous_body_length check (
    char_length(btrim(previous_body)) between 1 and 500
  )
);

create index if not exists circle_pulse_comment_edits_comment_idx
  on public.circle_pulse_comment_edits (comment_id, created_at desc);

alter table public.circle_pulse_comment_reactions
  drop constraint if exists circle_pulse_comment_reactions_value_valid;

alter table public.circle_pulse_comment_reactions
  add constraint circle_pulse_comment_reactions_value_valid check (
    reaction in ('heart', 'laugh', 'love', 'thumbs_up', 'fire', 'clap')
  );

alter table public.circle_pulse_comments replica identity full;
alter table public.circle_pulse_comment_reactions replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'circle_pulse_comments'
    ) then
      alter publication supabase_realtime add table public.circle_pulse_comments;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'circle_pulse_comment_reactions'
    ) then
      alter publication supabase_realtime add table public.circle_pulse_comment_reactions;
    end if;
  end if;
end;
$$;

create or replace function public.circle_pulse_comment_reaction_summary_json(
  p_comment_id uuid
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'reaction', ranked.reaction,
          'count', ranked.reaction_count
        )
        order by ranked.reaction_count desc, ranked.sort_order asc
      )
      from (
        select
          cpcr.reaction,
          count(*)::integer as reaction_count,
          case cpcr.reaction
            when 'heart' then 1
            when 'laugh' then 2
            when 'love' then 3
            when 'thumbs_up' then 4
            when 'fire' then 5
            when 'clap' then 6
            else 99
          end as sort_order
        from public.circle_pulse_comment_reactions cpcr
        where cpcr.comment_id = p_comment_id
        group by cpcr.reaction
      ) ranked
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.get_circle_pulse_comment_projection(
  p_comment_id uuid,
  p_viewer_user_id uuid,
  p_viewer_profile_id uuid
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  is_own boolean,
  can_remove boolean,
  can_edit boolean,
  can_pin boolean,
  pinned_at timestamptz,
  report_count integer,
  reaction_count integer,
  my_reaction text,
  reply_preview_profile_id uuid,
  reply_preview_display_name text,
  reply_preview_body text,
  reaction_summary jsonb
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select
    cpc.id,
    cpc.pulse_item_id,
    cpc.circle_id,
    cpc.profile_id,
    coalesce(nullif(btrim(author_profile.full_name), ''), 'Member') as display_name,
    author_profile.avatar_url,
    cpc.body,
    cpc.parent_comment_id,
    cpc.created_at,
    cpc.updated_at,
    cpc.edited_at,
    cpc.user_id = p_viewer_user_id as is_own,
    (
      cpc.user_id = p_viewer_user_id
      or public.can_manage_circle_pulse(cpc.circle_id, p_viewer_user_id)
    ) as can_remove,
    cpc.user_id = p_viewer_user_id as can_edit,
    public.can_manage_circle_pulse(cpc.circle_id, p_viewer_user_id) as can_pin,
    cpc.pinned_at,
    cpc.report_count,
    cpc.reaction_count,
    viewer_reaction.reaction as my_reaction,
    parent_comment.profile_id as reply_preview_profile_id,
    coalesce(nullif(btrim(parent_profile.full_name), ''), 'Member') as reply_preview_display_name,
    parent_comment.body as reply_preview_body,
    public.circle_pulse_comment_reaction_summary_json(cpc.id) as reaction_summary
  from public.circle_pulse_comments cpc
  join public.profiles author_profile
    on author_profile.id = cpc.profile_id
  left join public.circle_pulse_comment_reactions viewer_reaction
    on viewer_reaction.comment_id = cpc.id
   and viewer_reaction.profile_id = p_viewer_profile_id
  left join public.circle_pulse_comments parent_comment
    on parent_comment.id = cpc.parent_comment_id
   and parent_comment.status = 'active'
  left join public.profiles parent_profile
    on parent_profile.id = parent_comment.profile_id
  where cpc.id = p_comment_id
    and cpc.status = 'active';
$$;

create or replace function public.rpc_toggle_circle_pulse_comment_reaction(
  p_comment_id uuid,
  p_profile_id uuid,
  p_reaction text default 'heart'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_reaction text := lower(nullif(btrim(coalesce(p_reaction, '')), ''));
  v_existing_reaction text;
  v_reacted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_reaction is null or v_reaction not in ('heart', 'laugh', 'love', 'thumbs_up', 'fire', 'clap') then
    raise exception 'invalid_reaction';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
    and cpc.status = 'active'
  for update;

  if v_comment.id is null then
    raise exception 'comment_not_found';
  end if;

  if not public.is_circle_member(v_comment.circle_id, auth.uid())
    and not public.is_circle_owner(v_comment.circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  select cpcr.reaction
    into v_existing_reaction
  from public.circle_pulse_comment_reactions cpcr
  where cpcr.comment_id = p_comment_id
    and cpcr.profile_id = p_profile_id
  limit 1;

  if v_existing_reaction = v_reaction then
    delete from public.circle_pulse_comment_reactions
    where comment_id = p_comment_id
      and profile_id = p_profile_id;
  else
    insert into public.circle_pulse_comment_reactions (
      circle_id,
      pulse_item_id,
      comment_id,
      profile_id,
      user_id,
      reaction
    )
    values (
      v_comment.circle_id,
      v_comment.pulse_item_id,
      v_comment.id,
      p_profile_id,
      auth.uid(),
      v_reaction
    )
    on conflict (comment_id, profile_id)
    do update set reaction = excluded.reaction;

    v_reacted := true;
  end if;

  update public.circle_pulse_comments cpc
  set reaction_count = (
    select count(*)::integer
    from public.circle_pulse_comment_reactions cpcr
    where cpcr.comment_id = p_comment_id
  )
  where cpc.id = p_comment_id;

  return v_reacted;
end;
$$;

drop function if exists public.rpc_get_circle_pulse_comments_page(uuid, integer, timestamptz, uuid);
drop function if exists public.rpc_get_circle_pulse_comment_snapshot(uuid);
drop function if exists public.rpc_update_circle_pulse_comment(uuid, uuid, text);
drop function if exists public.rpc_pin_circle_pulse_comment(uuid, uuid, boolean);
drop function if exists public.rpc_create_circle_pulse_comment(uuid, uuid, text, uuid);

create function public.rpc_get_circle_pulse_comments_page(
  p_pulse_item_id uuid,
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  is_own boolean,
  can_remove boolean,
  can_edit boolean,
  can_pin boolean,
  pinned_at timestamptz,
  report_count integer,
  reaction_count integer,
  my_reaction text,
  reply_preview_profile_id uuid,
  reply_preview_display_name text,
  reply_preview_body text,
  reaction_summary jsonb
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_pulse_item_id
    and cpi.status = 'active'
    and (cpi.starts_at is null or cpi.starts_at <= timezone('utc'::text, now()))
    and (cpi.expires_at is null or cpi.expires_at > timezone('utc'::text, now()))
  limit 1;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_circle_id, auth.uid())
    and not public.is_circle_member(v_circle_id, auth.uid())
    and not public.is_circle_owner(v_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  return query
  with windowed as (
    select
      cpc.id,
      cpc.created_at
    from public.circle_pulse_comments cpc
    where cpc.pulse_item_id = p_pulse_item_id
      and cpc.status = 'active'
      and (
        p_before_created_at is null
        or cpc.created_at < p_before_created_at
        or (
          p_before_id is not null
          and cpc.created_at = p_before_created_at
          and cpc.id < p_before_id
        )
      )
    order by cpc.created_at desc, cpc.id desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  select
    projection.id,
    projection.pulse_item_id,
    projection.circle_id,
    projection.profile_id,
    projection.display_name,
    projection.avatar_url,
    projection.body,
    projection.parent_comment_id,
    projection.created_at,
    projection.updated_at,
    projection.edited_at,
    projection.is_own,
    projection.can_remove,
    projection.can_edit,
    projection.can_pin,
    projection.pinned_at,
    projection.report_count,
    projection.reaction_count,
    projection.my_reaction,
    projection.reply_preview_profile_id,
    projection.reply_preview_display_name,
    projection.reply_preview_body,
    projection.reaction_summary
  from windowed
  join lateral public.get_circle_pulse_comment_projection(windowed.id, auth.uid(), v_profile_id) projection
    on true
  order by projection.created_at asc, projection.id asc;
end;
$$;

create function public.rpc_get_circle_pulse_comment_snapshot(
  p_comment_id uuid
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  is_own boolean,
  can_remove boolean,
  can_edit boolean,
  can_pin boolean,
  pinned_at timestamptz,
  report_count integer,
  reaction_count integer,
  my_reaction text,
  reply_preview_profile_id uuid,
  reply_preview_display_name text,
  reply_preview_body text,
  reaction_summary jsonb
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
  limit 1;

  if v_comment.id is null or v_comment.status <> 'active' then
    raise exception 'comment_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_comment.circle_id, auth.uid())
    and not public.is_circle_member(v_comment.circle_id, auth.uid())
    and not public.is_circle_owner(v_comment.circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  return query
  select
    projection.id,
    projection.pulse_item_id,
    projection.circle_id,
    projection.profile_id,
    projection.display_name,
    projection.avatar_url,
    projection.body,
    projection.parent_comment_id,
    projection.created_at,
    projection.updated_at,
    projection.edited_at,
    projection.is_own,
    projection.can_remove,
    projection.can_edit,
    projection.can_pin,
    projection.pinned_at,
    projection.report_count,
    projection.reaction_count,
    projection.my_reaction,
    projection.reply_preview_profile_id,
    projection.reply_preview_display_name,
    projection.reply_preview_body,
    projection.reaction_summary
  from public.get_circle_pulse_comment_projection(p_comment_id, auth.uid(), v_profile_id) projection;
end;
$$;

create function public.rpc_update_circle_pulse_comment(
  p_comment_id uuid,
  p_profile_id uuid,
  p_body text
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  is_own boolean,
  can_remove boolean,
  can_edit boolean,
  can_pin boolean,
  pinned_at timestamptz,
  report_count integer,
  reaction_count integer,
  my_reaction text,
  reply_preview_profile_id uuid,
  reply_preview_display_name text,
  reply_preview_body text,
  reaction_summary jsonb
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_body is null or char_length(v_body) > 500 then
    raise exception 'invalid_comment';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
    and cpc.status = 'active'
  for update;

  if v_comment.id is null then
    raise exception 'comment_not_found';
  end if;

  if v_comment.profile_id <> p_profile_id or v_comment.user_id <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_body = v_comment.body then
    return query
    select *
    from public.rpc_get_circle_pulse_comment_snapshot(v_comment.id);
    return;
  end if;

  insert into public.circle_pulse_comment_edits (
    comment_id,
    editor_profile_id,
    editor_user_id,
    previous_body
  )
  values (
    v_comment.id,
    p_profile_id,
    auth.uid(),
    v_comment.body
  );

  update public.circle_pulse_comments as cpc
  set body = v_body,
      edited_at = timezone('utc'::text, now())
  where cpc.id = v_comment.id;

  return query
  select *
  from public.rpc_get_circle_pulse_comment_snapshot(v_comment.id);
end;
$$;

create function public.rpc_pin_circle_pulse_comment(
  p_comment_id uuid,
  p_profile_id uuid,
  p_pinned boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
    and cpc.status = 'active'
  for update;

  if v_comment.id is null then
    raise exception 'comment_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_comment.circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if coalesce(p_pinned, true) then
    update public.circle_pulse_comments as cpc
    set pinned_at = null,
        pinned_by_profile_id = null,
        pinned_by_user_id = null
    where cpc.pulse_item_id = v_comment.pulse_item_id
      and cpc.id <> v_comment.id
      and cpc.pinned_at is not null;

    update public.circle_pulse_comments as cpc
    set pinned_at = v_now,
        pinned_by_profile_id = p_profile_id,
        pinned_by_user_id = auth.uid()
    where cpc.id = v_comment.id;
  else
    update public.circle_pulse_comments as cpc
    set pinned_at = null,
        pinned_by_profile_id = null,
        pinned_by_user_id = null
    where cpc.id = v_comment.id;
  end if;

  return true;
end;
$$;

create or replace function public.rpc_create_circle_pulse_comment(
  p_pulse_item_id uuid,
  p_profile_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  is_own boolean,
  can_remove boolean,
  can_edit boolean,
  can_pin boolean,
  pinned_at timestamptz,
  report_count integer,
  reaction_count integer,
  my_reaction text,
  reply_preview_profile_id uuid,
  reply_preview_display_name text,
  reply_preview_body text,
  reaction_summary jsonb
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_comment public.circle_pulse_comments%rowtype;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_body is null or char_length(v_body) > 500 then
    raise exception 'invalid_comment';
  end if;

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_pulse_item_id
    and cpi.status = 'active'
    and (cpi.starts_at is null or cpi.starts_at <= timezone('utc'::text, now()))
    and (cpi.expires_at is null or cpi.expires_at > timezone('utc'::text, now()))
  limit 1;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  if not public.is_circle_member(v_circle_id, auth.uid())
    and not public.is_circle_owner(v_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1
    from public.circle_pulse_comments cpc
    where cpc.id = p_parent_comment_id
      and cpc.pulse_item_id = p_pulse_item_id
      and cpc.status = 'active'
  ) then
    raise exception 'parent_comment_not_found';
  end if;

  insert into public.circle_pulse_comments (
    circle_id,
    pulse_item_id,
    profile_id,
    user_id,
    body,
    parent_comment_id
  )
  values (
    v_circle_id,
    p_pulse_item_id,
    p_profile_id,
    auth.uid(),
    v_body,
    p_parent_comment_id
  )
  returning * into v_comment;

  return query
  select *
  from public.rpc_get_circle_pulse_comment_snapshot(v_comment.id);
end;
$$;

revoke all on function public.circle_pulse_comment_reaction_summary_json(uuid) from public;
revoke all on function public.get_circle_pulse_comment_projection(uuid, uuid, uuid) from public;
revoke all on function public.rpc_toggle_circle_pulse_comment_reaction(uuid, uuid, text) from public;
revoke all on function public.rpc_get_circle_pulse_comments_page(uuid, integer, timestamptz, uuid) from public;
revoke all on function public.rpc_get_circle_pulse_comment_snapshot(uuid) from public;
revoke all on function public.rpc_update_circle_pulse_comment(uuid, uuid, text) from public;
revoke all on function public.rpc_pin_circle_pulse_comment(uuid, uuid, boolean) from public;
revoke all on function public.rpc_create_circle_pulse_comment(uuid, uuid, text, uuid) from public;

grant execute on function public.circle_pulse_comment_reaction_summary_json(uuid) to authenticated;
grant execute on function public.get_circle_pulse_comment_projection(uuid, uuid, uuid) to authenticated;
grant execute on function public.rpc_toggle_circle_pulse_comment_reaction(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_get_circle_pulse_comments_page(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.rpc_get_circle_pulse_comment_snapshot(uuid) to authenticated;
grant execute on function public.rpc_update_circle_pulse_comment(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_pin_circle_pulse_comment(uuid, uuid, boolean) to authenticated;
grant execute on function public.rpc_create_circle_pulse_comment(uuid, uuid, text, uuid) to authenticated;
