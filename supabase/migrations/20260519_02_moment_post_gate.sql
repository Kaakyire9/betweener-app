create or replace function public.can_post_moment(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = p_user_id
  ) then
    return true;
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = p_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.swipes s
    where (s.swiper_id = v_profile_id or s.target_id = v_profile_id)
      and s.action in ('LIKE', 'SUPERLIKE')
  )
  or exists (
    select 1
    from public.intent_requests ir
    where (ir.actor_id = v_profile_id or ir.recipient_id = v_profile_id)
      and ir.status in ('pending', 'accepted', 'matched')
  )
  or exists (
    select 1
    from public.profile_signal_gestures psg
    where (psg.sender_profile_id = v_profile_id or psg.receiver_profile_id = v_profile_id)
      and psg.status in ('sent', 'seen')
      and psg.expires_at > timezone('utc'::text, now())
  );
end;
$$;

revoke all on function public.can_post_moment(uuid) from public;
grant execute on function public.can_post_moment(uuid) to authenticated;

create or replace function public.rpc_create_moment(
  p_type text,
  p_text_body text default null,
  p_caption text default null,
  p_visibility text default 'matches',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text := lower(coalesce(trim(p_type), ''));
  v_visibility text := lower(coalesce(trim(p_visibility), 'matches'));
  v_text_body text := nullif(btrim(coalesce(p_text_body, '')), '');
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_moment_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.can_post_moment(v_user_id) then
    raise exception 'moment_signal_required' using errcode = '42501';
  end if;

  if v_type not in ('video', 'photo', 'text') then
    raise exception 'invalid_moment_type';
  end if;

  if v_visibility not in ('public', 'matches', 'vibe_check_approved', 'private') then
    raise exception 'invalid_moment_visibility';
  end if;

  if v_type = 'text' and v_text_body is null then
    raise exception 'invalid_text_body';
  end if;

  insert into public.moments (
    user_id,
    type,
    text_body,
    caption,
    visibility,
    metadata
  )
  values (
    v_user_id,
    v_type,
    case when v_type = 'text' then v_text_body else null end,
    v_caption,
    v_visibility,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_moment_id;

  return v_moment_id;
end;
$$;

revoke all on function public.rpc_create_moment(text, text, text, text, jsonb) from public;
grant execute on function public.rpc_create_moment(text, text, text, text, jsonb) to authenticated;

drop policy if exists "Moments insert own" on public.moments;
create policy "Moments insert own" on public.moments
for insert
with check (
  user_id = auth.uid()
  and public.can_post_moment(auth.uid())
);
