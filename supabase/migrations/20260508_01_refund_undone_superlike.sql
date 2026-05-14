create or replace function public.rpc_refund_undone_superlike(
  p_profile_id uuid,
  p_target_profile_id uuid,
  p_window_seconds integer default 300
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_profile_id uuid;
  v_deleted_swipe_id uuid;
  v_new_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.id = p_profile_id
    and p.user_id = v_user_id
  limit 1;

  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  delete from public.swipes s
  where s.swiper_id = v_profile_id
    and s.target_id = p_target_profile_id
    and s.action = 'SUPERLIKE'
    and s.created_at >= now() - make_interval(secs => greatest(30, least(coalesce(p_window_seconds, 300), 900)))
  returning s.id into v_deleted_swipe_id;

  if v_deleted_swipe_id is null then
    raise exception 'SUPERLIKE_NOT_REFUNDABLE';
  end if;

  update public.profiles
  set superlikes_left = superlikes_left + 1,
      updated_at = now()
  where id = v_profile_id
  returning superlikes_left into v_new_count;

  return v_new_count;
end;
$$;

grant execute on function public.rpc_refund_undone_superlike(uuid, uuid, integer) to authenticated;
