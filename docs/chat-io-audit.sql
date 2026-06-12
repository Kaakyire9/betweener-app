-- Run in the Supabase SQL editor after the hardening migration has been active
-- long enough to capture normal traffic.

select
  calls,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  shared_blks_read,
  shared_blks_written,
  temp_blks_read,
  temp_blks_written,
  left(query, 500) as query
from extensions.pg_stat_statements
where query ilike any(array[
  '%public.messages%',
  '%chat_conversation_summaries%',
  '%chat_typing_state%',
  '%user_presence%'
])
order by shared_blks_read + shared_blks_written + temp_blks_read + temp_blks_written desc
limit 40;

select
  relname,
  seq_scan,
  idx_scan,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  n_live_tup,
  n_dead_tup,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
where relname in (
  'messages',
  'message_reactions',
  'message_hides',
  'chat_conversation_summaries',
  'chat_typing_state',
  'user_presence',
  'profiles'
)
order by n_tup_upd + n_tup_ins + n_tup_del desc;

select
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes
where relname in (
  'messages',
  'message_reactions',
  'message_hides',
  'chat_conversation_summaries',
  'chat_typing_state',
  'user_presence'
)
order by relname, idx_scan desc;
