-- Username-aware Circle invitations without changing the legacy 1.1.1 RPC.

begin;

create or replace function public.rpc_search_circle_invite_candidates_v2(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_search text default null,
  p_country text default null,
  p_interest text default null,
  p_min_age integer default null,
  p_max_age integer default null,
  p_limit integer default 24
)
returns table (
  profile_id uuid,
  full_name text,
  username text,
  avatar_url text,
  age integer,
  location text,
  country text,
  interests text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_username_search text := nullif(regexp_replace(
    btrim(coalesce(p_search, '')),
    '^@+',
    ''
  ), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_interest text := nullif(btrim(coalesce(p_interest, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
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

  if not public.can_invite_to_circle(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  select
    candidate.id,
    coalesce(nullif(btrim(candidate.full_name), ''), 'Betweener member'),
    nullif(btrim(candidate.username), ''),
    candidate.avatar_url,
    candidate.age,
    coalesce(
      nullif(btrim(candidate.city), ''),
      nullif(btrim(candidate.region), ''),
      nullif(btrim(candidate.location), '')
    ),
    coalesce(
      nullif(btrim(candidate.current_country), ''),
      nullif(btrim(candidate.current_country_code), '')
    ),
    array(
      select interest_row.name
      from public.profile_interests profile_interest
      join public.interests interest_row on interest_row.id = profile_interest.interest_id
      where profile_interest.profile_id = candidate.id
      order by interest_row.name
      limit 4
    )
  from public.profiles candidate
  where candidate.id <> p_actor_profile_id
    and candidate.deleted_at is null
    and coalesce(candidate.is_active, true)
    and not exists (
      select 1
      from public.circle_members membership
      where membership.circle_id = p_circle_id
        and membership.profile_id = candidate.id
        and membership.status in ('active', 'pending', 'invited')
    )
    and (
      v_search is null
      or concat_ws(
        ' ',
        candidate.full_name,
        candidate.username,
        candidate.city,
        candidate.region,
        candidate.current_country
      ) ilike '%' || v_search || '%'
      or (
        v_username_search is not null
        and candidate.username ilike '%' || v_username_search || '%'
      )
    )
    and (
      v_country is null
      or candidate.current_country ilike '%' || v_country || '%'
      or candidate.current_country_code ilike v_country
    )
    and (p_min_age is null or candidate.age >= p_min_age)
    and (p_max_age is null or candidate.age <= p_max_age)
    and (
      v_interest is null
      or exists (
        select 1
        from public.profile_interests profile_interest
        join public.interests interest_row on interest_row.id = profile_interest.interest_id
        where profile_interest.profile_id = candidate.id
          and interest_row.name ilike '%' || v_interest || '%'
      )
    )
  order by
    case
      when v_username_search is not null
        and lower(candidate.username) = lower(v_username_search) then 0
      when v_username_search is not null
        and candidate.username ilike v_username_search || '%' then 1
      when v_search is not null
        and candidate.full_name ilike v_search || '%' then 2
      else 3
    end,
    candidate.full_name asc nulls last,
    candidate.id
  limit greatest(1, least(coalesce(p_limit, 24), 50));
end;
$$;

revoke all on function public.rpc_search_circle_invite_candidates_v2(
  uuid, uuid, text, text, text, integer, integer, integer
) from public, anon;

grant execute on function public.rpc_search_circle_invite_candidates_v2(
  uuid, uuid, text, text, text, integer, integer, integer
) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
