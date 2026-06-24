create or replace function public.rpc_create_profile_boost_v2(
  p_boost_type text default 'manual',
  p_audience_mode text default 'for_you',
  p_focus_mode text default 'profile',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_plan public.subscription_type := 'FREE';
  viewer_profile_id uuid;
  active_boost_ends_at timestamptz;
  boost_type_norm text := coalesce(nullif(lower(btrim(coalesce(p_boost_type, ''))), ''), 'manual');
  audience_mode_norm text := coalesce(nullif(lower(btrim(coalesce(p_audience_mode, ''))), ''), 'for_you');
  focus_mode_norm text := coalesce(nullif(lower(btrim(coalesce(p_focus_mode, ''))), ''), 'profile');
  include_sandbox_preview boolean := false;
  cleaned_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  created_boost record;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  begin
    include_sandbox_preview := coalesce((coalesce(p_metadata, '{}'::jsonb) ->> 'include_sandbox_preview')::boolean, false);
  exception
    when others then
      include_sandbox_preview := false;
  end;

  include_sandbox_preview := include_sandbox_preview and public.is_admin_user(auth.uid());
  cleaned_metadata := cleaned_metadata - 'include_sandbox_preview';

  resolved_plan := public.get_subscription_badge_plan(
    auth.uid(),
    include_sandbox_preview
  );
  if resolved_plan not in ('SILVER', 'GOLD') then
    raise exception 'premium subscription required';
  end if;

  if boost_type_norm not in ('manual', 'smart') then
    raise exception 'invalid boost type';
  end if;

  if audience_mode_norm not in ('for_you', 'nearby', 'active_now', 'intent_match', 'second_look') then
    raise exception 'invalid audience mode';
  end if;

  if focus_mode_norm not in ('profile', 'intro', 'intent') then
    raise exception 'invalid focus mode';
  end if;

  if resolved_plan = 'SILVER' then
    boost_type_norm := 'manual';
    if audience_mode_norm not in ('for_you', 'nearby') then
      audience_mode_norm := 'for_you';
    end if;
    focus_mode_norm := 'profile';
  end if;

  select p.id
    into viewer_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if viewer_profile_id is null then
    raise exception 'profile required';
  end if;

  select max(pb.ends_at)
    into active_boost_ends_at
  from public.profile_boosts pb
  where pb.user_id = viewer_profile_id
    and pb.starts_at <= timezone('utc'::text, now())
    and pb.ends_at > timezone('utc'::text, now());

  if active_boost_ends_at is not null then
    raise exception 'boost already active';
  end if;

  insert into public.profile_boosts (
    user_id,
    starts_at,
    ends_at,
    boost_type,
    audience_mode,
    focus_mode,
    status,
    metadata
  )
  values (
    viewer_profile_id,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()) + interval '30 minutes',
    boost_type_norm,
    audience_mode_norm,
    focus_mode_norm,
    'active',
    jsonb_strip_nulls(cleaned_metadata || jsonb_build_object(
      'creator_plan', resolved_plan,
      'source', 'app_v2',
      'sandbox_preview', include_sandbox_preview
    ))
  )
  returning
    id,
    starts_at,
    ends_at,
    boost_type,
    audience_mode,
    focus_mode,
    status
    into created_boost;

  return jsonb_build_object(
    'plan', resolved_plan,
    'profile_id', viewer_profile_id,
    'id', created_boost.id,
    'starts_at', created_boost.starts_at,
    'ends_at', created_boost.ends_at,
    'boost_type', created_boost.boost_type,
    'audience_mode', created_boost.audience_mode,
    'focus_mode', created_boost.focus_mode,
    'status', created_boost.status
  );
end;
$$;

