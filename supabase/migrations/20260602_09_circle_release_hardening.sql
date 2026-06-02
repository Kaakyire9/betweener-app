create or replace function public.rpc_update_circle_image(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_image_path text
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_circle public.circles%rowtype;
  v_image_path text := nullif(btrim(coalesce(p_image_path, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_image_path is null or split_part(v_image_path, '/', 1) <> p_circle_id::text then
    raise exception 'invalid_circle_image_path';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.circles circle_row
  set image_path = v_image_path,
      image_updated_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where circle_row.id = p_circle_id
    and (
      circle_row.created_by_profile_id = p_actor_profile_id
      or public.is_admin_user(auth.uid())
    )
  returning circle_row.* into v_circle;

  if v_circle.id is null then
    raise exception 'circle_creator_required' using errcode = '42501';
  end if;

  return v_circle;
end;
$$;

create or replace function public.rpc_update_circle_name(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_name text
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_circle public.circles%rowtype;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 3 and 80 then
    raise exception 'invalid_name';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.circles circle_row
  set name = v_name,
      updated_at = timezone('utc'::text, now())
  where circle_row.id = p_circle_id
    and (
      circle_row.created_by_profile_id = p_actor_profile_id
      or public.is_admin_user(auth.uid())
    )
  returning circle_row.* into v_circle;

  if v_circle.id is null then
    raise exception 'circle_creator_required' using errcode = '42501';
  end if;

  return v_circle;
end;
$$;

create or replace function public.rpc_get_circle_profile_suggestions(
  p_profile_id uuid,
  p_limit integer default 8
)
returns table (
  profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  circle_id uuid,
  circle_name text,
  reason text,
  score integer
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles viewer_profile
    where viewer_profile.id = p_profile_id
      and viewer_profile.user_id = auth.uid()
      and viewer_profile.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  with viewer as (
    select viewer_profile.*
    from public.profiles viewer_profile
    where viewer_profile.id = p_profile_id
  ),
  viewer_circles as (
    select member.circle_id
    from public.circle_members member
    where member.profile_id = p_profile_id
      and member.status = 'active'
      and member.is_visible is not false
  ),
  candidate_context as (
    select
      candidate.id as profile_id,
      candidate.full_name,
      candidate.age,
      candidate.avatar_url,
      circle_row.id as circle_id,
      circle_row.name as circle_name,
      (
        100
        + case when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
                  and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 18 else 0 end
        + case when nullif(btrim(coalesce(candidate.city, '')), '') is not null
                  and lower(candidate.city) = lower(viewer.city) then 12 else 0 end
        + case when interest_overlap.has_shared_interests then 20 else 0 end
        + case when nullif(btrim(coalesce(candidate.relationship_intent, '')), '') is not null
                  and candidate.relationship_intent = viewer.relationship_intent then 14 else 0 end
      )::integer as score,
      concat_ws(
        ' - ',
        'Shared Circle',
        case when interest_overlap.has_shared_interests then 'Shared interests' end,
        case when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
                  and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 'Location context' end,
        case when nullif(btrim(coalesce(candidate.relationship_intent, '')), '') is not null
                  and candidate.relationship_intent = viewer.relationship_intent then 'Intent aligned' end
      ) as reason
    from viewer
    join viewer_circles viewer_circle on true
    join public.circle_members member
      on member.circle_id = viewer_circle.circle_id
     and member.status = 'active'
     and member.is_visible is not false
     and member.profile_id <> p_profile_id
    join public.profiles candidate
      on candidate.id = member.profile_id
     and candidate.deleted_at is null
     and coalesce(candidate.is_active, true)
     and coalesce(candidate.matchmaking_mode, false) = false
     and candidate.user_id is not null
    join public.circles circle_row on circle_row.id = member.circle_id
    left join lateral (
      select exists (
        select 1
        from public.profile_interests candidate_interest
        join public.profile_interests viewer_interest
          on viewer_interest.interest_id = candidate_interest.interest_id
        where candidate_interest.profile_id = candidate.id
          and viewer_interest.profile_id = viewer.id
      ) as has_shared_interests
    ) interest_overlap on true
    where not exists (
      select 1
      from public.blocks block_row
      where (block_row.blocker_id = viewer.user_id and block_row.blocked_id = candidate.user_id)
         or (block_row.blocker_id = candidate.user_id and block_row.blocked_id = viewer.user_id)
    )
  ),
  ranked as (
    select distinct on (context.profile_id)
      context.*
    from candidate_context context
    order by context.profile_id, context.score desc, context.circle_name
  )
  select
    ranked.profile_id,
    coalesce(nullif(btrim(ranked.full_name), ''), 'Circle member'),
    ranked.age,
    ranked.avatar_url,
    ranked.circle_id,
    ranked.circle_name,
    ranked.reason,
    ranked.score
  from ranked
  order by ranked.score desc, ranked.full_name nulls last, ranked.profile_id
  limit greatest(1, least(coalesce(p_limit, 8), 24));
end;
$$;

create or replace function public.rpc_create_circle_relationship_gist(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_title text,
  p_short_body text,
  p_body text,
  p_perspective text default 'general'
)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gist public.relationship_gists%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_short_body text := nullif(btrim(coalesce(p_short_body, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_title is null or char_length(v_title) not between 3 and 140 then
    raise exception 'gist_title_invalid';
  end if;

  if v_body is null or char_length(v_body) not between 20 and 5000 then
    raise exception 'gist_body_invalid';
  end if;

  if v_perspective not in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication') then
    raise exception 'gist_perspective_invalid';
  end if;

  insert into public.relationship_gists (
    circle_id,
    title,
    short_body,
    body,
    perspective,
    status,
    created_by_profile_id,
    created_by_admin_id,
    published_at
  )
  values (
    p_circle_id,
    v_title,
    v_short_body,
    v_body,
    v_perspective,
    'published',
    p_actor_profile_id,
    auth.uid(),
    timezone('utc'::text, now())
  )
  returning * into v_gist;

  return v_gist;
end;
$$;

revoke all on function public.rpc_update_circle_image(uuid, uuid, text) from public;
revoke all on function public.rpc_update_circle_name(uuid, uuid, text) from public;
revoke all on function public.rpc_get_circle_profile_suggestions(uuid, integer) from public;
revoke all on function public.rpc_create_circle_relationship_gist(uuid, uuid, text, text, text, text) from public;

grant execute on function public.rpc_update_circle_image(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_update_circle_name(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_get_circle_profile_suggestions(uuid, integer) to authenticated;
grant execute on function public.rpc_create_circle_relationship_gist(uuid, uuid, text, text, text, text) to authenticated;
