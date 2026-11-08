begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(33);

select has_column('public', 'relationship_gist_user_states', 'saved_version', 'saved state has a conflict version');
select has_column('public', 'relationship_gist_user_states', 'last_anchor', 'reader state stores a stable anchor');
select has_column('public', 'relationship_gist_user_states', 'last_anchor_offset', 'reader state stores an anchor offset');
select has_column('public', 'relationship_gist_user_states', 'scroll_completed_at', 'scroll completion is explicit');
select has_column('public', 'relationship_gist_user_states', 'read_acknowledged_at', 'read acknowledgement is explicit');
select has_column('public', 'relationship_gist_user_states', 'reading_duration_ms', 'reading duration is independent telemetry');
select has_table('public', 'relationship_gist_state_mutation_receipts', 'Gist state has durable mutation receipts');
select col_is_pk('public', 'relationship_gist_state_mutation_receipts', array['profile_id', 'operation_id'], 'receipts are unique per account and operation');
select ok(not has_table_privilege('authenticated', 'public.relationship_gist_state_mutation_receipts', 'SELECT'), 'members cannot read raw receipts');
select ok(not has_table_privilege('authenticated', 'public.relationship_gist_state_mutation_receipts', 'INSERT'), 'members cannot forge receipts');
select ok(not has_function_privilege('anon', 'public.rpc_apply_relationship_gist_state_mutation_v2(uuid,uuid,uuid,boolean,bigint,double precision,timestamp with time zone,boolean,text,text,double precision,boolean,boolean,bigint)', 'EXECUTE'), 'anonymous users cannot mutate reader state');
select ok(has_function_privilege('authenticated', 'public.rpc_apply_relationship_gist_state_mutation_v2(uuid,uuid,uuid,boolean,bigint,double precision,timestamp with time zone,boolean,text,text,double precision,boolean,boolean,bigint)', 'EXECUTE'), 'authenticated users can invoke the guarded v2 mutation');
select ok(to_regprocedure('public.rpc_upsert_relationship_gist_user_state(uuid,boolean,double precision,timestamp with time zone,boolean,text)') is not null, 'legacy reader-state RPC signature remains');
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef(
    'public.rpc_apply_relationship_gist_state_mutation_v2(uuid,uuid,uuid,boolean,bigint,double precision,timestamp with time zone,boolean,text,text,double precision,boolean,boolean,bigint)'::regprocedure
  )) > 0,
  'v2 serializes duplicate delivery'
);
select ok(
  position('saved_outcome' in pg_get_functiondef(
    'public.rpc_apply_relationship_gist_state_mutation_v2(uuid,uuid,uuid,boolean,bigint,double precision,timestamp with time zone,boolean,text,text,double precision,boolean,boolean,bigint)'::regprocedure
  )) > 0,
  'v2 returns explicit save conflict outcomes'
);
select ok(
  position('relationship_gist_state_mutation_receipts' in pg_get_functiondef(
    'public.rpc_apply_relationship_gist_state_mutation_v2(uuid,uuid,uuid,boolean,bigint,double precision,timestamp with time zone,boolean,text,text,double precision,boolean,boolean,bigint)'::regprocedure
  )) > 0,
  'state and receipt share one transaction'
);
select ok(
  position('saved_version' in pg_get_functiondef(
    'public.rpc_upsert_relationship_gist_user_state(uuid,boolean,double precision,timestamp with time zone,boolean,text)'::regprocedure
  )) > 0,
  'legacy saves advance the v2 conflict version'
);

insert into auth.users(id, email) values
  ('b2200000-0000-4000-8000-000000000001', 'gist-reader-a@example.invalid'),
  ('b2200000-0000-4000-8000-000000000002', 'gist-reader-b@example.invalid')
on conflict (id) do nothing;

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name) values
  ('b2200000-0000-4000-8000-000000000011', 'b2200000-0000-4000-8000-000000000001', 'Gist reader A'),
  ('b2200000-0000-4000-8000-000000000012', 'b2200000-0000-4000-8000-000000000002', 'Gist reader B')
on conflict (user_id) do update set full_name = excluded.full_name;

insert into public.relationship_gists(
  id, title, body, perspective, status, published_at, circle_id
) values (
  'b2200000-0000-4000-8000-000000000020',
  'Reader state test Gist',
  'A published Relationship Gist used only inside this rollback-only test.',
  'general',
  'published',
  timezone('utc'::text, now()),
  null
)
on conflict (id) do update
set status = 'published', published_at = excluded.published_at, circle_id = null;

create temporary table gist_reader_results (
  label text primary key,
  result jsonb not null
) on commit drop;

create temporary table gist_reader_errors (
  label text primary key,
  error_code text not null,
  error_message text not null
) on commit drop;

select set_config('request.jwt.claim.sub', 'b2200000-0000-4000-8000-000000000001', true);

insert into gist_reader_results(label, result)
select 'initial', public.rpc_apply_relationship_gist_state_mutation_v2(
  'b2200000-0000-4000-8000-000000000101',
  'b2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000020',
  true, 0, 0.6, null, true, 'general', 'section-one', 24, false, false, 1000
);

insert into gist_reader_results(label, result)
select 'duplicate', public.rpc_apply_relationship_gist_state_mutation_v2(
  'b2200000-0000-4000-8000-000000000101',
  'b2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000020',
  true, 0, 0.6, null, true, 'general', 'section-one', 24, false, false, 1000
);

insert into gist_reader_results(label, result)
select 'stale-device', public.rpc_apply_relationship_gist_state_mutation_v2(
  'b2200000-0000-4000-8000-000000000102',
  'b2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000020',
  false, 0, 0.4, null, false, 'general', null, null, false, false, null
);

insert into gist_reader_results(label, result)
select 'rebased-device', public.rpc_apply_relationship_gist_state_mutation_v2(
  'b2200000-0000-4000-8000-000000000103',
  'b2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000020',
  false, 1, 0.2, null, false, 'general', null, null, false, true, null
);

do $$
begin
  perform public.rpc_apply_relationship_gist_state_mutation_v2(
    'b2200000-0000-4000-8000-000000000104',
    'b2200000-0000-4000-8000-000000000002',
    'b2200000-0000-4000-8000-000000000020',
    true, 0, null, null, false, null, null, null, false, false, null
  );
exception when others then
  insert into gist_reader_errors(label, error_code, error_message)
  values ('owner-mismatch', sqlstate, sqlerrm);
end;
$$;

select is((select result ->> 'delivery' from gist_reader_results where label = 'initial'), 'processed', 'first delivery is processed');
select is((select result ->> 'saved_outcome' from gist_reader_results where label = 'initial'), 'applied', 'first save intent is applied');
select is((select (result ->> 'saved')::boolean from gist_reader_results where label = 'initial'), true, 'first save intent is authoritative');
select is((select (result ->> 'saved_version')::bigint from gist_reader_results where label = 'initial'), 1::bigint, 'first save advances the version');
select is((select result ->> 'delivery' from gist_reader_results where label = 'duplicate'), 'duplicate', 'duplicate operation is observable');
select is((select (result ->> 'reading_duration_ms')::bigint from gist_reader_results where label = 'duplicate'), 1000::bigint, 'duplicate does not double-count reading duration');
select is((select result ->> 'saved_outcome' from gist_reader_results where label = 'stale-device'), 'conflict', 'stale multi-device save is reported as a conflict');
select is((select (result ->> 'saved')::boolean from gist_reader_results where label = 'stale-device'), true, 'stale save cannot overwrite the current intent');
select is((select result ->> 'saved_outcome' from gist_reader_results where label = 'rebased-device'), 'applied', 'rebased latest intent is applied deterministically');
select is((select (result ->> 'saved')::boolean from gist_reader_results where label = 'rebased-device'), false, 'rebased unsave becomes authoritative');
select is((select (result ->> 'saved_version')::bigint from gist_reader_results where label = 'rebased-device'), 2::bigint, 'rebased save advances from the authoritative version');
select is((select error_code from gist_reader_errors where label = 'owner-mismatch'), '42501', 'cross-account replay is rejected');
select is((select error_message from gist_reader_errors where label = 'owner-mismatch'), 'gist_owner_mismatch', 'cross-account rejection is explicit');
select is((select count(*)::bigint from public.relationship_gist_state_mutation_receipts where profile_id = (select id from public.profiles where user_id = 'b2200000-0000-4000-8000-000000000001')), 3::bigint, 'only unique accepted operations create receipts');
select is((select reading_duration_ms from public.relationship_gist_user_states where profile_id = (select id from public.profiles where user_id = 'b2200000-0000-4000-8000-000000000001') and gist_id = 'b2200000-0000-4000-8000-000000000020'), 1000::bigint, 'authoritative duration remains independently accumulated');
select ok((select read_acknowledged_at is not null and progress = 1 from public.relationship_gist_user_states where profile_id = (select id from public.profiles where user_id = 'b2200000-0000-4000-8000-000000000001') and gist_id = 'b2200000-0000-4000-8000-000000000020'), 'explicit acknowledgement records completion separately from duration');

select * from finish();
rollback;
