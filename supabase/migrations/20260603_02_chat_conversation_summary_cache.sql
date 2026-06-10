create table if not exists public.chat_conversation_summaries (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  peer_user_id uuid not null references auth.users(id) on delete cascade,
  last_message_id uuid null references public.messages(id) on delete set null,
  last_message_text text null,
  last_message_created_at timestamptz null,
  last_message_sender_id uuid null references auth.users(id) on delete set null,
  last_message_receiver_id uuid null references auth.users(id) on delete set null,
  last_message_is_read boolean not null default false,
  last_message_delivered_at timestamptz null,
  last_message_type text null,
  last_message_is_view_once boolean not null default false,
  last_message_deleted_for_all boolean not null default false,
  last_message_edited_at timestamptz null,
  last_message_reaction_emoji text null,
  last_message_reaction_user_id uuid null references auth.users(id) on delete set null,
  last_message_reaction_created_at timestamptz null,
  last_message_reaction_target_type text null,
  last_activity_kind text null,
  last_activity_message_id uuid null references public.messages(id) on delete set null,
  last_activity_preview text null,
  last_activity_at timestamptz null,
  unread_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint chat_conversation_summaries_pkey primary key (owner_user_id, peer_user_id),
  constraint chat_conversation_summaries_distinct_users check (owner_user_id <> peer_user_id),
  constraint chat_conversation_summaries_last_activity_kind_valid
    check (last_activity_kind is null or last_activity_kind in ('edit', 'reaction'))
);

create index if not exists chat_conversation_summaries_owner_last_message_idx
  on public.chat_conversation_summaries (owner_user_id, last_message_created_at desc);

alter table public.chat_conversation_summaries enable row level security;

revoke all on public.chat_conversation_summaries from anon, authenticated;

create or replace function public.refresh_chat_conversation_summary(
  p_owner_user_id uuid,
  p_peer_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_summary record;
begin
  if p_owner_user_id is null or p_peer_user_id is null or p_owner_user_id = p_peer_user_id then
    return;
  end if;

  with visible_messages as (
    select
      m.id,
      m.text,
      m.created_at,
      m.sender_id,
      m.receiver_id,
      m.is_read,
      m.delivered_at,
      coalesce(m.message_type, 'text') as message_type,
      coalesce(m.is_view_once, false) as is_view_once,
      coalesce(m.deleted_for_all, false) as deleted_for_all,
      m.edited_at
    from public.messages m
    left join public.message_hides mh
      on mh.message_id = m.id
     and mh.user_id = p_owner_user_id
    where mh.message_id is null
      and (
        (m.sender_id = p_owner_user_id and m.receiver_id = p_peer_user_id)
        or
        (m.sender_id = p_peer_user_id and m.receiver_id = p_owner_user_id)
      )
  ),
  ranked_messages as (
    select
      vm.*,
      count(*) filter (
        where vm.receiver_id = p_owner_user_id
          and vm.is_read = false
      ) over ()::integer as unread_count,
      row_number() over (
        order by vm.created_at desc, vm.id desc
      ) as row_num
    from visible_messages vm
  ),
  latest_message as (
    select *
    from ranked_messages
    where row_num = 1
  ),
  latest_reaction as (
    select
      mr.emoji,
      mr.user_id,
      mr.created_at,
      lm.message_type as target_type
    from latest_message lm
    join public.message_reactions mr
      on mr.message_id = lm.id
    order by mr.created_at desc, mr.id desc
    limit 1
  ),
  activity_events as (
    select
      'edit'::text as activity_kind,
      vm.id as activity_message_id,
      case vm.message_type
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
      'reaction'::text as activity_kind,
      vm.id as activity_message_id,
      case when mr.user_id = p_owner_user_id then 'You' else 'Someone' end ||
        ' reacted ' || mr.emoji || ' to ' ||
        case vm.message_type
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
  latest_activity as (
    select
      ae.activity_kind,
      ae.activity_message_id,
      ae.activity_preview,
      ae.activity_at
    from activity_events ae
    order by ae.activity_at desc, ae.activity_message_id desc, ae.activity_kind desc
    limit 1
  )
  select
    lm.id as last_message_id,
    lm.text as last_message_text,
    lm.created_at as last_message_created_at,
    lm.sender_id as last_message_sender_id,
    lm.receiver_id as last_message_receiver_id,
    lm.is_read as last_message_is_read,
    lm.delivered_at as last_message_delivered_at,
    lm.message_type as last_message_type,
    lm.is_view_once as last_message_is_view_once,
    lm.deleted_for_all as last_message_deleted_for_all,
    lm.edited_at as last_message_edited_at,
    lr.emoji as last_message_reaction_emoji,
    lr.user_id as last_message_reaction_user_id,
    lr.created_at as last_message_reaction_created_at,
    lr.target_type as last_message_reaction_target_type,
    la.activity_kind as last_activity_kind,
    la.activity_message_id as last_activity_message_id,
    la.activity_preview as last_activity_preview,
    la.activity_at as last_activity_at,
    greatest(coalesce(lm.unread_count, 0), 0) as unread_count
  into v_summary
  from latest_message lm
  left join latest_reaction lr on true
  left join latest_activity la on true;

  if v_summary.last_message_id is null then
    delete from public.chat_conversation_summaries
    where owner_user_id = p_owner_user_id
      and peer_user_id = p_peer_user_id;
    return;
  end if;

  insert into public.chat_conversation_summaries (
    owner_user_id,
    peer_user_id,
    last_message_id,
    last_message_text,
    last_message_created_at,
    last_message_sender_id,
    last_message_receiver_id,
    last_message_is_read,
    last_message_delivered_at,
    last_message_type,
    last_message_is_view_once,
    last_message_deleted_for_all,
    last_message_edited_at,
    last_message_reaction_emoji,
    last_message_reaction_user_id,
    last_message_reaction_created_at,
    last_message_reaction_target_type,
    last_activity_kind,
    last_activity_message_id,
    last_activity_preview,
    last_activity_at,
    unread_count,
    updated_at
  )
  values (
    p_owner_user_id,
    p_peer_user_id,
    v_summary.last_message_id,
    v_summary.last_message_text,
    v_summary.last_message_created_at,
    v_summary.last_message_sender_id,
    v_summary.last_message_receiver_id,
    v_summary.last_message_is_read,
    v_summary.last_message_delivered_at,
    v_summary.last_message_type,
    v_summary.last_message_is_view_once,
    v_summary.last_message_deleted_for_all,
    v_summary.last_message_edited_at,
    v_summary.last_message_reaction_emoji,
    v_summary.last_message_reaction_user_id,
    v_summary.last_message_reaction_created_at,
    v_summary.last_message_reaction_target_type,
    v_summary.last_activity_kind,
    v_summary.last_activity_message_id,
    v_summary.last_activity_preview,
    v_summary.last_activity_at,
    v_summary.unread_count,
    timezone('utc'::text, now())
  )
  on conflict (owner_user_id, peer_user_id) do update
  set last_message_id = excluded.last_message_id,
      last_message_text = excluded.last_message_text,
      last_message_created_at = excluded.last_message_created_at,
      last_message_sender_id = excluded.last_message_sender_id,
      last_message_receiver_id = excluded.last_message_receiver_id,
      last_message_is_read = excluded.last_message_is_read,
      last_message_delivered_at = excluded.last_message_delivered_at,
      last_message_type = excluded.last_message_type,
      last_message_is_view_once = excluded.last_message_is_view_once,
      last_message_deleted_for_all = excluded.last_message_deleted_for_all,
      last_message_edited_at = excluded.last_message_edited_at,
      last_message_reaction_emoji = excluded.last_message_reaction_emoji,
      last_message_reaction_user_id = excluded.last_message_reaction_user_id,
      last_message_reaction_created_at = excluded.last_message_reaction_created_at,
      last_message_reaction_target_type = excluded.last_message_reaction_target_type,
      last_activity_kind = excluded.last_activity_kind,
      last_activity_message_id = excluded.last_activity_message_id,
      last_activity_preview = excluded.last_activity_preview,
      last_activity_at = excluded.last_activity_at,
      unread_count = excluded.unread_count,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.refresh_chat_conversation_summary(uuid, uuid) from public;

create or replace function public.trg_refresh_chat_conversation_summary_from_messages()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_sender uuid := coalesce(new.sender_id, old.sender_id);
  v_receiver uuid := coalesce(new.receiver_id, old.receiver_id);
begin
  if v_sender is not null and v_receiver is not null then
    perform public.refresh_chat_conversation_summary(v_sender, v_receiver);
    perform public.refresh_chat_conversation_summary(v_receiver, v_sender);
  end if;
  return null;
end;
$$;

revoke all on function public.trg_refresh_chat_conversation_summary_from_messages() from public;

drop trigger if exists refresh_chat_conversation_summary_from_messages on public.messages;
create trigger refresh_chat_conversation_summary_from_messages
after insert or update or delete on public.messages
for each row
execute function public.trg_refresh_chat_conversation_summary_from_messages();

create or replace function public.trg_refresh_chat_conversation_summary_from_reactions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message_id uuid := coalesce(new.message_id, old.message_id);
  v_sender uuid;
  v_receiver uuid;
begin
  if v_message_id is null then
    return null;
  end if;

  select m.sender_id, m.receiver_id
    into v_sender, v_receiver
  from public.messages m
  where m.id = v_message_id
  limit 1;

  if v_sender is not null and v_receiver is not null then
    perform public.refresh_chat_conversation_summary(v_sender, v_receiver);
    perform public.refresh_chat_conversation_summary(v_receiver, v_sender);
  end if;
  return null;
end;
$$;

revoke all on function public.trg_refresh_chat_conversation_summary_from_reactions() from public;

drop trigger if exists refresh_chat_conversation_summary_from_reactions on public.message_reactions;
create trigger refresh_chat_conversation_summary_from_reactions
after insert or update or delete on public.message_reactions
for each row
execute function public.trg_refresh_chat_conversation_summary_from_reactions();

create or replace function public.trg_refresh_chat_conversation_summary_from_hides()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid := coalesce(new.user_id, old.user_id);
  v_peer uuid := coalesce(new.peer_id, old.peer_id);
begin
  if v_owner is not null and v_peer is not null then
    perform public.refresh_chat_conversation_summary(v_owner, v_peer);
  end if;
  return null;
end;
$$;

revoke all on function public.trg_refresh_chat_conversation_summary_from_hides() from public;

drop trigger if exists refresh_chat_conversation_summary_from_hides on public.message_hides;
create trigger refresh_chat_conversation_summary_from_hides
after insert or delete on public.message_hides
for each row
execute function public.trg_refresh_chat_conversation_summary_from_hides();

truncate table public.chat_conversation_summaries;

with owner_visible_messages as (
  select
    m.sender_id as owner_user_id,
    m.receiver_id as peer_user_id,
    m.id,
    m.text,
    m.created_at,
    m.sender_id,
    m.receiver_id,
    m.is_read,
    m.delivered_at,
    coalesce(m.message_type, 'text') as message_type,
    coalesce(m.is_view_once, false) as is_view_once,
    coalesce(m.deleted_for_all, false) as deleted_for_all,
    m.edited_at
  from public.messages m
  left join public.message_hides mh
    on mh.message_id = m.id
   and mh.user_id = m.sender_id
  where mh.message_id is null

  union all

  select
    m.receiver_id as owner_user_id,
    m.sender_id as peer_user_id,
    m.id,
    m.text,
    m.created_at,
    m.sender_id,
    m.receiver_id,
    m.is_read,
    m.delivered_at,
    coalesce(m.message_type, 'text') as message_type,
    coalesce(m.is_view_once, false) as is_view_once,
    coalesce(m.deleted_for_all, false) as deleted_for_all,
    m.edited_at
  from public.messages m
  left join public.message_hides mh
    on mh.message_id = m.id
   and mh.user_id = m.receiver_id
  where mh.message_id is null
),
ranked_messages as (
  select
    ovm.*,
    count(*) filter (
      where ovm.receiver_id = ovm.owner_user_id
        and ovm.is_read = false
    ) over (partition by ovm.owner_user_id, ovm.peer_user_id)::integer as unread_count,
    row_number() over (
      partition by ovm.owner_user_id, ovm.peer_user_id
      order by ovm.created_at desc, ovm.id desc
    ) as row_num
  from owner_visible_messages ovm
),
latest_message as (
  select *
  from ranked_messages
  where row_num = 1
),
latest_reaction as (
  select distinct on (lm.owner_user_id, lm.peer_user_id)
    lm.owner_user_id,
    lm.peer_user_id,
    mr.emoji,
    mr.user_id,
    mr.created_at,
    lm.message_type as target_type
  from latest_message lm
  join public.message_reactions mr
    on mr.message_id = lm.id
  order by lm.owner_user_id, lm.peer_user_id, mr.created_at desc, mr.id desc
),
activity_events as (
  select
    ovm.owner_user_id,
    ovm.peer_user_id,
    'edit'::text as activity_kind,
    ovm.id as activity_message_id,
    case ovm.message_type
      when 'image' then 'Edited: Photo'
      when 'video' then 'Edited: Video'
      when 'voice' then 'Edited: Voice message'
      when 'document' then 'Edited: Document'
      when 'location' then 'Edited: Location'
      when 'mood_sticker' then 'Edited: Sticker'
      else 'Edited: ' || coalesce(nullif(btrim(ovm.text), ''), 'Message')
    end as activity_preview,
    ovm.edited_at as activity_at
  from owner_visible_messages ovm
  where ovm.edited_at is not null

  union all

  select
    ovm.owner_user_id,
    ovm.peer_user_id,
    'reaction'::text as activity_kind,
    ovm.id as activity_message_id,
    case when mr.user_id = ovm.owner_user_id then 'You' else 'Someone' end ||
      ' reacted ' || mr.emoji || ' to ' ||
      case ovm.message_type
        when 'image' then 'photo'
        when 'video' then 'video'
        when 'voice' then 'voice note'
        when 'document' then 'document'
        when 'location' then 'location'
        when 'mood_sticker' then 'sticker'
        else 'message'
      end as activity_preview,
    mr.created_at as activity_at
  from owner_visible_messages ovm
  join public.message_reactions mr
    on mr.message_id = ovm.id
),
latest_activity as (
  select distinct on (ae.owner_user_id, ae.peer_user_id)
    ae.owner_user_id,
    ae.peer_user_id,
    ae.activity_kind,
    ae.activity_message_id,
    ae.activity_preview,
    ae.activity_at
  from activity_events ae
  order by ae.owner_user_id, ae.peer_user_id, ae.activity_at desc, ae.activity_message_id desc, ae.activity_kind desc
)
insert into public.chat_conversation_summaries (
  owner_user_id,
  peer_user_id,
  last_message_id,
  last_message_text,
  last_message_created_at,
  last_message_sender_id,
  last_message_receiver_id,
  last_message_is_read,
  last_message_delivered_at,
  last_message_type,
  last_message_is_view_once,
  last_message_deleted_for_all,
  last_message_edited_at,
  last_message_reaction_emoji,
  last_message_reaction_user_id,
  last_message_reaction_created_at,
  last_message_reaction_target_type,
  last_activity_kind,
  last_activity_message_id,
  last_activity_preview,
  last_activity_at,
  unread_count,
  updated_at
)
select
  lm.owner_user_id,
  lm.peer_user_id,
  lm.id,
  lm.text,
  lm.created_at,
  lm.sender_id,
  lm.receiver_id,
  lm.is_read,
  lm.delivered_at,
  lm.message_type,
  lm.is_view_once,
  lm.deleted_for_all,
  lm.edited_at,
  lr.emoji,
  lr.user_id,
  lr.created_at,
  lr.target_type,
  la.activity_kind,
  la.activity_message_id,
  la.activity_preview,
  la.activity_at,
  greatest(coalesce(lm.unread_count, 0), 0),
  timezone('utc'::text, now())
from latest_message lm
left join latest_reaction lr
  on lr.owner_user_id = lm.owner_user_id
 and lr.peer_user_id = lm.peer_user_id
left join latest_activity la
  on la.owner_user_id = lm.owner_user_id
 and la.peer_user_id = lm.peer_user_id;

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
  last_message_edited_at timestamptz,
  last_message_reaction_emoji text,
  last_message_reaction_user_id uuid,
  last_message_reaction_created_at timestamptz,
  last_message_reaction_target_type text,
  last_activity_kind text,
  last_activity_message_id uuid,
  last_activity_preview text,
  last_activity_at timestamptz,
  unread_count integer
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select
    s.peer_user_id as other_user_id,
    s.last_message_id,
    s.last_message_text,
    s.last_message_created_at,
    s.last_message_sender_id,
    s.last_message_receiver_id,
    s.last_message_is_read,
    s.last_message_delivered_at,
    s.last_message_type,
    s.last_message_is_view_once,
    s.last_message_deleted_for_all,
    s.last_message_edited_at,
    s.last_message_reaction_emoji,
    s.last_message_reaction_user_id,
    s.last_message_reaction_created_at,
    s.last_message_reaction_target_type,
    s.last_activity_kind,
    s.last_activity_message_id,
    s.last_activity_preview,
    s.last_activity_at,
    s.unread_count
  from public.chat_conversation_summaries s
  where auth.uid() is not null
    and s.owner_user_id = auth.uid()
  order by s.last_message_created_at desc nulls last, s.last_message_id desc nulls last
  limit greatest(1, least(coalesce(p_limit, 200), 500))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.rpc_get_chat_conversation_summaries(integer, integer) from public;
grant execute on function public.rpc_get_chat_conversation_summaries(integer, integer) to authenticated;
