create or replace function public.rpc_get_circle_pulse_item_snapshot(
  p_item_id uuid
)
returns table (
  id uuid,
  circle_id uuid,
  item_type text,
  title text,
  subtitle text,
  body text,
  image_url text,
  media_url text,
  media_type text,
  prompt_id uuid,
  gathering_id uuid,
  moment_id uuid,
  love_seat_id uuid,
  featured_profile_id uuid,
  featured_profile_name text,
  featured_profile_age integer,
  featured_profile_avatar_url text,
  featured_profile_location text,
  featured_profile_badge text,
  love_seat_quote text,
  welcome_profiles jsonb,
  status text,
  priority integer,
  starts_at timestamptz,
  expires_at timestamptz,
  comment_count integer,
  discussion_cta text,
  discussion_summary text,
  gathering_starts_at timestamptz,
  gathering_city text,
  gathering_type text,
  gathering_presentation_mode text,
  gathering_seat_context text,
  gathering_host_created_for_member boolean,
  gathering_is_partner_venue boolean,
  gathering_safe_first_date_space boolean,
  gathering_attendee_count integer,
  source_available boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_item_id
  limit 1;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  return query
  select *
  from public.rpc_get_circle_pulse_items(v_circle_id, false)
  where rpc_get_circle_pulse_items.id = p_item_id
  limit 1;
end;
$$;

revoke all on function public.rpc_get_circle_pulse_item_snapshot(uuid) from public;
grant execute on function public.rpc_get_circle_pulse_item_snapshot(uuid) to authenticated;
