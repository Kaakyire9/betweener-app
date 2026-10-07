-- Betweener 1.2.0 durable mutation/idempotency health check.
-- Read-only. Run on staging after applying 20260918120000.

-- 1. Migration and execution boundaries.
with expected(name, signature) as (
  values
    ('text moment', 'public.rpc_create_text_moment_v2(text,text,text,text,jsonb)'),
    ('media moment', 'public.rpc_create_media_moment_v2(text,uuid,text,text,text,text,jsonb)'),
    ('moment comment', 'public.rpc_create_moment_comment_v2(text,uuid,text,uuid)'),
    ('circle comment', 'public.rpc_create_circle_pulse_comment_v2(text,uuid,uuid,text,uuid)'),
    ('profile boost', 'public.rpc_create_profile_boost_v3(text,text,text,text,jsonb)'),
    ('profile gift', 'public.rpc_send_profile_gift_v2(text,uuid,text,boolean)'),
    ('profile interests', 'public.rpc_replace_profile_interests_v2(uuid,text[],text)')
), resolved as (
  select expected.*, to_regprocedure(expected.signature) as procedure_oid
  from expected
)
select
  resolved.name,
  resolved.procedure_oid is not null as installed,
  coalesce(has_function_privilege('authenticated', resolved.procedure_oid, 'EXECUTE'), false)
    as authenticated_can_execute,
  not coalesce(has_function_privilege('anon', resolved.procedure_oid, 'EXECUTE'), false)
    as anonymous_blocked
from resolved
order by resolved.name;

-- 2. Receipt volume contains identifiers only as aggregate counts.
select
  receipt.mutation_kind,
  count(*) filter (where receipt.created_at >= now() - interval '24 hours')::integer
    as receipts_24h,
  count(*) filter (where receipt.created_at >= now() - interval '7 days')::integer
    as receipts_7d,
  count(distinct receipt.user_id) filter (
    where receipt.created_at >= now() - interval '7 days'
  )::integer as users_7d,
  max(receipt.created_at) as last_receipt_at
from public.app_mutation_receipts receipt
group by receipt.mutation_kind
order by receipt.mutation_kind;

-- 3. Contract gate. Every boolean must be true.
with expected(signature) as (
  values
    ('public.rpc_create_text_moment_v2(text,text,text,text,jsonb)'),
    ('public.rpc_create_media_moment_v2(text,uuid,text,text,text,text,jsonb)'),
    ('public.rpc_create_moment_comment_v2(text,uuid,text,uuid)'),
    ('public.rpc_create_circle_pulse_comment_v2(text,uuid,uuid,text,uuid)'),
    ('public.rpc_create_profile_boost_v3(text,text,text,text,jsonb)'),
    ('public.rpc_send_profile_gift_v2(text,uuid,text,boolean)'),
    ('public.rpc_replace_profile_interests_v2(uuid,text[],text)')
), functions as (
  select
    count(*) filter (where to_regprocedure(expected.signature) is null)::integer
      as missing_functions,
    count(*) filter (
      where to_regprocedure(expected.signature) is not null
        and not has_function_privilege(
          'authenticated', to_regprocedure(expected.signature), 'EXECUTE'
        )
    )::integer as invalid_authenticated_boundaries,
    count(*) filter (
      where to_regprocedure(expected.signature) is not null
        and has_function_privilege('anon', to_regprocedure(expected.signature), 'EXECUTE')
    )::integer as invalid_anonymous_boundaries
  from expected
), contract as (
  select
    exists (
      select 1 from supabase_migrations.schema_migrations migration
      where migration.version = '20260918120000'
    ) as migration_installed,
    to_regclass('public.app_mutation_receipts') is not null as receipt_table_installed,
    coalesce((
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass('public.app_mutation_receipts')
    ), false) as receipt_rls_enabled,
    to_regprocedure('public.cleanup_app_mutation_receipts_v1(integer)') is not null
      as receipt_retention_installed
)
select
  contract.migration_installed,
  contract.receipt_table_installed,
  contract.receipt_rls_enabled,
  contract.receipt_retention_installed,
  functions.missing_functions,
  functions.invalid_authenticated_boundaries,
  functions.invalid_anonymous_boundaries,
  contract.migration_installed
    and contract.receipt_table_installed
    and contract.receipt_rls_enabled
    and contract.receipt_retention_installed
    and functions.missing_functions = 0
    and functions.invalid_authenticated_boundaries = 0
    and functions.invalid_anonymous_boundaries = 0 as healthy
from contract, functions;
