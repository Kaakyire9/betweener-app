begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile_handle_reservations'
      and column_name = 'match_mode'
      and is_nullable = 'NO'
  ),
  'reservation matching modes are installed'
);

select is(
  public.profile_handle_validation_reason('support'),
  'reserved',
  'staff identities are reserved'
);
select is(
  public.profile_handle_validation_reason('supportive'),
  null,
  'ordinary words that merely share a reserved prefix stay available'
);
select is(
  public.profile_handle_validation_reason('betweenerghana'),
  'reserved',
  'brand prefixes protect future impersonating continuations'
);
select is(
  public.profile_handle_validation_reason('dating'),
  'reserved',
  'product namespaces are reserved'
);
select is(
  public.profile_handle_validation_reason('dating.community'),
  'reserved',
  'dot children of product namespaces are reserved'
);
select is(
  public.profile_handle_validation_reason('datingcoach'),
  null,
  'ordinary continuations of product namespaces stay available'
);
select is(
  public.profile_handle_validation_reason('akosua'),
  'reserved',
  'future cultural character names are reserved exactly'
);
select is(
  public.profile_handle_validation_reason('ak0sua'),
  'reserved',
  'confusable versions of exact reservations are protected'
);
select is(
  public.profile_handle_validation_reason('akosua.adu'),
  null,
  'members can extend an exact cultural reservation with a surname'
);
select is(
  public.profile_handle_validation_reason('kofi_adu'),
  null,
  'underscore extensions of exact cultural reservations stay available'
);
select is(
  public.profile_handle_validation_reason('two__dots'),
  'invalid_format',
  'consecutive separators are rejected'
);

select ok(
  not has_function_privilege('public',
    'public.rpc_update_my_profile_username(text,boolean)', 'EXECUTE'),
  'PUBLIC cannot update handles'
);
select ok(
  not has_function_privilege('anon',
    'public.rpc_update_my_profile_username(text,boolean)', 'EXECUTE'),
  'anon cannot update handles'
);
select ok(
  has_function_privilege('authenticated',
    'public.rpc_get_my_profile_handle_state()', 'EXECUTE'),
  'authenticated members can read their handle state'
);
select ok(
  has_function_privilege('authenticated',
    'public.rpc_check_profile_username_availability(text)', 'EXECUTE'),
  'authenticated members can check availability'
);
select ok(
  has_function_privilege('authenticated',
    'public.rpc_update_my_profile_username(text,boolean)', 'EXECUTE'),
  'authenticated members can use the controlled update RPC'
);

insert into auth.users(id, email) values
  ('9d000000-0000-4000-8000-000000000001', 'handle-one@example.test'),
  ('9d000000-0000-4000-8000-000000000002', 'handle-two@example.test'),
  ('9d000000-0000-4000-8000-000000000003', 'handle-three@example.test');
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name, profile_completed, identity_status) values
  ('9d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000001', 'Handle One', true, 'active'),
  ('9d000000-0000-4000-8000-000000000002', '9d000000-0000-4000-8000-000000000002', 'Handle Two', true, 'active');
select set_config('app.profile_guard_write', 'off', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ update public.profiles set username = 'bypass' where user_id = auth.uid() $$,
  '42501', 'PROFILE_HANDLE_RPC_REQUIRED',
  'direct handle updates are blocked'
);
select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ insert into public.profiles(
       id, user_id, username, full_name, bio, age, gender,
       profile_completed, identity_status, phone_verified, phone_number
     ) values (
       '9d000000-0000-4000-8000-000000000003', auth.uid(), 'bypass',
       'Handle Three', 'A thoughtful and safe profile.', 31, 'FEMALE',
       true, 'active', true, '+447700903003'
     ) $$,
  '42501', 'PROFILE_HANDLE_RPC_REQUIRED',
  'direct handle claims during profile creation are blocked'
);
select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);
select is(
  public.rpc_check_profile_username_availability('  @OrbitMaker  ')->>'username',
  'orbitmaker',
  'availability normalizes the proposed handle'
);
select is(
  public.rpc_update_my_profile_username('@OrbitMaker', true)->>'username',
  'orbitmaker',
  'the first claim succeeds atomically'
);
select is(
  (select username_searchable from public.profiles where user_id = auth.uid()),
  true,
  'the claim stores explicit search consent'
);
select is(
  (public.rpc_get_my_profile_handle_state()->>'canRename')::boolean,
  false,
  'a successful claim starts the rename cooldown'
);
select throws_ok(
  $$ select public.rpc_update_my_profile_username('orbitmaker.new', true) $$,
  'P0001', 'PROFILE_HANDLE_COOLDOWN',
  'rapid renames are blocked'
);
select is(
  public.rpc_update_my_profile_username('orbitmaker', false)->>'usernameSearchable',
  'false',
  'privacy can change without waiting for the rename cooldown'
);

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000002', true);
select is(
  public.rpc_check_profile_username_availability('orbitmaker')->>'reason',
  'taken',
  'another member cannot claim an active handle'
);

reset role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);
update public.profiles
set username_changed_at = timezone('utc', now()) - interval '31 days'
where id = '9d000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);
select is(
  public.rpc_update_my_profile_username('orbitmaker.new', true)->>'username',
  'orbitmaker.new',
  'a rename succeeds after the cooldown'
);

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000002', true);
select is(
  public.rpc_check_profile_username_availability('orbitmaker')->>'reason',
  'quarantined',
  'a previous handle is quarantined for other members'
);
select is(
  public.rpc_check_profile_username_availability('betweener.support')->>'reason',
  'reserved',
  'brand lookalike handles stay protected'
);

reset role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, username, username_searchable,
  profile_completed, identity_status
) values (
  '9d000000-0000-4000-8000-000000000003',
  '9d000000-0000-4000-8000-000000000003',
  'Grandfathered Ama', 'ama', false, true, 'active'
);
select set_config('app.profile_guard_write', 'off', true);

select is(
  public.profile_handle_validation_reason('ama'),
  null,
  'an existing owner is grandfathered when the exact name becomes protected'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000003', true);
select is(
  public.rpc_update_my_profile_username('ama', true)->>'usernameSearchable',
  'true',
  'a grandfathered owner can still opt into handle discovery'
);

reset role;
select * from finish();
rollback;
