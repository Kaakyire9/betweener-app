-- Add explicit update/delete RPCs for Moment comments.
-- Keeps online and offline mutation paths on the same server contract.

create or replace function public.rpc_update_moment_comment(
  p_comment_id uuid,
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

  if p_comment_id is null or v_body is null then
    return null;
  end if;

  update public.moment_comments
  set body = v_body
  where id = p_comment_id
    and user_id = v_user_id
    and is_deleted = false
  returning * into v_comment;

  return v_comment;
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
    and is_deleted = false;

  return found;
end;
$$;
