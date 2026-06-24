-- Add one-level reply support for Moments comments.
-- Keep the existing create RPC contract callable while extending it with
-- an optional parent comment id for richer discussion threads.

alter table public.moment_comments
  add column if not exists parent_comment_id uuid references public.moment_comments(id) on delete cascade;

alter table public.moment_comments
  drop constraint if exists moment_comments_parent_comment_self_check;

alter table public.moment_comments
  add constraint moment_comments_parent_comment_self_check
  check (parent_comment_id is null or parent_comment_id <> id);

create index if not exists idx_moment_comments_parent_comment_id
  on public.moment_comments (parent_comment_id, created_at desc);

drop function if exists public.rpc_create_moment_comment(uuid, text, uuid);

create or replace function public.rpc_create_moment_comment(
  p_moment_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
)
returns public.moment_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_comment public.moment_comments;
  v_parent_comment public.moment_comments;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_moment_id is null or v_body is null then
    return null;
  end if;

  if not public.can_view_moment(p_moment_id) then
    return null;
  end if;

  if p_parent_comment_id is not null then
    select *
      into v_parent_comment
    from public.moment_comments
    where id = p_parent_comment_id
      and moment_id = p_moment_id
      and is_deleted = false;

    if not found then
      raise exception 'invalid_parent_comment' using errcode = 'P0001';
    end if;

    if v_parent_comment.parent_comment_id is not null then
      raise exception 'nested_replies_not_allowed' using errcode = 'P0001';
    end if;
  end if;

  insert into public.moment_comments (
    moment_id,
    user_id,
    body,
    parent_comment_id
  )
  values (
    p_moment_id,
    v_user_id,
    v_body,
    p_parent_comment_id
  )
  returning * into v_comment;

  return v_comment;
end;
$$;

create or replace function public.rpc_create_moment_comment(
  p_moment_id uuid,
  p_body text
)
returns public.moment_comments
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.rpc_create_moment_comment(
    p_moment_id,
    p_body,
    null
  );
end;
$$;

create or replace function public.rpc_delete_moment_comment(
  p_comment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.moment_comments;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_comment_id is null then
    return false;
  end if;

  update public.moment_comments
  set is_deleted = true
  where id = p_comment_id
    and user_id = v_user_id
    and is_deleted = false
  returning * into v_comment;

  if not found then
    return false;
  end if;

  update public.moment_comments
  set is_deleted = true
  where parent_comment_id = v_comment.id
    and is_deleted = false;

  return true;
end;
$$;

revoke all on function public.rpc_create_moment_comment(uuid, text) from public;
revoke all on function public.rpc_create_moment_comment(uuid, text, uuid) from public;
revoke all on function public.rpc_delete_moment_comment(uuid) from public;

grant execute on function public.rpc_create_moment_comment(uuid, text) to authenticated;
grant execute on function public.rpc_create_moment_comment(uuid, text, uuid) to authenticated;
grant execute on function public.rpc_delete_moment_comment(uuid) to authenticated;
