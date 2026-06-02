alter table public.circle_pulse_comments
  add column if not exists reaction_count integer not null default 0;

alter table public.circle_pulse_comments
  drop constraint if exists circle_pulse_comments_reaction_count_valid;

alter table public.circle_pulse_comments
  add constraint circle_pulse_comments_reaction_count_valid check (
    reaction_count >= 0
  );

create table if not exists public.circle_pulse_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  comment_id uuid not null references public.circle_pulse_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'heart',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_pulse_comment_reactions_value_valid check (
    reaction in ('heart', 'sparkle', 'support')
  ),
  constraint circle_pulse_comment_reactions_unique_profile unique (
    comment_id,
    profile_id
  )
);

create index if not exists circle_pulse_comment_reactions_item_idx
  on public.circle_pulse_comment_reactions (pulse_item_id, comment_id);

create index if not exists circle_pulse_comment_reactions_profile_idx
  on public.circle_pulse_comment_reactions (profile_id, created_at desc);

drop trigger if exists circle_pulse_comment_reactions_set_updated_at on public.circle_pulse_comment_reactions;
create trigger circle_pulse_comment_reactions_set_updated_at
before update on public.circle_pulse_comment_reactions
for each row execute function public.set_updated_at();

alter table public.circle_pulse_comment_reactions enable row level security;
revoke all on public.circle_pulse_comment_reactions from anon, authenticated;

create or replace function public.rpc_get_circle_pulse_comment_reactions(
  p_pulse_item_id uuid
)
returns table (
  comment_id uuid,
  reaction_count integer,
  my_reaction text
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
  select
    cpc.id,
    count(cpcr.id)::integer as reaction_count,
    max(cpcr.reaction) filter (where cpcr.profile_id = v_profile_id) as my_reaction
  from public.circle_pulse_comments cpc
  left join public.circle_pulse_comment_reactions cpcr
    on cpcr.comment_id = cpc.id
  where cpc.pulse_item_id = p_pulse_item_id
    and cpc.status = 'active'
  group by cpc.id;
end;
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

  if v_reaction is null or v_reaction not in ('heart', 'sparkle', 'support') then
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

revoke all on function public.rpc_get_circle_pulse_comment_reactions(uuid) from public;
revoke all on function public.rpc_toggle_circle_pulse_comment_reaction(uuid, uuid, text) from public;

grant execute on function public.rpc_get_circle_pulse_comment_reactions(uuid) to authenticated;
grant execute on function public.rpc_toggle_circle_pulse_comment_reaction(uuid, uuid, text) to authenticated;
