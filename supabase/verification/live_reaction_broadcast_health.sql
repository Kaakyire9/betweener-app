with checks as (
  select
    to_regprocedure('public.rpc_create_live_reaction(uuid,uuid,text)') is not null
      as reaction_rpc_present,
    to_regprocedure('public.can_receive_live_reaction_broadcast(text,uuid)') is not null
      as authorization_helper_present,
    exists (
      select 1
      from pg_policies
      where schemaname = 'realtime'
        and tablename = 'messages'
        and policyname = 'live_reaction_broadcast_receive'
        and cmd = 'SELECT'
    ) as private_receive_policy_present,
    not exists (
      select 1
      from pg_policies
      where schemaname = 'realtime'
        and tablename = 'messages'
        and policyname like 'live_reaction_broadcast%'
        and cmd = 'INSERT'
    ) as client_broadcast_denied,
    exists (
      select 1
      from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.live_reactions'::regclass
        and constraint_row.conname = 'live_reactions_value_valid'
        and pg_get_constraintdef(constraint_row.oid) ilike '%celebrate%'
        and pg_get_constraintdef(constraint_row.oid) ilike '%insight%'
    ) as expanded_catalogue_present,
    pg_get_functiondef('public.rpc_create_live_reaction(uuid,uuid,text)'::regprocedure)
      ilike '%realtime.send%' as database_broadcast_present
)
select
  *,
  reaction_rpc_present
    and authorization_helper_present
    and private_receive_policy_present
    and client_broadcast_denied
    and expanded_catalogue_present
    and database_broadcast_present as healthy
from checks;
