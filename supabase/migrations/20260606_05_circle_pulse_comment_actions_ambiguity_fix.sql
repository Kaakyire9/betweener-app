create or replace function public.rpc_update_circle_pulse_comment(
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

create or replace function public.rpc_pin_circle_pulse_comment(
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

revoke all on function public.rpc_update_circle_pulse_comment(uuid, uuid, text) from public;
revoke all on function public.rpc_pin_circle_pulse_comment(uuid, uuid, boolean) from public;

grant execute on function public.rpc_update_circle_pulse_comment(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_pin_circle_pulse_comment(uuid, uuid, boolean) to authenticated;
