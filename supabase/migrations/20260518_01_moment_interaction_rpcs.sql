-- Route Moment reactions/comments through explicit RPCs.
-- This avoids fragile client-side direct writes during offline replay and
-- derives the acting user from auth.uid() on the server.

create or replace function public.rpc_sync_moment_reaction(
  p_moment_id uuid,
  p_emoji text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_moment_id is null then
    return false;
  end if;

  if not public.can_view_moment(p_moment_id) then
    return false;
  end if;

  if v_emoji is null then
    delete from public.moment_reactions
    where moment_id = p_moment_id
      and user_id = v_user_id;
    return true;
  end if;

  insert into public.moment_reactions (moment_id, user_id, emoji)
  values (p_moment_id, v_user_id, v_emoji)
  on conflict (moment_id, user_id)
  do update set emoji = excluded.emoji;

  return true;
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
declare
  v_user_id uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_comment public.moment_comments;
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

  insert into public.moment_comments (moment_id, user_id, body)
  values (p_moment_id, v_user_id, v_body)
  returning * into v_comment;

  return v_comment;
end;
$$;
