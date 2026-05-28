create or replace function public.rpc_get_chat_conversation_summaries(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  other_user_id uuid,
  last_message_id uuid,
  last_message_text text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  last_message_receiver_id uuid,
  last_message_is_read boolean,
  last_message_delivered_at timestamptz,
  last_message_type text,
  last_message_is_view_once boolean,
  last_message_deleted_for_all boolean,
  unread_count integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with visible_messages as (
    select m.*
    from public.messages m
    left join public.message_hides mh
      on mh.message_id = m.id
     and mh.user_id = auth.uid()
    where auth.uid() is not null
      and mh.message_id is null
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
  ),
  ranked as (
    select
      case
        when vm.sender_id = auth.uid() then vm.receiver_id
        else vm.sender_id
      end as other_user_id,
      vm.id as last_message_id,
      vm.text as last_message_text,
      vm.created_at as last_message_created_at,
      vm.sender_id as last_message_sender_id,
      vm.receiver_id as last_message_receiver_id,
      vm.is_read as last_message_is_read,
      vm.delivered_at as last_message_delivered_at,
      coalesce(vm.message_type, 'text') as last_message_type,
      coalesce(vm.is_view_once, false) as last_message_is_view_once,
      coalesce(vm.deleted_for_all, false) as last_message_deleted_for_all,
      count(*) filter (
        where vm.receiver_id = auth.uid()
          and vm.is_read = false
      ) over (
        partition by
          case
            when vm.sender_id = auth.uid() then vm.receiver_id
            else vm.sender_id
          end
      )::integer as unread_count,
      row_number() over (
        partition by
          case
            when vm.sender_id = auth.uid() then vm.receiver_id
            else vm.sender_id
          end
        order by vm.created_at desc, vm.id desc
      ) as row_num
    from visible_messages vm
  )
  select
    r.other_user_id,
    r.last_message_id,
    r.last_message_text,
    r.last_message_created_at,
    r.last_message_sender_id,
    r.last_message_receiver_id,
    r.last_message_is_read,
    r.last_message_delivered_at,
    r.last_message_type,
    r.last_message_is_view_once,
    r.last_message_deleted_for_all,
    r.unread_count
  from ranked r
  where r.row_num = 1
  order by r.last_message_created_at desc, r.last_message_id desc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.rpc_get_chat_conversation_summaries(integer, integer) from public;
grant execute on function public.rpc_get_chat_conversation_summaries(integer, integer) to authenticated;
