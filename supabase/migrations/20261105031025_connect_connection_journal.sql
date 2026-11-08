-- Connection Journal: additive participant-only read model; no calling activation.
-- Existing canonical sessions, operational cleanup and consent remain authoritative.
begin;

create index connect_journal_caller_peer_idx on private.connect_sessions(caller_user_id,recipient_user_id,created_at desc,id desc);
create index connect_journal_recipient_peer_idx on private.connect_sessions(recipient_user_id,caller_user_id,created_at desc,id desc);

-- Personal chat deletion is independent of canonical call/cleanup retention.
create table private.connect_journal_chat_hides (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  peer_user_id uuid not null references auth.users(id) on delete cascade,
  hidden_before timestamptz not null,
  primary key(owner_user_id,peer_user_id),check(owner_user_id<>peer_user_id)
);
alter table private.connect_journal_chat_hides enable row level security;
revoke all on private.connect_journal_chat_hides from public,anon,authenticated,service_role;
insert into private.connect_journal_chat_hides select user_id,peer_user_id,clock_timestamp() from public.peer_visibility_prefs where hidden;
create function private.connect_journal_hide_chat() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.hidden then
    insert into private.connect_journal_chat_hides values(new.user_id,new.peer_user_id,clock_timestamp())
    on conflict(owner_user_id,peer_user_id) do update set hidden_before=greatest(private.connect_journal_chat_hides.hidden_before,excluded.hidden_before);
  end if;
  return null;
end $$;
create trigger connect_journal_hide_chat after insert or update of hidden on public.peer_visibility_prefs for each row execute function private.connect_journal_hide_chat();

create function private.connect_journal_entry(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; peer_id uuid; peer_profile uuid; p public.profiles; available boolean; hidden boolean; blocked boolean;
begin
  select * into s from private.connect_sessions where id=p_id;
  if s.id is null or auth.uid() is null or auth.uid() not in(s.caller_user_id,s.recipient_user_id) then return null; end if;
  peer_id:=case when auth.uid()=s.caller_user_id then s.recipient_user_id else s.caller_user_id end;
  peer_profile:=case when auth.uid()=s.caller_user_id then s.recipient_profile_id else s.caller_profile_id end;
  select * into p from public.profiles where id=peer_profile and user_id=peer_id;
  blocked:=exists(select 1 from public.blocks b where (b.blocker_id=auth.uid() and b.blocked_id=peer_id) or (b.blocker_id=peer_id and b.blocked_id=auth.uid()));
  available:=not blocked and coalesce(public.can_users_chat(auth.uid(),peer_id),false);
  hidden:=exists(select 1 from public.peer_visibility_prefs v where v.user_id=auth.uid() and v.peer_user_id=peer_id and v.hidden);
  return jsonb_build_object('call',private.connect_snapshot(s.id),
    'redialAllowed',available and coalesce(private.connect_enabled(s.media,'matched') and private.connect_authorized(
      case when auth.uid()=s.caller_user_id then s.caller_profile_id else s.recipient_profile_id end,peer_profile,s.media,'matched',null),false),
    'direction',case when auth.uid()=s.caller_user_id then 'outgoing' else 'incoming' end,
    'peer',jsonb_build_object('profileId',peer_profile,'userId',peer_id,
      'name',case when available then left(coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'Your connection'),120) else 'Unavailable contact' end,
      'avatar',case when available then p.avatar_url else null end,'available',available,'blocked',blocked,
      'chatHiddenBefore',(select h.hidden_before from private.connect_journal_chat_hides h where h.owner_user_id=auth.uid() and h.peer_user_id=peer_id),
      'chatVisible',available and not hidden
        and not exists(select 1 from private.connect_journal_chat_hides h where h.owner_user_id=auth.uid() and h.peer_user_id=peer_id and s.created_at<=h.hidden_before)),
    'cleanup',case when exists(select 1 from private.connect_provider_jobs j where j.call_id=s.id and j.operation='end' and j.status<>'done') then 'pending'
      when exists(select 1 from private.connect_provider_jobs j where j.call_id=s.id and j.operation='end' and j.status='done') then 'acknowledged' else 'not_applicable' end);
end $$;

create function public.rpc_connect_journal(p_query jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); lim integer:=coalesce((p_query->>'limit')::integer,30);
  peer uuid:=(p_query->>'peer_user_id')::uuid; call_id uuid:=(p_query->>'call_id')::uuid;
  before_at timestamptz:=(p_query->>'before')::timestamptz; before_id uuid:=(p_query->>'before_id')::uuid;
  from_at timestamptz:=(p_query->>'from')::timestamptz; to_at timestamptz:=(p_query->>'to')::timestamptz;
  scope text:=coalesce(p_query->>'scope','history'); filter text:=coalesce(p_query->>'filter','all'); direction text:=coalesce(p_query->>'direction','all');
  outcome text:=coalesce(p_query->>'outcome','all');
  search text:=btrim(coalesce(p_query->>'search','')); result jsonb; last_row jsonb;
begin
  perform private.connect_actor();
  if p_query is null or jsonb_typeof(p_query)<>'object' or lim not between 1 and 50 or length(search)>80
    or scope not in('history','chat') or filter not in('all','missed','voice','video') or direction not in('all','incoming','outgoing')
    or outcome not in('all','ended','declined','cancelled','interrupted','failed')
    or (scope='chat' and peer is null) or (before_at is null)<>(before_id is null) or (from_at is not null and to_at is not null and from_at>=to_at)
    or exists(select 1 from jsonb_object_keys(p_query) k where k not in('limit','peer_user_id','call_id','before','before_id','from','to','scope','filter','direction','outcome','search'))
    then raise exception using errcode='22023',message='connect_journal_invalid'; end if;
  -- UNION ALL preserves both role-specific history indexes. The actor is never a client argument.
  with owned as (
    select s.* from private.connect_sessions s where s.caller_user_id=actor and (peer is null or s.recipient_user_id=peer)
    union all
    select s.* from private.connect_sessions s where s.recipient_user_id=actor and (peer is null or s.caller_user_id=peer)
  ), selected as (
    select s.*,private.connect_journal_entry(s.id) as entry from owned s
    where (call_id is null or s.id=call_id) and (before_at is null or (s.created_at,s.id)<(before_at,before_id))
      and (from_at is null or s.created_at>=from_at) and (to_at is null or s.created_at<to_at)
      and (filter='all' or s.media=filter or (filter='missed' and s.state='MISSED' and s.recipient_user_id=actor))
      and (direction='all' or (direction='incoming' and s.recipient_user_id=actor) or (direction='outgoing' and s.caller_user_id=actor))
      and (outcome='all' or (outcome='declined' and s.state='DECLINED') or (outcome='cancelled' and s.state='CANCELLED')
        or (outcome='failed' and s.state='FAILED' and s.connected_at is null)
        or (outcome='interrupted' and s.connected_at is not null and (s.state='FAILED' or (s.state='ENDED' and s.reason in('deadline_expired','provider_session_changed','provider_membership_invalid','provider_unavailable','eligibility_revoked','consent_revoked','device_revoked','connection_failed','interrupted'))))
        or (outcome='ended' and s.state='ENDED' and s.connected_at is not null and coalesce(s.reason,'') not in('blocked','deadline_expired','provider_session_changed','provider_membership_invalid','provider_unavailable','eligibility_revoked','consent_revoked','device_revoked','connection_failed','interrupted')))
  ), visible as (
    select * from selected where (scope='history' or (entry->'peer'->>'chatVisible')::boolean)
      and (search='' or position(lower(search) in lower(entry->'peer'->>'name'))>0)
    order by created_at desc,id desc limit lim+1
  ) select coalesce(jsonb_agg(entry order by created_at desc,id desc),'[]'::jsonb) into result from visible;
  if jsonb_array_length(result)>lim then
    result:=result - lim; last_row:=result->(lim-1);
    return jsonb_build_object('items',result,'next_cursor',jsonb_build_object('at',last_row->'call'->>'created_at','id',last_row->'call'->>'id'));
  end if;
  return jsonb_build_object('items',result,'next_cursor',null);
end $$;

create function public.rpc_connect_journal_previews(p_peers uuid[]) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  perform private.connect_actor();
  if p_peers is null or cardinality(p_peers)>200 then raise exception using errcode='22023',message='connect_journal_invalid'; end if;
  with peers as (select distinct unnest(p_peers) as peer), latest as (
    select c.* from peers p cross join lateral (
      select x.* from (
        (select s.* from private.connect_sessions s where s.caller_user_id=actor and s.recipient_user_id=p.peer order by s.created_at desc,s.id desc limit 1)
        union all
        (select s.* from private.connect_sessions s where s.recipient_user_id=actor and s.caller_user_id=p.peer order by s.created_at desc,s.id desc limit 1)
      ) x order by x.created_at desc,x.id desc limit 1
    ) c
  ), projected as (select private.connect_journal_entry(l.id) as entry from latest l)
  select coalesce(jsonb_agg(entry),'[]'::jsonb) into result from projected where (entry->'peer'->>'chatVisible')::boolean;
  return result;
end $$;

-- Invalidation only, on the existing authorised user chat channel. No raw private rows.
create function private.connect_journal_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; c private.connect_sessions;
begin
  if tg_op='UPDATE' and new.version=old.version then return null; end if;
  if tg_op='DELETE' then c:=old; else c:=new; end if;
  foreach target in array array[c.caller_user_id,c.recipient_user_id] loop
    perform realtime.send(jsonb_build_object('call_id',c.id,'version',c.version+case when tg_op='DELETE' then 1 else 0 end,'deleted',tg_op='DELETE'),'CONNECT_JOURNAL','user:'||target::text||':chat',true);
  end loop;
  return null;
exception when others then
  -- Delivery is a hint, with foreground reconciliation as fallback. A realtime
  -- outage must never roll back an authoritative call transition or cleanup.
  return null;
end $$;
create trigger connect_journal_changed after insert or update of version or delete on private.connect_sessions for each row execute function private.connect_journal_changed();

revoke all on function private.connect_journal_entry(uuid),private.connect_journal_changed(),private.connect_journal_hide_chat() from public,anon,authenticated,service_role;
revoke all on function public.rpc_connect_journal(jsonb),public.rpc_connect_journal_previews(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_journal(jsonb),public.rpc_connect_journal_previews(uuid[]) to authenticated;
commit;
