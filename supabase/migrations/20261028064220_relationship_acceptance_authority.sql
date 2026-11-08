-- Relationship authority prerequisite only. No Connect runtime or rollout.
-- Existing ACCEPTED labels are preserved; only new independent evidence can
-- establish authoritative mutual acceptance. No historical status backfill.

begin;

create table private.relationship_consent_decisions (
  source_type text not null check (source_type in ('intent','signal','swipe','live_spark','reconfirmation')),
  source_key text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  peer_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  decided_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  evidence_kind text not null default 'authenticated_action',
  primary key (source_type,source_key,actor_profile_id),
  check (actor_profile_id <> peer_profile_id)
);
create index relationship_consent_pair_idx on private.relationship_consent_decisions(actor_profile_id,peer_profile_id);

create table private.relationship_acceptance_proofs (
  match_id uuid primary key references public.matches(id) on delete cascade deferrable initially deferred,
  profile_a_id uuid not null references public.profiles(id) on delete cascade,
  profile_b_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  verified_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  check (profile_a_id < profile_b_id)
);
create index relationship_proof_pair_idx on private.relationship_acceptance_proofs(profile_a_id,profile_b_id);

-- Durable revocation watermark prevents old source rows being reimported after
-- block/unblock, rejection, or withdrawal. It is not another relationship store.
create table private.relationship_consent_revocations (
  profile_a_id uuid not null references public.profiles(id) on delete cascade,
  profile_b_id uuid not null references public.profiles(id) on delete cascade,
  revoked_at timestamptz not null default clock_timestamp(),
  primary key (profile_a_id,profile_b_id),
  check (profile_a_id < profile_b_id)
);

-- Only the reviewed account-merge wrapper can populate these transaction-bound
-- copy permits. They preserve legacy labels but NEVER create consent evidence.
create table private.relationship_legacy_merge_permits (
  transaction_id bigint not null,
  profile_a_id uuid not null,
  profile_b_id uuid not null,
  allow_accepted boolean not null default false,
  primary key(transaction_id,profile_a_id,profile_b_id)
);
alter table private.relationship_consent_decisions enable row level security;
alter table private.relationship_acceptance_proofs enable row level security;
alter table private.relationship_consent_revocations enable row level security;
alter table private.relationship_legacy_merge_permits enable row level security;
revoke all on private.relationship_consent_decisions, private.relationship_acceptance_proofs,
  private.relationship_consent_revocations, private.relationship_legacy_merge_permits
  from public, anon, authenticated, service_role;

create function private.relationship_lock_pair(p_a uuid,p_b uuid)
returns void language sql set search_path=pg_catalog as $$
  select pg_advisory_xact_lock(hashtextextended(least(p_a::text,p_b::text)||'|'||greatest(p_a::text,p_b::text),0));
$$;

create function private.relationship_pair_available(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select p_a <> p_b and exists (
    select 1 from public.profiles a join public.profiles b on b.id=p_b
    join auth.users au on au.id=a.user_id join auth.users bu on bu.id=b.user_id
    where a.id=p_a and a.user_id <> b.user_id
      and a.deleted_at is null and b.deleted_at is null
      and a.is_active is true and b.is_active is true
      and a.account_state='active' and b.account_state='active'
      and a.identity_status='active' and b.identity_status='active'
      and a.profile_moderation_state='CLEAR' and b.profile_moderation_state='CLEAR'
      and au.deleted_at is null and bu.deleted_at is null
      and not coalesce(au.is_anonymous,false) and not coalesce(bu.is_anonymous,false)
      and (au.banned_until is null or au.banned_until <= statement_timestamp())
      and (bu.banned_until is null or bu.banned_until <= statement_timestamp())
      and not exists (select 1 from public.blocks x where
        (x.blocker_id=a.user_id and x.blocked_id=b.user_id) or
        (x.blocker_id=b.user_id and x.blocked_id=a.user_id))
  );
$$;

create function private.relationship_revoke_pair(p_a uuid,p_b uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.relationship_lock_pair(p_a,p_b);
  insert into private.relationship_consent_revocations(profile_a_id,profile_b_id)
    values(least(p_a,p_b),greatest(p_a,p_b))
    on conflict(profile_a_id,profile_b_id) do update set revoked_at=clock_timestamp();
  update private.relationship_consent_decisions set revoked_at=clock_timestamp()
    where revoked_at is null and ((actor_profile_id=p_a and peer_profile_id=p_b) or
      (actor_profile_id=p_b and peer_profile_id=p_a));
  update private.relationship_acceptance_proofs set revoked_at=clock_timestamp()
    where profile_a_id=least(p_a,p_b) and profile_b_id=greatest(p_a,p_b) and revoked_at is null;
end;
$$;

create function private.relationship_record_decision(p_actor uuid,p_peer uuid,p_type text,p_key text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_user uuid;
begin
  select user_id into v_user from public.profiles where id=p_actor;
  if auth.uid() is null or auth.uid() is distinct from v_user then
    raise exception 'relationship_actor_forbidden' using errcode='42501';
  end if;
  perform private.relationship_lock_pair(p_actor,p_peer);
  if not private.relationship_pair_available(p_actor,p_peer) then
    raise exception 'relationship_unavailable' using errcode='42501';
  end if;
  insert into private.relationship_consent_decisions(source_type,source_key,actor_profile_id,peer_profile_id,actor_user_id)
  values(p_type,p_key,p_actor,p_peer,v_user)
  on conflict(source_type,source_key,actor_profile_id) do update
    set decided_at=case when private.relationship_consent_decisions.revoked_at is not null
      then clock_timestamp() else private.relationship_consent_decisions.decided_at end,
      revoked_at=null, evidence_kind='authenticated_action';
end;
$$;

create function private.relationship_has_two_decisions(p_a uuid,p_b uuid,p_type text,p_key text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select count(*)=2 from private.relationship_consent_decisions d
  join public.profiles p on p.id=d.actor_profile_id and p.user_id=d.actor_user_id
  where d.source_type=p_type and d.source_key=p_key and d.revoked_at is null
    and ((d.actor_profile_id=p_a and d.peer_profile_id=p_b) or
      (d.actor_profile_id=p_b and d.peer_profile_id=p_a));
$$;

create function private.relationship_has_proof(p_id uuid,p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from private.relationship_acceptance_proofs v
    where v.match_id=p_id and v.profile_a_id=least(p_a,p_b) and v.profile_b_id=greatest(p_a,p_b)
      and v.revoked_at is null
      and private.relationship_has_two_decisions(p_a,p_b,v.source_type,v.source_key));
$$;

create function private.relationship_finish_acceptance(p_a uuid,p_b uuid,p_type text,p_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_match public.matches; v_id uuid;
begin
  perform private.relationship_lock_pair(p_a,p_b);
  if not private.relationship_pair_available(p_a,p_b) then
    raise exception 'relationship_unavailable' using errcode='42501';
  end if;
  select * into v_match from public.matches where
    (user1_id=p_a and user2_id=p_b) or (user1_id=p_b and user2_id=p_a) for update;
  if v_match.status='REJECTED' then
    raise exception 'relationship_rejected' using errcode='42501';
  end if;
  if not private.relationship_has_two_decisions(p_a,p_b,p_type,p_key) then
    return null;
  end if;
  v_id:=coalesce(v_match.id,gen_random_uuid());
  insert into private.relationship_acceptance_proofs(match_id,profile_a_id,profile_b_id,source_type,source_key)
    values(v_id,least(p_a,p_b),greatest(p_a,p_b),p_type,p_key)
    on conflict(match_id) do update set source_type=excluded.source_type, source_key=excluded.source_key,
      verified_at=clock_timestamp(), revoked_at=null;
  if v_match.id is null then
    insert into public.matches(id,user1_id,user2_id,status)
      values(v_id,least(p_a,p_b),greatest(p_a,p_b),'ACCEPTED');
  elsif v_match.status <> 'ACCEPTED' then
    update public.matches set status='ACCEPTED',updated_at=clock_timestamp() where id=v_id;
  end if;
  return v_id;
end;
$$;

create function private.relationship_guard_match()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.relationship_lock_pair(new.user1_id,new.user2_id);
  if tg_op='UPDATE' and (new.id,new.user1_id,new.user2_id) is distinct from (old.id,old.user1_id,old.user2_id) then
    raise exception 'relationship_identity_immutable' using errcode='42501';
  end if;
  if new.status='ACCEPTED' and (tg_op='INSERT' or old.status is distinct from 'ACCEPTED') then
    if not (private.relationship_pair_available(new.user1_id,new.user2_id)
      and private.relationship_has_proof(new.id,new.user1_id,new.user2_id)) then
      if not exists(select 1 from private.relationship_legacy_merge_permits x
        where x.transaction_id=txid_current() and x.allow_accepted and x.profile_a_id=least(new.user1_id,new.user2_id)
          and x.profile_b_id=greatest(new.user1_id,new.user2_id)) then
        raise exception 'relationship_mutual_consent_required' using errcode='42501';
      end if;
    end if;
    if tg_op='UPDATE' and old.status='REJECTED' then
      raise exception 'relationship_rejected' using errcode='42501';
    end if;
  end if;
  if new.status='REJECTED' and (tg_op='INSERT' or old.status is distinct from 'REJECTED') then
    perform private.relationship_revoke_pair(new.user1_id,new.user2_id);
  end if;
  return new;
end;
$$;
create trigger relationship_acceptance_guard before insert or update on public.matches
for each row execute function private.relationship_guard_match();
drop policy if exists "Matches insert by participants" on public.matches;
drop policy if exists "Matches update by participants" on public.matches;
revoke insert,update,delete,truncate,references,trigger on public.matches from public,anon,authenticated;
grant select on public.matches to authenticated;

-- Protect sender identity/source shape even inside privileged legacy writers.
create function private.relationship_guard_source()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_a uuid; v_b uuid; v_merge boolean;
begin
  if tg_table_name='intent_requests' then v_a:=new.actor_id; v_b:=new.recipient_id;
  elsif tg_table_name='swipes' then v_a:=new.swiper_id; v_b:=new.target_id;
  else v_a:=new.sender_profile_id; v_b:=new.receiver_profile_id; end if;
  -- UPDATE already holds a source-row lock. Authoritative RPCs take the pair
  -- lock before that row; do not invert their order for seen/expiry updates.
  if tg_op='INSERT' then perform private.relationship_lock_pair(v_a,v_b); end if;
  select exists(select 1 from private.relationship_legacy_merge_permits x
    where x.transaction_id=txid_current() and x.profile_a_id=least(v_a,v_b) and x.profile_b_id=greatest(v_a,v_b)) into v_merge;
  if tg_table_name='intent_requests' then
    if tg_op='INSERT' and new.status <> 'pending' and not v_merge then
      raise exception 'relationship_request_must_start_pending' using errcode='42501';
    end if;
    if tg_op='UPDATE' and (new.id,new.actor_id,new.recipient_id,new.created_at,new.expires_at) is distinct from
      (old.id,old.actor_id,old.recipient_id,old.created_at,old.expires_at) and not v_merge then
      raise exception 'relationship_source_immutable' using errcode='42501';
    end if;
    if tg_op='UPDATE' and old.status in ('passed','expired','cancelled','matched') and new.status<>old.status and not v_merge then
      raise exception 'relationship_source_terminal' using errcode='42501';
    end if;
  elsif tg_table_name='swipes' then
    if tg_op='UPDATE' and (new.id,new.swiper_id,new.target_id) is distinct from (old.id,old.swiper_id,old.target_id) and not v_merge then
      raise exception 'relationship_source_immutable' using errcode='42501';
    end if;
  else
    if tg_op='UPDATE' and (new.id,new.sender_profile_id,new.receiver_profile_id,new.sender_user_id,new.receiver_user_id,
      new.created_at,new.expires_at) is distinct from
      (old.id,old.sender_profile_id,old.receiver_profile_id,old.sender_user_id,old.receiver_user_id,old.created_at,old.expires_at) and not v_merge then
      raise exception 'relationship_source_immutable' using errcode='42501';
    end if;
    if tg_op='INSERT' and new.status <> 'sent' and not v_merge then
      raise exception 'relationship_signal_must_start_sent' using errcode='42501';
    end if;
    if tg_op='UPDATE' and old.status in ('responded','expired','dismissed') and new.status<>old.status and not v_merge then
      raise exception 'relationship_source_terminal' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger relationship_intent_source_guard before insert or update on public.intent_requests
for each row execute function private.relationship_guard_source();
create trigger relationship_swipe_source_guard before insert or update on public.swipes
for each row execute function private.relationship_guard_source();
create trigger relationship_signal_source_guard before insert or update on public.profile_signal_gestures
for each row execute function private.relationship_guard_source();

create function private.relationship_capture_source()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_peer uuid; v_type text;
begin
  if tg_table_name='intent_requests' then v_actor:=new.actor_id; v_peer:=new.recipient_id; v_type:='intent';
  else v_actor:=new.sender_profile_id; v_peer:=new.receiver_profile_id; v_type:='signal'; end if;
  if exists(select 1 from private.relationship_legacy_merge_permits x where x.transaction_id=txid_current()
    and x.profile_a_id=least(v_actor,v_peer) and x.profile_b_id=greatest(v_actor,v_peer)) then return new; end if;
  if auth.uid()=(select user_id from public.profiles where id=v_actor)
    and private.relationship_pair_available(v_actor,v_peer) then
    perform private.relationship_record_decision(v_actor,v_peer,v_type,new.id::text);
  end if;
  return new;
end;
$$;
create trigger relationship_capture_intent after insert on public.intent_requests
for each row execute function private.relationship_capture_source();
create trigger relationship_capture_signal after insert on public.profile_signal_gestures
for each row execute function private.relationship_capture_source();

create or replace function public.handle_mutual_swipe()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_key text; v_peer_user uuid;
begin
  if tg_op='UPDATE' and new.action is not distinct from old.action then return new; end if;
  if auth.uid() is distinct from (select user_id from public.profiles where id=new.swiper_id) then
    -- Administrative historical copies are not fresh participant decisions.
    return new;
  end if;
  perform private.relationship_lock_pair(new.swiper_id,new.target_id);
  if exists(select 1 from private.relationship_legacy_merge_permits x where x.transaction_id=txid_current()
    and x.profile_a_id=least(new.swiper_id,new.target_id) and x.profile_b_id=greatest(new.swiper_id,new.target_id)) then return new; end if;
  if new.action not in ('LIKE','SUPERLIKE') then
    perform private.relationship_revoke_pair(new.swiper_id,new.target_id);
    return new;
  end if;
  v_key:=least(new.swiper_id::text,new.target_id::text)||'|'||greatest(new.swiper_id::text,new.target_id::text);
  perform private.relationship_record_decision(new.swiper_id,new.target_id,'swipe',v_key);
  -- A pre-existing peer swipe is independent sender-owned evidence, unlike an
  -- ACCEPTED label. Import it only before ANY pair revocation. Later recovery
  -- requires fresh actions from both users, never old likes after unblock.
  if not exists(select 1 from private.relationship_consent_revocations where
      profile_a_id=least(new.swiper_id,new.target_id) and profile_b_id=greatest(new.swiper_id,new.target_id))
    and exists(select 1 from public.swipes where swiper_id=new.target_id and target_id=new.swiper_id
      and action in ('LIKE','SUPERLIKE')) then
    select user_id into v_peer_user from public.profiles where id=new.target_id;
    insert into private.relationship_consent_decisions(source_type,source_key,actor_profile_id,peer_profile_id,actor_user_id,evidence_kind)
      values('swipe',v_key,new.target_id,new.swiper_id,v_peer_user,'independent_swipe_row')
      on conflict do nothing;
  end if;
  if exists(select 1 from public.swipes where swiper_id=new.target_id and target_id=new.swiper_id and action in ('LIKE','SUPERLIKE')) then
    perform private.relationship_finish_acceptance(new.swiper_id,new.target_id,'swipe',v_key);
  end if;
  return new;
end;
$$;
revoke all on function public.handle_mutual_swipe() from public,anon,authenticated;

create or replace function public.rpc_decide_intent_request(p_request_id uuid,p_decision text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_request public.intent_requests; v_actor uuid; v_peer uuid; v_match uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('accept','pass') then
    raise exception 'intent_decision_invalid' using errcode='22023'; end if;
  select * into v_request from public.intent_requests where id=p_request_id;
  if v_request.id is null or auth.uid() is distinct from (select user_id from public.profiles where id=v_request.recipient_id) then
    raise exception 'intent_decision_forbidden' using errcode='42501'; end if;
  perform private.relationship_lock_pair(v_request.actor_id,v_request.recipient_id);
  select * into v_request from public.intent_requests where id=p_request_id for update;
  if not private.relationship_pair_available(v_request.actor_id,v_request.recipient_id) then
    raise exception 'relationship_unavailable' using errcode='42501'; end if;
  if v_request.status=(case when p_decision='accept' then 'accepted' else 'passed' end) then
    -- A replay can return its result; it cannot manufacture missing provenance.
    if p_decision='accept' and not exists(select 1 from private.relationship_consent_decisions
      where source_type='intent' and source_key=p_request_id::text and actor_profile_id=v_request.recipient_id and revoked_at is null) then
      raise exception 'relationship_reconfirmation_required' using errcode='42501'; end if;
    return p_request_id;
  end if;
  if v_request.status <> 'pending' or v_request.expires_at <= statement_timestamp() then
    raise exception 'intent_request_not_pending' using errcode='22023'; end if;
  if p_decision='pass' then
    update public.intent_requests set status='passed' where id=p_request_id;
    perform private.relationship_revoke_pair(v_request.actor_id,v_request.recipient_id);
    return p_request_id;
  end if;
  -- Sender-owned pending Intent records were immutable to recipients even in
  -- the old schema. A current, authenticated recipient decision can verify this
  -- source; old ACCEPTED/matched/auto-closed labels are never imported.
  if exists(select 1 from private.relationship_consent_revocations r where
    r.profile_a_id=least(v_request.actor_id,v_request.recipient_id) and r.profile_b_id=greatest(v_request.actor_id,v_request.recipient_id)
    and not exists(select 1 from private.relationship_consent_decisions d where
      d.source_type='intent' and d.source_key=p_request_id::text and d.actor_profile_id=v_request.actor_id
      and d.revoked_at is null and d.decided_at>r.revoked_at)) then
    raise exception 'intent_request_revoked' using errcode='42501'; end if;
  select user_id into v_actor from public.profiles where id=v_request.actor_id;
  insert into private.relationship_consent_decisions(source_type,source_key,actor_profile_id,peer_profile_id,actor_user_id,evidence_kind)
    values('intent',p_request_id::text,v_request.actor_id,v_request.recipient_id,v_actor,'independent_pending_request')
    on conflict do nothing;
  perform private.relationship_record_decision(v_request.recipient_id,v_request.actor_id,'intent',p_request_id::text);
  -- Set the request first so match auto-closure cannot replace this decision.
  update public.intent_requests set status='accepted' where id=p_request_id;
  v_match:=private.relationship_finish_acceptance(v_request.actor_id,v_request.recipient_id,'intent',p_request_id::text);
  if v_match is null then raise exception 'relationship_mutual_consent_required' using errcode='42501'; end if;
  update public.intent_requests set status='passed' where id<>p_request_id and status='pending'
    and ((actor_id=v_request.actor_id and recipient_id=v_request.recipient_id) or
      (actor_id=v_request.recipient_id and recipient_id=v_request.actor_id));
  return p_request_id;
end;
$$;
revoke all on function public.rpc_decide_intent_request(uuid,text) from public,anon;
grant execute on function public.rpc_decide_intent_request(uuid,text) to authenticated;

create or replace function public.rpc_cancel_intent_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_request public.intent_requests;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_request from public.intent_requests where id=p_request_id;
  if v_request.id is null or auth.uid() is distinct from (select user_id from public.profiles where id=v_request.actor_id) then
    raise exception 'intent_cancel_forbidden' using errcode='42501'; end if;
  perform private.relationship_lock_pair(v_request.actor_id,v_request.recipient_id);
  select * into v_request from public.intent_requests where id=p_request_id for update;
  if v_request.status='cancelled' then return p_request_id; end if;
  if v_request.status<>'pending' then raise exception 'intent_request_not_pending' using errcode='22023'; end if;
  update public.intent_requests set status='cancelled' where id=p_request_id;
  perform private.relationship_revoke_pair(v_request.actor_id,v_request.recipient_id);
  return p_request_id;
end;
$$;

create or replace function public.rpc_cancel_signal(p_signal_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_signal public.profile_signal_gestures;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_signal from public.profile_signal_gestures where id=p_signal_id;
  if v_signal.id is null or auth.uid() is distinct from v_signal.sender_user_id or
    auth.uid() is distinct from (select user_id from public.profiles where id=v_signal.sender_profile_id) then
    raise exception 'signal_cancel_forbidden' using errcode='42501'; end if;
  perform private.relationship_lock_pair(v_signal.sender_profile_id,v_signal.receiver_profile_id);
  select * into v_signal from public.profile_signal_gestures where id=p_signal_id for update;
  if v_signal.status='dismissed' then return p_signal_id; end if;
  if v_signal.status not in ('sent','seen') then raise exception 'signal_not_pending' using errcode='22023'; end if;
  update public.profile_signal_gestures set status='dismissed',dismissed_at=clock_timestamp() where id=p_signal_id;
  perform private.relationship_revoke_pair(v_signal.sender_profile_id,v_signal.receiver_profile_id);
  return p_signal_id;
end;
$$;

-- Preserve creation rules/quotas while serializing creation with acceptance,
-- cancellation and blocks. These private implementations retain the reviewed
-- existing behavior; the public boundary derives/validates the actual actor.
do $migration$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.rpc_create_intent_request(uuid,text,text,timestamptz,text,jsonb)'::regprocedure);
  if position('CREATE OR REPLACE FUNCTION public.rpc_create_intent_request(' in v_definition)<>1 then
    raise exception 'relationship_intent_signature_changed'; end if;
  execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.rpc_create_intent_request(',
    'CREATE OR REPLACE FUNCTION private.relationship_create_intent_v1(');
  v_definition:=pg_get_functiondef('public.rpc_send_signal(uuid,text,text,text,uuid)'::regprocedure);
  if position('CREATE OR REPLACE FUNCTION public.rpc_send_signal(' in v_definition)<>1 then
    raise exception 'relationship_signal_signature_changed'; end if;
  execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.rpc_send_signal(',
    'CREATE OR REPLACE FUNCTION private.relationship_send_signal_v1(');
end;
$migration$;
revoke all on function private.relationship_create_intent_v1(uuid,text,text,timestamptz,text,jsonb),
  private.relationship_send_signal_v1(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
alter function private.relationship_create_intent_v1(uuid,text,text,timestamptz,text,jsonb)
  set search_path=pg_catalog,public,pg_temp;
alter function private.relationship_send_signal_v1(uuid,text,text,text,uuid)
  set search_path=pg_catalog,public,pg_temp;

create or replace function public.rpc_create_intent_request(p_recipient_id uuid,p_type text,p_message text default null,
  p_suggested_time timestamptz default null,p_suggested_place text default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_existing uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select id into v_actor from public.profiles where user_id=auth.uid();
  perform private.relationship_lock_pair(v_actor,p_recipient_id);
  if not private.relationship_pair_available(v_actor,p_recipient_id) then
    raise exception 'relationship_unavailable' using errcode='42501'; end if;
  select id into v_existing from public.intent_requests where actor_id=v_actor and recipient_id=p_recipient_id
    and type=p_type and status='pending' and expires_at>statement_timestamp()
    and message is not distinct from p_message and suggested_time is not distinct from p_suggested_time
    and suggested_place is not distinct from p_suggested_place and metadata=coalesce(p_metadata,'{}'::jsonb);
  if v_existing is not null then return v_existing; end if;
  return private.relationship_create_intent_v1(p_recipient_id,p_type,p_message,p_suggested_time,p_suggested_place,p_metadata);
end;
$$;

create or replace function public.rpc_send_signal(p_receiver_profile_id uuid,p_reason_key text,p_note text default null,
  p_source text default 'profile',p_source_moment_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select id into v_actor from public.profiles where user_id=auth.uid();
  perform private.relationship_lock_pair(v_actor,p_receiver_profile_id);
  if not private.relationship_pair_available(v_actor,p_receiver_profile_id) then
    raise exception 'relationship_unavailable' using errcode='42501'; end if;
  return private.relationship_send_signal_v1(p_receiver_profile_id,p_reason_key,p_note,p_source,p_source_moment_id);
end;
$$;
revoke all on function public.rpc_send_signal(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.rpc_send_signal(uuid,text,text,text,uuid) to authenticated;

create function public.rpc_accept_profile_signal(p_signal_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_signal public.profile_signal_gestures; v_match uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_signal from public.profile_signal_gestures where id=p_signal_id;
  if v_signal.id is null or auth.uid() is distinct from v_signal.receiver_user_id or
    auth.uid() is distinct from (select user_id from public.profiles where id=v_signal.receiver_profile_id) then
    raise exception 'signal_accept_forbidden' using errcode='42501'; end if;
  perform private.relationship_lock_pair(v_signal.sender_profile_id,v_signal.receiver_profile_id);
  select * into v_signal from public.profile_signal_gestures where id=p_signal_id for update;
  if not private.relationship_pair_available(v_signal.sender_profile_id,v_signal.receiver_profile_id) then
    raise exception 'relationship_unavailable' using errcode='42501'; end if;
  if v_signal.status='responded' then
    select m.id into v_match from public.matches m where m.status='ACCEPTED' and
      private.relationship_has_proof(m.id,v_signal.sender_profile_id,v_signal.receiver_profile_id)
      and exists(select 1 from private.relationship_acceptance_proofs where match_id=m.id and source_type='signal' and source_key=p_signal_id::text);
    if v_match is not null then return v_match; end if;
  end if;
  if v_signal.status not in ('sent','seen') or v_signal.expires_at <= statement_timestamp() then
    raise exception 'signal_not_pending' using errcode='22023'; end if;
  if not exists(select 1 from private.relationship_consent_decisions where source_type='signal' and source_key=p_signal_id::text
    and actor_profile_id=v_signal.sender_profile_id and peer_profile_id=v_signal.receiver_profile_id
    and actor_user_id=v_signal.sender_user_id and revoked_at is null) then
    -- Historical signal identities could previously be changed by receivers.
    raise exception 'relationship_reconfirmation_required' using errcode='42501'; end if;
  perform private.relationship_record_decision(v_signal.receiver_profile_id,v_signal.sender_profile_id,'signal',p_signal_id::text);
  v_match:=private.relationship_finish_acceptance(v_signal.sender_profile_id,v_signal.receiver_profile_id,'signal',p_signal_id::text);
  update public.profile_signal_gestures set status='responded',responded_at=clock_timestamp() where id=p_signal_id;
  return v_match;
end;
$$;
revoke all on function public.rpc_accept_profile_signal(uuid) from public,anon;
grant execute on function public.rpc_accept_profile_signal(uuid) to authenticated;
-- Keep seen/dismissed UX; immutable identity guards still apply to direct updates.

-- Private Spark already authenticates each response and its table has no client
-- write grants. Capture each user's actual continue action, then create proof
-- before the existing server workflow attempts its match INSERT/UPDATE.
create function private.relationship_capture_spark_exit()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_spark public.live_private_sparks; v_actor uuid; v_peer uuid;
begin
  select * into v_spark from public.live_private_sparks where id=new.private_spark_id;
  if auth.uid() is null or auth.uid() is distinct from new.user_id or
    new.session_id is distinct from v_spark.session_id or
    auth.uid() not in (v_spark.participant_a_user_id,v_spark.participant_b_user_id) then
    raise exception 'relationship_actor_forbidden' using errcode='42501'; end if;
  v_actor:=case when auth.uid()=v_spark.participant_a_user_id then v_spark.participant_a_profile_id else v_spark.participant_b_profile_id end;
  v_peer:=case when auth.uid()=v_spark.participant_a_user_id then v_spark.participant_b_profile_id else v_spark.participant_a_profile_id end;
  if new.decision='continue' then
    if v_spark.activated_at is null or v_spark.state not in ('ended','expired','terminated') then
      raise exception 'live_private_spark_exit_not_ready' using errcode='22023'; end if;
    perform private.relationship_record_decision(v_actor,v_peer,'live_spark',new.private_spark_id::text);
    insert into private.relationship_consent_decisions(source_type,source_key,actor_profile_id,peer_profile_id,actor_user_id,evidence_kind)
      select 'live_spark',new.private_spark_id::text,v_peer,v_actor,r.user_id,'protected_exit_response'
      from public.live_private_spark_exit_responses r
      where r.private_spark_id=new.private_spark_id and r.user_id<>auth.uid() and r.decision='continue'
        and r.user_id=(select user_id from public.profiles where id=v_peer)
        and not exists(select 1 from private.relationship_consent_revocations x where
          x.profile_a_id=least(v_actor,v_peer) and x.profile_b_id=greatest(v_actor,v_peer) and x.revoked_at>=r.responded_at)
      on conflict do nothing;
    perform private.relationship_finish_acceptance(v_actor,v_peer,'live_spark',new.private_spark_id::text);
  else perform private.relationship_revoke_pair(v_actor,v_peer); end if;
  return new;
end;
$$;
create trigger relationship_capture_spark_exit after insert on public.live_private_spark_exit_responses
for each row execute function private.relationship_capture_spark_exit();

create function private.relationship_block_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_a uuid; v_b uuid;
begin
  if tg_op='UPDATE' and (new.id,new.blocker_id,new.blocked_id) is distinct from (old.id,old.blocker_id,old.blocked_id) then
    raise exception 'relationship_block_identity_immutable' using errcode='42501'; end if;
  select id into v_a from public.profiles where user_id=new.blocker_id;
  select id into v_b from public.profiles where user_id=new.blocked_id;
  if v_a is not null and v_b is not null and v_a<>v_b then
    perform private.relationship_revoke_pair(v_a,v_b);
  end if;
  return new;
end;
$$;
create trigger relationship_block_guard before insert or update on public.blocks
for each row execute function private.relationship_block_guard();

create function public.rpc_get_accepted_relationship(p_peer_profile_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select id into v_actor from public.profiles where user_id=auth.uid();
  if not private.relationship_pair_available(v_actor,p_peer_profile_id) then
    raise exception 'relationship_unavailable' using errcode='42501'; end if;
  select id into v_id from public.matches where status='ACCEPTED' and
    ((user1_id=v_actor and user2_id=p_peer_profile_id) or (user2_id=v_actor and user1_id=p_peer_profile_id));
  if v_id is null then raise exception 'relationship_not_accepted' using errcode='42501'; end if;
  return v_id; -- Compatibility read only. This does NOT certify provenance.
end;
$$;

create function public.rpc_is_relationship_mutually_verified(p_peer_profile_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select auth.uid() is not null and exists(select 1 from public.profiles p join public.matches m
    on (m.user1_id=p.id and m.user2_id=p_peer_profile_id) or (m.user2_id=p.id and m.user1_id=p_peer_profile_id)
    where p.user_id=auth.uid() and m.status='ACCEPTED'
      and private.relationship_pair_available(p.id,p_peer_profile_id)
      and private.relationship_has_proof(m.id,p.id,p_peer_profile_id));
$$;

create function public.rpc_reconfirm_relationship(p_peer_profile_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_id uuid; v_key text;
begin
  -- Reconfirmation is an explicit participant action, never called by a read,
  -- opening a chat, accepting unrelated UI, or a migration backfill.
  v_id:=public.rpc_get_accepted_relationship(p_peer_profile_id);
  select id into v_actor from public.profiles where user_id=auth.uid();
  perform private.relationship_lock_pair(v_actor,p_peer_profile_id);
  v_id:=public.rpc_get_accepted_relationship(p_peer_profile_id);
  v_key:=v_id::text;
  perform private.relationship_record_decision(v_actor,p_peer_profile_id,'reconfirmation',v_key);
  perform private.relationship_finish_acceptance(v_actor,p_peer_profile_id,'reconfirmation',v_key);
  return public.rpc_is_relationship_mutually_verified(p_peer_profile_id);
end;
$$;

create function public.rpc_reject_relationship(p_peer_profile_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select id into v_actor from public.profiles where user_id=auth.uid();
  if v_actor is null or p_peer_profile_id is null or v_actor=p_peer_profile_id then
    raise exception 'relationship_actor_forbidden' using errcode='42501'; end if;
  perform private.relationship_lock_pair(v_actor,p_peer_profile_id);
  update public.matches set status='REJECTED' where
    (user1_id=v_actor and user2_id=p_peer_profile_id) or (user2_id=v_actor and user1_id=p_peer_profile_id);
  perform private.relationship_revoke_pair(v_actor,p_peer_profile_id);
end;
$$;
revoke all on function public.rpc_get_accepted_relationship(uuid), public.rpc_is_relationship_mutually_verified(uuid),
  public.rpc_reconfirm_relationship(uuid),public.rpc_reject_relationship(uuid) from public,anon;
grant execute on function public.rpc_get_accepted_relationship(uuid), public.rpc_is_relationship_mutually_verified(uuid),
  public.rpc_reconfirm_relationship(uuid),public.rpc_reject_relationship(uuid) to authenticated;

-- Preserve the reviewed historical account-merge implementation behind a private
-- wrapper; only mappings of existing accepted records receive copy permission.
do $migration$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.rpc_admin_execute_account_merge_case(uuid)'::regprocedure);
  if position('CREATE OR REPLACE FUNCTION public.rpc_admin_execute_account_merge_case(' in v_definition)<>1 then
    raise exception 'relationship_merge_signature_changed'; end if;
  -- The legacy executor stages these enums as text in temporary tables. Give
  -- the restored relationship/swipe values explicit types; otherwise even an
  -- approved merge fails before it reaches the guarded match-copy boundary.
  if position('ranked.action,' in v_definition)=0 or
    not (v_definition ~ 'ranked\.user2_id,\s*ranked\.status,') then
    raise exception 'relationship_merge_projection_changed'; end if;
  v_definition:=replace(v_definition,'ranked.action,','ranked.action::public.swipe_action,');
  v_definition:=regexp_replace(v_definition,'(ranked\.user2_id,\s*)ranked\.status,',
    '\1ranked.status::public.match_status,','g');
  execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.rpc_admin_execute_account_merge_case(',
    'CREATE OR REPLACE FUNCTION private.relationship_execute_legacy_merge_v1(');
end;
$migration$;
revoke all on function private.relationship_execute_legacy_merge_v1(uuid) from public,anon,authenticated,service_role;
alter function private.relationship_execute_legacy_merge_v1(uuid)
  set search_path=pg_catalog,public,pg_temp;

create or replace function public.rpc_admin_execute_account_merge_case(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_case public.account_merge_cases; v_source uuid; v_target uuid; v_result jsonb;
begin
  if auth.uid() is null or not public.is_internal_admin() then
    raise exception 'admin access required' using errcode='42501'; end if;
  select * into v_case from public.account_merge_cases where id=p_case_id for update;
  if v_case.id is null or v_case.status not in ('approved','scheduled') then
    raise exception 'merge case must be approved before execution' using errcode='42501'; end if;
  select id into v_source from public.profiles where user_id=v_case.source_user_id;
  select id into v_target from public.profiles where user_id=v_case.target_user_id;
  if (v_case.source_profile_id is not null and v_case.source_profile_id is distinct from v_source) or
    (v_case.target_profile_id is not null and v_case.target_profile_id is distinct from v_target) then
    raise exception 'relationship_merge_identity_mismatch' using errcode='42501'; end if;
  if exists(select 1 from public.matches s join public.matches t on
    least(t.user1_id,t.user2_id)=least(case when s.user1_id=v_source then v_target else s.user1_id end,
      case when s.user2_id=v_source then v_target else s.user2_id end)
    and greatest(t.user1_id,t.user2_id)=greatest(case when s.user1_id=v_source then v_target else s.user1_id end,
      case when s.user2_id=v_source then v_target else s.user2_id end)
    where s.status='ACCEPTED' and (s.user1_id=v_source or s.user2_id=v_source) and t.status='REJECTED') then
    raise exception 'relationship_merge_rejection_conflict' using errcode='42501'; end if;
  insert into private.relationship_legacy_merge_permits(transaction_id,profile_a_id,profile_b_id,allow_accepted)
    select txid_current(),least(mapped_a,mapped_b),greatest(mapped_a,mapped_b),true from (
      select case when user1_id=v_source then v_target else user1_id end mapped_a,
        case when user2_id=v_source then v_target else user2_id end mapped_b
      from public.matches where status='ACCEPTED' and (user1_id in (v_source,v_target) or user2_id in (v_source,v_target))
    ) x where mapped_a <> mapped_b on conflict do nothing;
  insert into private.relationship_legacy_merge_permits(transaction_id,profile_a_id,profile_b_id)
    select distinct txid_current(),least(mapped_a,mapped_b),greatest(mapped_a,mapped_b) from (
      select case when actor_id=v_source then v_target else actor_id end mapped_a,
        case when recipient_id=v_source then v_target else recipient_id end mapped_b
      from public.intent_requests where actor_id=v_source or recipient_id=v_source
      union all
      select case when swiper_id=v_source then v_target else swiper_id end,
        case when target_id=v_source then v_target else target_id end
      from public.swipes where swiper_id=v_source or target_id=v_source
    ) x where mapped_a<>mapped_b on conflict do nothing;
  v_result:=private.relationship_execute_legacy_merge_v1(p_case_id);
  delete from private.relationship_legacy_merge_permits where transaction_id=txid_current();
  return v_result;
end;
$$;
revoke all on function public.rpc_admin_execute_account_merge_case(uuid) from public,anon;

-- Direct source INSERT is not needed: creation already goes through the
-- authenticated request RPC, and mirror/backfill triggers remain privileged.
drop policy if exists "Intent requests insert" on public.intent_requests;
revoke insert,update,delete on public.intent_requests from public,anon,authenticated;
revoke all on function public.rpc_create_intent_request(uuid,text,text,timestamptz,text,jsonb),
  public.rpc_cancel_intent_request(uuid),public.rpc_cancel_signal(uuid) from public,anon;
grant execute on function public.rpc_create_intent_request(uuid,text,text,timestamptz,text,jsonb),
  public.rpc_cancel_intent_request(uuid),public.rpc_cancel_signal(uuid) to authenticated;
revoke all on function public.rpc_backfill_swipe_likes_into_intent_requests(integer,integer),
  public.rpc_process_intent_request_jobs(interval,interval) from public,anon,authenticated;
grant execute on function public.rpc_backfill_swipe_likes_into_intent_requests(integer,integer),
  public.rpc_process_intent_request_jobs(interval,interval) to service_role;
revoke all on function public.rpc_mark_expired_intent_requests() from public,anon;
grant execute on function public.rpc_mark_expired_intent_requests() to authenticated;

-- Triggers do not require EXECUTE grants for invoking users. None of these
-- helpers is a public API, and custom GUCs/JWT role strings are not write permits.
revoke all on function private.relationship_lock_pair(uuid,uuid),private.relationship_pair_available(uuid,uuid),
  private.relationship_revoke_pair(uuid,uuid),private.relationship_record_decision(uuid,uuid,text,text),
  private.relationship_has_two_decisions(uuid,uuid,text,text),private.relationship_has_proof(uuid,uuid,uuid),
  private.relationship_finish_acceptance(uuid,uuid,text,text),private.relationship_guard_match(),
  private.relationship_guard_source(),private.relationship_capture_source(),private.relationship_capture_spark_exit(),
  private.relationship_block_guard() from public,anon,authenticated,service_role;

commit;
