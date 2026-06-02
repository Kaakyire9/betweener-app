create or replace function public.rpc_create_circle_prompt(
  p_circle_id uuid,
  p_title text,
  p_prompt text,
  p_prompt_type text default 'host',
  p_expires_at timestamptz default null
)
returns public.circle_prompts
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_prompt public.circle_prompts%rowtype;
  v_circle public.circles%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_prompt, '')), '');
  v_is_admin boolean := false;
  v_can_publish boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_circle_id is null then
    raise exception 'circle_not_found';
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;

  if v_body is null or char_length(v_body) < 3 or char_length(v_body) > 500 then
    raise exception 'invalid_prompt';
  end if;

  if coalesce(p_prompt_type, 'host') not in ('daily', 'weekly', 'featured', 'host') then
    raise exception 'invalid_prompt_type';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  select *
    into v_circle
  from public.circles c
  where c.id = p_circle_id
    and c.archived_at is null
  limit 1;

  if v_circle.id is null or v_circle.status <> 'approved' then
    raise exception 'circle_not_found';
  end if;

  v_is_admin := public.is_admin_user(v_user_id);
  v_can_publish := v_is_admin
    or public.is_circle_owner(p_circle_id, v_user_id)
    or public.is_circle_host(p_circle_id, v_profile.id);

  if not v_can_publish then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if p_expires_at is not null and p_expires_at <= timezone('utc'::text, now()) then
    raise exception 'invalid_expiry';
  end if;

  insert into public.circle_prompts (
    circle_id,
    title,
    prompt,
    prompt_type,
    status,
    created_by_profile_id,
    created_by_admin_id,
    starts_at,
    expires_at
  )
  values (
    p_circle_id,
    v_title,
    v_body,
    coalesce(p_prompt_type, 'host'),
    'published',
    v_profile.id,
    case when v_is_admin then v_user_id else null end,
    timezone('utc'::text, now()),
    p_expires_at
  )
  returning * into v_prompt;

  return v_prompt;
end;
$$;

grant execute on function public.rpc_create_circle_prompt(uuid, text, text, text, timestamptz) to authenticated;
