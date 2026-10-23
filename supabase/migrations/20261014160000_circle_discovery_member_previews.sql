-- Provide privacy-safe social proof for Circle discovery cards and keep the
-- denormalized Circle member count correct across every membership write path.

create or replace function public.rpc_list_circle_member_previews_v1(
  p_circle_ids uuid[],
  p_per_circle_limit integer default 3
)
returns table(
  circle_id uuid,
  profile_id uuid,
  full_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with viewer as (
    select profile.id as profile_id, profile.user_id
    from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.deleted_at is null
      and profile.account_state = 'active'
      and coalesce(profile.is_active, true)
    limit 1
  ),
  requested_circles as (
    select distinct requested.circle_id
    from unnest(coalesce(p_circle_ids, array[]::uuid[])) as requested(circle_id)
    where requested.circle_id is not null
    limit 48
  ),
  eligible_circles as (
    select circle.id
    from requested_circles requested
    join public.circles circle on circle.id = requested.circle_id
    join viewer on true
    where circle.status = 'approved'
      and circle.archived_at is null
      and (
        public.is_circle_member(circle.id, viewer.user_id)
        or public.is_circle_owner(circle.id, viewer.user_id)
        or (
          coalesce(circle.access_policy, 'open') <> 'invite_only'
          and coalesce(circle.visibility, 'public') <> 'private'
          and coalesce(circle.visibility_scope, 'global') <> 'invite_only'
        )
      )
  ),
  candidate_members as (
    select
      member.circle_id,
      profile.id as profile_id,
      profile.full_name,
      coalesce(
        nullif(btrim(profile.avatar_url), ''),
        nullif(btrim(profile.hero_image_url), ''),
        (
          select nullif(btrim(photo.value), '')
          from unnest(coalesce(profile.photos, array[]::text[])) with ordinality as photo(value, position)
          where nullif(btrim(photo.value), '') is not null
          order by photo.position
          limit 1
        )
      ) as avatar_url,
      member.joined_at,
      member.id as membership_id
    from eligible_circles eligible
    join public.circle_members member on member.circle_id = eligible.id
    join public.profiles profile on profile.id = member.profile_id
    join viewer on true
    where member.status = 'active'
      and member.is_visible is not false
      and profile.deleted_at is null
      and profile.account_state = 'active'
      and coalesce(profile.is_active, true)
      and profile.user_id is not null
      and not exists (
        select 1
        from public.blocks blocked
        where (blocked.blocker_id = viewer.user_id and blocked.blocked_id = profile.user_id)
           or (blocked.blocker_id = profile.user_id and blocked.blocked_id = viewer.user_id)
      )
  ),
  visible_members as (
    select
      candidate.circle_id,
      candidate.profile_id,
      candidate.full_name,
      candidate.avatar_url,
      row_number() over (
        partition by candidate.circle_id
        order by candidate.joined_at desc nulls last, candidate.membership_id
      ) as preview_rank
    from candidate_members candidate
    where candidate.avatar_url is not null
  )
  select
    visible.circle_id,
    visible.profile_id,
    visible.full_name,
    visible.avatar_url
  from visible_members visible
  where visible.preview_rank <= least(greatest(coalesce(p_per_circle_limit, 3), 1), 3)
  order by visible.circle_id, visible.preview_rank;
$$;

revoke all on function public.rpc_list_circle_member_previews_v1(uuid[], integer)
from public, anon;
grant execute on function public.rpc_list_circle_member_previews_v1(uuid[], integer)
to authenticated, service_role;

comment on function public.rpc_list_circle_member_previews_v1(uuid[], integer) is
  'Returns at most three visible, active, non-blocked member portraits per accessible Circle. Private Circle portraits remain member-only.';

create or replace function public.sync_circle_member_count_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_circle_id uuid;
  v_circle_ids uuid[];
  v_member_count integer;
begin
  if tg_op = 'INSERT' then
    v_circle_ids := array[new.circle_id];
  elsif tg_op = 'DELETE' then
    v_circle_ids := array[old.circle_id];
  else
    select array_agg(distinct candidate.circle_id order by candidate.circle_id)
    into v_circle_ids
    from unnest(array[old.circle_id, new.circle_id]) as candidate(circle_id)
    where candidate.circle_id is not null;
  end if;

  foreach v_circle_id in array v_circle_ids loop
    perform pg_advisory_xact_lock(hashtextextended('circle-member-count:' || v_circle_id::text, 0));

    select count(*)::integer
    into v_member_count
    from public.circle_members member
    where member.circle_id = v_circle_id
      and member.status = 'active';

    update public.circles circle
    set member_count = v_member_count
    where circle.id = v_circle_id
      and circle.member_count is distinct from v_member_count;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_circle_member_count_v1()
from public, anon, authenticated, service_role;

drop trigger if exists circle_members_sync_member_count_insert_delete on public.circle_members;
create trigger circle_members_sync_member_count_insert_delete
after insert or delete on public.circle_members
for each row execute function public.sync_circle_member_count_v1();

drop trigger if exists circle_members_sync_member_count_update on public.circle_members;
create trigger circle_members_sync_member_count_update
after update of circle_id, status on public.circle_members
for each row
when (old.circle_id is distinct from new.circle_id or old.status is distinct from new.status)
execute function public.sync_circle_member_count_v1();

with current_counts as (
  select
    circle.id as circle_id,
    count(member.id) filter (where member.status = 'active')::integer as member_count
  from public.circles circle
  left join public.circle_members member on member.circle_id = circle.id
  group by circle.id
)
update public.circles circle
set member_count = counts.member_count
from current_counts counts
where circle.id = counts.circle_id
  and circle.member_count is distinct from counts.member_count;
