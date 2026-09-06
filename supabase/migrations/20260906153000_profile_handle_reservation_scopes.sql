-- Expand the protected @handle catalogue without treating culturally common
-- personal names like brand prefixes. Existing owners are grandfathered until
-- they voluntarily rename away from the protected handle.

begin;

set local lock_timeout = '5s';

alter table public.profile_handle_reservations
  add column if not exists match_mode text not null default 'namespace';

alter table public.profile_handle_reservations
  drop constraint if exists profile_handle_reservations_match_mode_check;

alter table public.profile_handle_reservations
  add constraint profile_handle_reservations_match_mode_check
  check (match_mode in ('exact', 'namespace', 'prefix'));

comment on column public.profile_handle_reservations.match_mode is
  'exact protects only the handle and its confusable skeleton; namespace also protects dot/underscore children; prefix protects every continuation.';

insert into public.profile_handle_reservations (
  normalized_username,
  username_skeleton,
  reason,
  match_mode
)
select
  reserved_name,
  public.profile_handle_skeleton(reserved_name),
  reserved_reason,
  reserved_match_mode
from (values
  -- Brand namespace: prevent impersonating continuations and leetspeak.
  ('betweener', 'brand_identity', 'prefix'),
  ('betweenerapp', 'brand_identity', 'prefix'),
  ('getbetweener', 'brand_identity', 'prefix'),
  ('nyansapa', 'brand_identity', 'prefix'),

  -- Staff, trust, system, commercial, and product namespaces.
  ('abuse', 'trust_identity', 'namespace'),
  ('account', 'system_identity', 'namespace'),
  ('accounts', 'system_identity', 'namespace'),
  ('admin', 'staff_identity', 'namespace'),
  ('administrator', 'staff_identity', 'namespace'),
  ('appeal', 'trust_identity', 'namespace'),
  ('appeals', 'trust_identity', 'namespace'),
  ('api', 'system_identity', 'namespace'),
  ('auth', 'system_identity', 'namespace'),
  ('billing', 'commercial_identity', 'namespace'),
  ('circle', 'product_identity', 'namespace'),
  ('circles', 'product_identity', 'namespace'),
  ('dating', 'product_identity', 'namespace'),
  ('discovery', 'product_identity', 'namespace'),
  ('help', 'staff_identity', 'namespace'),
  ('intent', 'product_identity', 'namespace'),
  ('live', 'product_identity', 'namespace'),
  ('moderation', 'staff_identity', 'namespace'),
  ('moderator', 'staff_identity', 'namespace'),
  ('noreply', 'system_identity', 'namespace'),
  ('notifications', 'system_identity', 'namespace'),
  ('official', 'trust_identity', 'namespace'),
  ('payment', 'commercial_identity', 'namespace'),
  ('payments', 'commercial_identity', 'namespace'),
  ('premium', 'product_identity', 'namespace'),
  ('privacy', 'trust_identity', 'namespace'),
  ('report', 'trust_identity', 'namespace'),
  ('reports', 'trust_identity', 'namespace'),
  ('root', 'system_identity', 'namespace'),
  ('safety', 'staff_identity', 'namespace'),
  ('security', 'staff_identity', 'namespace'),
  ('settings', 'system_identity', 'namespace'),
  ('staff', 'staff_identity', 'namespace'),
  ('status', 'system_identity', 'namespace'),
  ('support', 'staff_identity', 'namespace'),
  ('system', 'system_identity', 'namespace'),
  ('team', 'staff_identity', 'namespace'),
  ('terms', 'trust_identity', 'namespace'),
  ('trust', 'trust_identity', 'namespace'),
  ('verification', 'trust_identity', 'namespace'),
  ('verified', 'trust_identity', 'namespace'),
  ('vibes', 'product_identity', 'namespace'),

  -- Future cultural characters: reserve the memorable exact name while still
  -- allowing real members to add a surname, number, period, or underscore.
  ('akwasi', 'cultural_character', 'exact'),
  ('kwadwo', 'cultural_character', 'exact'),
  ('kwabena', 'cultural_character', 'exact'),
  ('kwaku', 'cultural_character', 'exact'),
  ('yaw', 'cultural_character', 'exact'),
  ('kofi', 'cultural_character', 'exact'),
  ('kwame', 'cultural_character', 'exact'),
  ('akosua', 'cultural_character', 'exact'),
  ('adwoa', 'cultural_character', 'exact'),
  ('abena', 'cultural_character', 'exact'),
  ('akua', 'cultural_character', 'exact'),
  ('yaa', 'cultural_character', 'exact'),
  ('afia', 'cultural_character', 'exact'),
  ('ama', 'cultural_character', 'exact')
) as reserved(reserved_name, reserved_reason, reserved_match_mode)
on conflict (normalized_username) do update
set username_skeleton = excluded.username_skeleton,
    reason = excluded.reason,
    match_mode = excluded.match_mode;

create or replace function public.profile_handle_validation_reason(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_username text := public.profile_handle_normalize(p_username);
  v_skeleton text := public.profile_handle_skeleton(p_username);
  v_reason text;
  v_assessment jsonb;
begin
  if char_length(v_username) < 3 then return 'too_short'; end if;
  if char_length(v_username) > 24 then return 'too_long'; end if;
  if v_username !~ '^[a-z0-9]+([._][a-z0-9]+)*$' then return 'invalid_format'; end if;
  if v_username !~ '[a-z]' then return 'letters_required'; end if;

  select reservation.reason
  into v_reason
  from public.profile_handle_reservations reservation
  where reservation.normalized_username = v_username
     or reservation.username_skeleton = v_skeleton
     or (
       reservation.match_mode in ('namespace', 'prefix')
       and (
         v_username like reservation.normalized_username || '.%'
         or left(v_username, char_length(reservation.normalized_username) + 1)
           = reservation.normalized_username || '_'
       )
     )
     or (
       reservation.match_mode = 'prefix'
       and (
         v_username like reservation.normalized_username || '%'
         or v_skeleton like reservation.username_skeleton || '%'
       )
     )
  order by char_length(reservation.normalized_username) desc
  limit 1;

  -- Never strand a member who owned a handle before it became protected.
  -- Other members still see it as taken; after the owner renames, the
  -- reservation becomes effective automatically.
  if v_reason is not null and exists (
    select 1
    from public.profiles profile
    where profile.deleted_at is null
      and lower(btrim(profile.username)) = v_username
  ) then
    v_reason := null;
  end if;

  if v_reason is not null then return 'reserved'; end if;

  v_assessment := public.profile_guard_assess(replace(replace(v_username, '.', ' '), '_', ' '));
  if coalesce(v_assessment->>'decision', '') <> 'ALLOW' then return 'not_allowed'; end if;

  return null;
end;
$$;

revoke all on table public.profile_handle_reservations from public, anon, authenticated;
revoke all on function public.profile_handle_validation_reason(text)
  from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
