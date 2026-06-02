drop function if exists public.rpc_get_chat_conversation_summaries(integer, integer);

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
  last_activity_kind text,
  last_activity_message_id uuid,
  last_activity_preview text,
  last_activity_at timestamptz,
  unread_count integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with visible_messages as (
    select
      m.*,
      case
        when m.sender_id = auth.uid() then m.receiver_id
        else m.sender_id
      end as other_user_id
    from public.messages m
    left join public.message_hides mh
      on mh.message_id = m.id
     and mh.user_id = auth.uid()
    where auth.uid() is not null
      and mh.message_id is null
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
  ),
  ranked_messages as (
    select
      vm.*,
      count(*) filter (
        where vm.receiver_id = auth.uid()
          and vm.is_read = false
      ) over (partition by vm.other_user_id)::integer as unread_count,
      row_number() over (
        partition by vm.other_user_id
        order by vm.created_at desc, vm.id desc
      ) as row_num
    from visible_messages vm
  ),
  activity_events as (
    select
      vm.other_user_id,
      'edit'::text as activity_kind,
      vm.id as activity_message_id,
      case coalesce(vm.message_type, 'text')
        when 'image' then 'Edited: Photo'
        when 'video' then 'Edited: Video'
        when 'voice' then 'Edited: Voice message'
        when 'document' then 'Edited: Document'
        when 'location' then 'Edited: Location'
        when 'mood_sticker' then 'Edited: Sticker'
        else 'Edited: ' || coalesce(nullif(btrim(vm.text), ''), 'Message')
      end as activity_preview,
      vm.edited_at as activity_at
    from visible_messages vm
    where vm.edited_at is not null

    union all

    select
      vm.other_user_id,
      'reaction'::text as activity_kind,
      vm.id as activity_message_id,
      case when mr.user_id = auth.uid() then 'You' else 'Someone' end ||
        ' reacted ' || mr.emoji || ' to ' ||
        case coalesce(vm.message_type, 'text')
          when 'image' then 'photo'
          when 'video' then 'video'
          when 'voice' then 'voice note'
          when 'document' then 'document'
          when 'location' then 'location'
          when 'mood_sticker' then 'sticker'
          else 'message'
        end as activity_preview,
      mr.created_at as activity_at
    from visible_messages vm
    join public.message_reactions mr
      on mr.message_id = vm.id
  ),
  ranked_activities as (
    select
      ae.*,
      row_number() over (
        partition by ae.other_user_id
        order by ae.activity_at desc, ae.activity_message_id desc, ae.activity_kind desc
      ) as row_num
    from activity_events ae
  )
  select
    rm.other_user_id,
    rm.id as last_message_id,
    rm.text as last_message_text,
    rm.created_at as last_message_created_at,
    rm.sender_id as last_message_sender_id,
    rm.receiver_id as last_message_receiver_id,
    rm.is_read as last_message_is_read,
    rm.delivered_at as last_message_delivered_at,
    coalesce(rm.message_type, 'text') as last_message_type,
    coalesce(rm.is_view_once, false) as last_message_is_view_once,
    coalesce(rm.deleted_for_all, false) as last_message_deleted_for_all,
    ra.activity_kind as last_activity_kind,
    ra.activity_message_id as last_activity_message_id,
    ra.activity_preview as last_activity_preview,
    ra.activity_at as last_activity_at,
    rm.unread_count
  from ranked_messages rm
  left join ranked_activities ra
    on ra.other_user_id = rm.other_user_id
   and ra.row_num = 1
  where rm.row_num = 1
  order by rm.created_at desc, rm.id desc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.rpc_get_chat_conversation_summaries(integer, integer) from public;
grant execute on function public.rpc_get_chat_conversation_summaries(integer, integer) to authenticated;
