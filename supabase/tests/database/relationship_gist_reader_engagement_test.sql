begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(49);

select has_table('public','relationship_gist_reactions','Gist reactions exist');
select has_table('public','relationship_gist_reflections','private reflections exist');
select has_table('public','relationship_gist_engagement_receipts','idempotency receipts exist');
select has_table('public','relationship_gist_reader_events','privacy-safe reader events exist');
select has_table('public','relationship_gist_engagement_rate_limits','engagement rate limits exist');
select ok(to_regprocedure('public.rpc_get_relationship_gist_engagement(uuid)') is not null,'snapshot RPC exists');
select ok(to_regprocedure('public.rpc_set_relationship_gist_reaction(uuid,uuid,uuid,uuid,text,text)') is not null,'reaction RPC exists');
select ok(to_regprocedure('public.rpc_upsert_relationship_gist_reflection(uuid,uuid,uuid,uuid,text,text)') is not null,'reflection upsert RPC exists');
select ok(to_regprocedure('public.rpc_delete_relationship_gist_reflection(uuid,uuid,uuid,uuid,text)') is not null,'reflection delete RPC exists');
select ok(to_regprocedure('public.rpc_record_relationship_gist_reader_event(uuid,uuid,uuid,uuid,text,smallint,text,uuid)') is not null,'analytics RPC exists');
select ok(not has_function_privilege('anon','public.rpc_set_relationship_gist_reaction(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'anonymous reactions are denied');
select ok(has_function_privilege('authenticated','public.rpc_set_relationship_gist_reaction(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'authenticated reaction RPC is available');
select ok(not has_table_privilege('authenticated','public.relationship_gist_reactions','SELECT'),'individual reactors are not readable');
select ok(not has_table_privilege('authenticated','public.relationship_gist_reflections','SELECT'),'reflection table is not directly readable');
select hasnt_column('public','relationship_gist_reader_events','payload','analytics has no arbitrary payload');
select hasnt_column('public','relationship_gist_reader_events','body','analytics cannot store article or reflection bodies');

insert into auth.users(id,email) values
  ('c4400000-0000-4000-8000-000000000001','engagement-a@example.invalid'),
  ('c4400000-0000-4000-8000-000000000002','engagement-b@example.invalid')
on conflict (id) do nothing;

insert into public.relationship_gists(
  id,title,short_body,body,perspective,status,published_at
) values (
  'c4400000-0000-4000-8000-000000000010','A thoughtful Gist','A short summary.',
  'A sufficiently long immutable body for reader engagement database verification.',
  'general','published',timezone('utc'::text,now())
) on conflict (id) do nothing;

insert into public.relationship_gist_editions(
  id,legacy_gist_id,lifecycle_status
) values (
  'c4400000-0000-4000-8000-000000000020',
  'c4400000-0000-4000-8000-000000000010','published'
) on conflict (id) do nothing;

insert into public.relationship_gist_revisions(
  id,edition_id,revision_number,status,primary_perspective,published_at
) values (
  'c4400000-0000-4000-8000-000000000030',
  'c4400000-0000-4000-8000-000000000020',1,'published','general',timezone('utc'::text,now())
) on conflict (id) do nothing;

insert into public.relationship_gist_revision_variants(revision_id,perspective,title,short_body,body)
values (
  'c4400000-0000-4000-8000-000000000030','general','A thoughtful Gist','A short summary.',
  'A sufficiently long immutable body for reader engagement database verification.'
) on conflict (revision_id,perspective) do nothing;

update public.relationship_gist_editions set
  current_revision_id='c4400000-0000-4000-8000-000000000030',
  published_revision_id='c4400000-0000-4000-8000-000000000030'
where id='c4400000-0000-4000-8000-000000000020';

create temporary table gist_engagement_results(label text primary key,result jsonb not null) on commit drop;
create temporary table gist_engagement_errors(label text primary key,error_message text not null) on commit drop;

select set_config('request.jwt.claim.sub','c4400000-0000-4000-8000-000000000001',true);
do $$ begin
  perform public.rpc_set_relationship_gist_reaction(
    gen_random_uuid(),'c4400000-0000-4000-8000-000000000002',
    'c4400000-0000-4000-8000-000000000010','c4400000-0000-4000-8000-000000000030',
    'helpful','circles'
  );
exception when others then insert into gist_engagement_errors values ('owner-mismatch',sqlerrm); end $$;
select is((select error_message from gist_engagement_errors where label='owner-mismatch'),'relationship_gist_owner_mismatch','auth races cannot replay one account mutation as another');

insert into gist_engagement_results values (
  'empty',public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010')
);
select is((select result->>'revision_id' from gist_engagement_results where label='empty'),'c4400000-0000-4000-8000-000000000030','snapshot resolves the current immutable revision');
select is((select (result#>>'{reaction_counts,helpful}')::integer from gist_engagement_results where label='empty'),0,'initial aggregate is real zero');

insert into gist_engagement_results values (
  'reaction-a',public.rpc_set_relationship_gist_reaction(
    'c4400000-0000-4000-8000-000000000101','c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','helpful','circles'
  )
);
select is((select result->>'reaction' from gist_engagement_results where label='reaction-a'),'helpful','user can set one supported reaction');
select is((select count(*)::integer from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000001'),1,'one reaction row exists per user and edition');
select is((select revision_id::text from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000001'),'c4400000-0000-4000-8000-000000000030','reaction retains immutable revision attribution');
select is((public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010')->>'reaction'),'helpful','snapshot returns only the viewer reaction');
select is(((public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010'))#>>'{reaction_counts,helpful}')::integer,1,'snapshot returns exact aggregate count');

insert into gist_engagement_results values (
  'reaction-duplicate',public.rpc_set_relationship_gist_reaction(
    'c4400000-0000-4000-8000-000000000101','c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','helpful','circles'
  )
);
select is((select result->>'delivery' from gist_engagement_results where label='reaction-duplicate'),'duplicate','reaction retry is idempotent');
select is((select count(*)::integer from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000001'),1,'duplicate retry does not duplicate the reaction');

select public.rpc_set_relationship_gist_reaction(
  'c4400000-0000-4000-8000-000000000102','c4400000-0000-4000-8000-000000000001',
  'c4400000-0000-4000-8000-000000000010',
  'c4400000-0000-4000-8000-000000000030','resonated','canonical_reader'
);
select is((select count(*)::integer from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000001'),1,'changing reaction preserves one-active-reaction invariant');
select is((select reaction from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000001'),'resonated','reaction changes deterministically');

select set_config('request.jwt.claim.sub','c4400000-0000-4000-8000-000000000002',true);
select is(public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010')->>'reaction',null,'another user cannot see the first user reaction selection');
select is(((public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010'))#>>'{reaction_counts,resonated}')::integer,1,'another user sees only the aggregate');
select public.rpc_set_relationship_gist_reaction(
  'c4400000-0000-4000-8000-000000000103','c4400000-0000-4000-8000-000000000002',
  'c4400000-0000-4000-8000-000000000010',
  'c4400000-0000-4000-8000-000000000030','helpful','circles'
);
select is(((public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010'))#>>'{reaction_counts,helpful}')::integer,1,'aggregate includes a second member without exposing identity');

select set_config('request.jwt.claim.sub','c4400000-0000-4000-8000-000000000001',true);
insert into gist_engagement_results values (
  'reflection-create',public.rpc_upsert_relationship_gist_reflection(
    'c4400000-0000-4000-8000-000000000110','c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','  My private note  ','canonical_reader'
  )
);
select is((select (result->>'created')::boolean from gist_engagement_results where label='reflection-create'),true,'first reflection is created');
select is((select body from public.relationship_gist_reflections where user_id='c4400000-0000-4000-8000-000000000001'),'My private note','reflection is normalized and private');
select set_config('request.jwt.claim.sub','c4400000-0000-4000-8000-000000000002',true);
select is((public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010')->'reflection')::text,'null','another account receives no private reflection');

select set_config('request.jwt.claim.sub','c4400000-0000-4000-8000-000000000001',true);
insert into gist_engagement_results values (
  'reflection-update',public.rpc_upsert_relationship_gist_reflection(
    'c4400000-0000-4000-8000-000000000111','c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','Updated private note','canonical_reader'
  )
);
select is((select (result->>'created')::boolean from gist_engagement_results where label='reflection-update'),false,'existing reflection is edited rather than duplicated');
select is((select count(*)::integer from public.relationship_gist_reflections where user_id='c4400000-0000-4000-8000-000000000001'),1,'one private reflection exists per stable edition');
select ok(not (select result ? 'body' from public.relationship_gist_engagement_receipts where operation_id='c4400000-0000-4000-8000-000000000111'),'idempotency receipt excludes reflection text');

insert into gist_engagement_results values (
  'event',public.rpc_record_relationship_gist_reader_event(
    'c4400000-0000-4000-8000-000000000120','c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','open',null,'saved_library',
    'c4400000-0000-4000-8000-000000000121'
  )
);
select is((select result->>'delivery' from gist_engagement_results where label='event'),'processed','reader event is recorded');
select is((public.rpc_record_relationship_gist_reader_event(
  'c4400000-0000-4000-8000-000000000120','c4400000-0000-4000-8000-000000000001',
  'c4400000-0000-4000-8000-000000000010',
  'c4400000-0000-4000-8000-000000000030','open',null,'saved_library',
  'c4400000-0000-4000-8000-000000000121'
)->>'delivery'),'duplicate','reader event retry is idempotent');
select is((select count(*)::integer from public.relationship_gist_reader_events where client_event_id='c4400000-0000-4000-8000-000000000120'),1,'duplicate event creates one row');

update public.relationship_gist_reader_events set occurred_at=timezone('utc'::text,now())-interval '2 days'
where client_event_id='c4400000-0000-4000-8000-000000000120';
select public.rpc_record_relationship_gist_reader_event(
  'c4400000-0000-4000-8000-000000000122','c4400000-0000-4000-8000-000000000001',
  'c4400000-0000-4000-8000-000000000010',
  'c4400000-0000-4000-8000-000000000030','open',null,'canonical_reader',
  'c4400000-0000-4000-8000-000000000123'
);
select is((select count(*)::integer from public.relationship_gist_reader_events where user_id='c4400000-0000-4000-8000-000000000001' and event_type='returning_reader'),1,'a later-day open records a privacy-safe returning-reader signal');

do $$ begin
  perform public.rpc_record_relationship_gist_reader_event(
    gen_random_uuid(),'c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','raw_answer',null,'circles',null
  );
exception when others then insert into gist_engagement_errors values ('event-invalid',sqlerrm); end $$;
select is((select error_message from gist_engagement_errors where label='event-invalid'),'relationship_gist_event_invalid','arbitrary analytics event types are rejected');

insert into gist_engagement_results values (
  'reflection-delete',public.rpc_delete_relationship_gist_reflection(
    'c4400000-0000-4000-8000-000000000112','c4400000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000010',
    'c4400000-0000-4000-8000-000000000030','canonical_reader'
  )
);
select is((select (result->>'deleted')::boolean from gist_engagement_results where label='reflection-delete'),true,'owner can delete a private reflection');
select is((select count(*)::integer from public.relationship_gist_reflections where user_id='c4400000-0000-4000-8000-000000000001'),0,'reflection deletion removes the private text');

select public.rpc_set_relationship_gist_reaction(
  'c4400000-0000-4000-8000-000000000104','c4400000-0000-4000-8000-000000000001',
  'c4400000-0000-4000-8000-000000000010',
  'c4400000-0000-4000-8000-000000000030',null,'circles'
);
select is((select count(*)::integer from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000001'),0,'user can remove their active reaction');
select is(((public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010'))#>>'{reaction_counts,helpful}')::integer,1,'removing one reaction preserves the other member aggregate');

set local role postgres;
insert into public.relationship_gist_revisions(
  id,edition_id,revision_number,status,primary_perspective,published_at,source_revision_id
) values (
  'c4400000-0000-4000-8000-000000000031','c4400000-0000-4000-8000-000000000020',
  2,'published','general',timezone('utc'::text,now()),'c4400000-0000-4000-8000-000000000030'
);
insert into public.relationship_gist_revision_variants(revision_id,perspective,title,short_body,body)
values (
  'c4400000-0000-4000-8000-000000000031','general','A thoughtful Gist','A newer summary.',
  'A newer sufficiently long immutable body for revision-aware reader engagement.'
);
update public.relationship_gist_revisions set status='superseded',superseded_at=timezone('utc'::text,now())
where id='c4400000-0000-4000-8000-000000000030';
update public.relationship_gist_editions set
  current_revision_id='c4400000-0000-4000-8000-000000000031',
  published_revision_id='c4400000-0000-4000-8000-000000000031',lock_version=lock_version+1
where id='c4400000-0000-4000-8000-000000000020';
select set_config('request.jwt.claim.sub','c4400000-0000-4000-8000-000000000002',true);
select is(public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010')->>'revision_id','c4400000-0000-4000-8000-000000000031','snapshot advances to the newly published immutable revision');
select is(public.rpc_get_relationship_gist_engagement('c4400000-0000-4000-8000-000000000010')->>'reaction_revision_id','c4400000-0000-4000-8000-000000000030','existing reaction retains its original revision attribution');
select public.rpc_set_relationship_gist_reaction(
  'c4400000-0000-4000-8000-000000000105','c4400000-0000-4000-8000-000000000002',
  'c4400000-0000-4000-8000-000000000010',
  'c4400000-0000-4000-8000-000000000031','made_me_think','canonical_reader'
);
select is((select revision_id::text from public.relationship_gist_reactions where user_id='c4400000-0000-4000-8000-000000000002'),'c4400000-0000-4000-8000-000000000031','changed reaction is attributed to the revision actually read');

select * from finish();
rollback;
