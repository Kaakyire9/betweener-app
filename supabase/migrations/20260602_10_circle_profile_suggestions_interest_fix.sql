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
        + case when nullif(btrim(coalesce(candidate.looking_for, '')), '') is not null
                  and candidate.looking_for = viewer.looking_for then 14 else 0 end
      )::integer as score,
      concat_ws(
        ' - ',
        'Shared Circle',
        case when interest_overlap.has_shared_interests then 'Shared interests' end,
        case when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
                  and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 'Location context' end,
        case when nullif(btrim(coalesce(candidate.looking_for, '')), '') is not null
                  and candidate.looking_for = viewer.looking_for then 'Intent aligned' end
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

revoke all on function public.rpc_get_circle_profile_suggestions(uuid, integer) from public;
grant execute on function public.rpc_get_circle_profile_suggestions(uuid, integer) to authenticated;
