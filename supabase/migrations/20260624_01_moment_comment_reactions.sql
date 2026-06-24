-- Add reactions for Moment comments with the same authenticated RPC pattern
-- used by the existing Moment reaction and comment flows.

create table if not exists public.moment_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.moment_comments(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  constraint moment_comment_reactions_value_valid check (
    reaction in ('heart', 'laugh', 'love', 'fire', 'clap')
  ),
  constraint moment_comment_reactions_unique_user unique (comment_id, user_id)
);

create index if not exists idx_moment_comment_reactions_comment_id
  on public.moment_comment_reactions (comment_id);

create index if not exists idx_moment_comment_reactions_moment_id
  on public.moment_comment_reactions (moment_id);

alter table public.moment_comment_reactions enable row level security;

drop policy if exists "Moment comment reactions select visible" on public.moment_comment_reactions;
create policy "Moment comment reactions select visible" on public.moment_comment_reactions
for select using (
  exists (
    select 1
    from public.moment_comments mc
    where mc.id = comment_id
      and mc.is_deleted = false
      and public.can_view_moment(mc.moment_id)
  )
);

drop policy if exists "Moment comment reactions insert own" on public.moment_comment_reactions;
create policy "Moment comment reactions insert own" on public.moment_comment_reactions
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.moment_comments mc
    where mc.id = comment_id
      and mc.is_deleted = false
      and mc.moment_id = moment_id
      and public.can_view_moment(mc.moment_id)
  )
);

drop policy if exists "Moment comment reactions update own" on public.moment_comment_reactions;
create policy "Moment comment reactions update own" on public.moment_comment_reactions
for update using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.moment_comments mc
    where mc.id = comment_id
      and mc.is_deleted = false
      and public.can_view_moment(mc.moment_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.moment_comments mc
    where mc.id = comment_id
      and mc.is_deleted = false
      and mc.moment_id = moment_id
      and public.can_view_moment(mc.moment_id)
  )
);

drop policy if exists "Moment comment reactions delete own" on public.moment_comment_reactions;
create policy "Moment comment reactions delete own" on public.moment_comment_reactions
for delete using (user_id = auth.uid());

create or replace function public.rpc_sync_moment_comment_reaction(
  p_comment_id uuid,
  p_reaction text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.moment_comments;
  v_reaction text := lower(nullif(btrim(coalesce(p_reaction, '')), ''));
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_comment_id is null then
    return false;
  end if;

  select *
    into v_comment
  from public.moment_comments
  where id = p_comment_id
    and is_deleted = false;

  if v_comment.id is null then
    return false;
  end if;

  if not public.can_view_moment(v_comment.moment_id) then
    return false;
  end if;

  if v_reaction is null then
    delete from public.moment_comment_reactions
    where comment_id = p_comment_id
      and user_id = v_user_id;
    return true;
  end if;

  if v_reaction not in ('heart', 'laugh', 'love', 'fire', 'clap') then
    raise exception 'invalid_reaction';
  end if;

  insert into public.moment_comment_reactions (
    comment_id,
    moment_id,
    user_id,
    reaction
  )
  values (
    v_comment.id,
    v_comment.moment_id,
    v_user_id,
    v_reaction
  )
  on conflict (comment_id, user_id)
  do update set
    reaction = excluded.reaction,
    created_at = now();

  return true;
end;
$$;

alter table public.moment_comment_reactions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_comment_reactions'
  ) then
    alter publication supabase_realtime add table public.moment_comment_reactions;
  end if;
end;
$$;

revoke all on function public.rpc_sync_moment_comment_reaction(uuid, text) from public;
grant execute on function public.rpc_sync_moment_comment_reaction(uuid, text) to authenticated;
