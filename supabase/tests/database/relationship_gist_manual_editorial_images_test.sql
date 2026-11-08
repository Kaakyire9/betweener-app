begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_column(
  'public', 'relationship_gist_revision_images', 'source',
  'revision images record whether a cover is AI-generated or manually selected'
);
select col_default_is(
  'public', 'relationship_gist_revision_images', 'source', 'ai',
  'existing AI cover rows retain a compatible source default'
);
select ok(
  to_regprocedure('public.relationship_gist_can_upload_manual_cover(text)') is not null,
  'manual-cover upload authorization helper exists'
);
select ok(
  to_regprocedure('public.relationship_gist_can_cleanup_manual_cover(text)') is not null,
  'manual-cover cleanup authorization helper exists'
);
select ok(
  to_regprocedure('public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)') is not null,
  'manual-cover finalization RPC exists with the exact signature'
);
select ok(
  not has_function_privilege('anon', 'public.relationship_gist_can_upload_manual_cover(text)', 'EXECUTE'),
  'anonymous callers cannot evaluate editor upload authority'
);
select ok(
  has_function_privilege('authenticated', 'public.relationship_gist_can_upload_manual_cover(text)', 'EXECUTE'),
  'authenticated storage policy evaluation can use the upload helper'
);
select ok(
  not has_function_privilege('anon', 'public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)', 'EXECUTE'),
  'anonymous callers cannot finalize a manual cover'
);
select ok(
  has_function_privilege('authenticated', 'public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)', 'EXECUTE'),
  'authenticated editors can reach server-authoritative finalization'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'relationship_gist_cover_editor_upload'
      and cmd = 'INSERT'
  ),
  'private cover bucket has an authenticated editor upload policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'relationship_gist_cover_editor_cleanup'
      and cmd = 'DELETE'
  ),
  'unfinalized manual covers have a narrowly scoped cleanup policy'
);
select ok(
  position('quality_approve' in pg_get_functiondef(
    'public.relationship_gist_can_upload_manual_cover(text)'::regprocedure
  )) > 0
  and position('draft' in pg_get_functiondef(
    'public.relationship_gist_can_upload_manual_cover(text)'::regprocedure
  )) > 0,
  'upload authorization requires both draft and quality authority'
);
select ok(
  position('object.owner_id::text = v_actor::text' in pg_get_functiondef(
    'public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)'::regprocedure
  )) > 0,
  'finalization binds the storage object to the authenticated owner'
);
select ok(
  position('relationship_gist_v2_record_audit' in pg_get_functiondef(
    'public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)'::regprocedure
  )) > 0,
  'manual-cover approval records a durable editorial audit event'
);
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'relationship-gist-covers'
      and public = false
      and file_size_limit = 8388608
      and allowed_mime_types = array['image/webp']::text[]
  ),
  'manual covers inherit the private WebP-only eight-megabyte bucket contract'
);
select ok(
  not has_table_privilege('authenticated', 'public.relationship_gist_revision_images', 'INSERT'),
  'clients cannot bypass the finalization RPC with direct image-row inserts'
);

select * from finish();
rollback;
