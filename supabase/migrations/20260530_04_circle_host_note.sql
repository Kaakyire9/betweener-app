alter table public.circles
  add column if not exists host_note text,
  add column if not exists host_note_updated_at timestamptz,
  add column if not exists host_note_updated_by_profile_id uuid references public.profiles(id) on delete set null;

create or replace function public.rpc_set_circle_host_note(
  p_circle_id uuid,
  p_profile_id uuid,
  p_note text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
  v_circle public.circles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_is_circle_owner := public.is_circle_owner(p_circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'host_required' using errcode = '42501';
    end if;
  end if;

  update public.circles
  set host_note = nullif(btrim(coalesce(p_note, '')), ''),
      host_note_updated_at = timezone('utc'::text, now()),
      host_note_updated_by_profile_id = p_profile_id,
      updated_at = timezone('utc'::text, now())
  where id = p_circle_id
    and archived_at is null
  returning * into v_circle;

  if v_circle.id is null then
    raise exception 'circle_not_found';
  end if;

  return v_circle;
end;
$$;

grant execute on function public.rpc_set_circle_host_note(uuid, uuid, text) to authenticated;
