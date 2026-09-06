begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  has_function_privilege(
    'authenticated',
    'public.profile_guard_structured_text_is_valid(text,text)',
    'EXECUTE'
  ),
  'authenticated onboarding can invoke the structured-field validator'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.profile_guard_location_is_derived(text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated onboarding can invoke the derived-location validator'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.profile_guard_assess(text)',
    'EXECUTE'
  ),
  'the broader profile detector remains service-only'
);

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.profile_guard_structured_text_is_valid(text,text)'::regprocedure),
  'structured validation executes nested private checks as its owner'
);

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.profile_guard_location_is_derived(text,text,text,text)'::regprocedure),
  'derived-location validation has the same protected execution boundary'
);

set local role authenticated;
select lives_ok(
  $$ select public.profile_guard_structured_text_is_valid('city', 'London') $$,
  'a normal city no longer fails onboarding with a permission error'
);
select is(
  public.profile_guard_structured_text_is_valid('region', 'Greater London'),
  true,
  'a normal region passes structured validation'
);
select is(
  public.profile_guard_location_is_derived(
    'London, Greater London, United Kingdom',
    'London',
    'Greater London',
    'United Kingdom'
  ),
  true,
  'a canonical onboarding location passes derived validation'
);
reset role;

select * from finish();
rollback;
