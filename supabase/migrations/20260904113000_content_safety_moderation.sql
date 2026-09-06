-- Server-owned moderation for private messages and member-supplied images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moderation-quarantine',
  'moderation-quarantine',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.content_moderation_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  content_type text not null check (content_type in (
    'private_message', 'private_message_edit', 'profile_image', 'chat_image'
  )),
  content_id uuid,
  client_content_id text,
  storage_bucket text,
  storage_path text,
  decision text not null check (decision in ('ALLOW', 'BLOCK', 'REVIEW')),
  status text not null check (status in (
    'AUTO_CLOSED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'
  )),
  categories text[] not null default '{}',
  risk_score numeric(5,4) not null default 0 check (risk_score between 0 and 1),
  extracted_text text,
  evidence_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_snapshot) = 'object'),
  provider text not null,
  provider_model text not null,
  provider_request_id text,
  detector_version text not null default 'content-safety-v1',
  failure_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_outcome text check (review_outcome is null or review_outcome in ('APPROVE', 'REJECT')),
  review_notes text,
  constraint content_moderation_review_state_check check (
    (status = 'PENDING_REVIEW' and reviewed_at is null and reviewed_by is null and review_outcome is null)
    or (status = 'AUTO_CLOSED' and reviewed_at is null and reviewed_by is null and review_outcome is null)
    or (status in ('APPROVED', 'REJECTED') and reviewed_at is not null and reviewed_by is not null and review_outcome is not null)
  )
);

create index if not exists content_moderation_events_admin_queue_idx
  on public.content_moderation_events(status, created_at desc);
create index if not exists content_moderation_events_actor_recent_idx
  on public.content_moderation_events(actor_user_id, created_at desc);
create unique index if not exists content_moderation_events_idempotency_idx
  on public.content_moderation_events(actor_user_id, content_type, client_content_id)
  where client_content_id is not null;

alter table public.content_moderation_events enable row level security;
revoke all on table public.content_moderation_events from public, anon, authenticated;
grant select, insert, update, delete on table public.content_moderation_events to service_role;

create table if not exists public.content_safety_actor_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blocked_attempts integer not null default 0 check (blocked_attempts >= 0),
  review_attempts integer not null default 0 check (review_attempts >= 0),
  restricted_until timestamptz,
  last_incident_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.content_safety_actor_state enable row level security;
revoke all on table public.content_safety_actor_state from public, anon, authenticated;
grant select, insert, update, delete on table public.content_safety_actor_state to service_role;

create or replace function public.content_safety_assess_private_message(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := lower(regexp_replace(coalesce(p_text, ''), '[[:space:]_.-]+', ' ', 'g'));
  v_compact text := lower(regexp_replace(coalesce(p_text, ''), '[^a-zA-Z0-9+@]+', '', 'g'));
  v_phone boolean;
  v_platform boolean;
  v_redirect boolean;
  v_paid boolean;
  v_financial boolean;
  v_sexual_service boolean;
  v_threat boolean;
  v_categories text[] := '{}';
  v_decision text := 'ALLOW';
  v_risk numeric := 0;
begin
  v_phone := coalesce(p_text, '') ~* '(\+?[0-9][ ()\.-]*){7,15}';
  v_platform := v_text ~ '(signal|telegram|whatsapp|snapchat|instagram|insta |kik |wechat|onlyfans|fansly|cashapp|venmo|paypal)'
    or v_compact ~ '(onlyfans|telegram|whatsapp|snapchat|instagram|cashapp|venmo|paypal)';
  v_redirect := v_text ~ '(message|text|call|dm|reach|contact|find|add|follow|subscribe|join|ask) (me )?(on|at|via|how|for)'
    or v_text ~ '(off|away from|outside) (this|the) app';
  v_paid := v_text ~ '(subscribe|subscription|premium|exclusive|private content|private photo|paid content|membership|tip me|pay me|my rate|book me)';
  v_financial := v_text ~ '(send|wire|transfer|pay) (me )?(money|cash|crypto|bitcoin|btc|usdt)|gift card|investment opportunity|guaranteed return';
  v_sexual_service := v_text ~ '(escort|meet for cash|pay for sex|sexual service|full service|incall|outcall)';
  v_threat := v_text ~ '(i will|i''ll|gonna|going to) (kill|hurt|attack|rape) (you|them|him|her)';

  if v_phone then v_categories := array_append(v_categories, 'external_contact'); end if;
  if v_platform then v_categories := array_append(v_categories, 'external_redirection'); end if;
  if v_paid then v_categories := array_append(v_categories, 'paid_content_promotion'); end if;
  if v_financial then v_categories := array_append(v_categories, 'financial_solicitation'); end if;
  if v_sexual_service then v_categories := array_append(v_categories, 'sexual_service_solicitation'); end if;
  if v_threat then v_categories := array_append(v_categories, 'threatening_violence'); end if;

  if v_paid or v_financial or v_sexual_service or v_threat
     or (v_platform and v_redirect and (v_phone or v_paid or v_financial)) then
    v_decision := 'BLOCK';
    v_risk := case when v_threat or v_sexual_service then 1 else 0.92 end;
  elsif v_platform and v_redirect then
    v_decision := 'REVIEW';
    v_risk := 0.65;
  end if;

  return jsonb_build_object(
    'decision', v_decision,
    'categories', to_jsonb(v_categories),
    'risk_score', v_risk,
    'detector_version', 'content-safety-rules-v1'
  );
end;
$$;

revoke all on function public.content_safety_assess_private_message(text) from public, anon;
grant execute on function public.content_safety_assess_private_message(text) to authenticated, service_role;

create or replace function public.rpc_service_record_content_moderation_event(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_content_type text,
  p_content_id uuid,
  p_client_content_id text,
  p_storage_bucket text,
  p_storage_path text,
  p_decision text,
  p_categories text[],
  p_risk_score numeric,
  p_extracted_text text,
  p_evidence_snapshot jsonb,
  p_provider text,
  p_provider_model text,
  p_provider_request_id text,
  p_failure_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_content_type not in ('private_message', 'private_message_edit', 'profile_image', 'chat_image')
     or p_decision not in ('ALLOW', 'BLOCK', 'REVIEW') then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_MODERATION_EVENT';
  end if;

  if nullif(btrim(coalesce(p_client_content_id, '')), '') is not null then
    select event_row.id into v_id
    from public.content_moderation_events event_row
    where event_row.actor_user_id = p_actor_user_id
      and event_row.content_type = p_content_type
      and event_row.client_content_id = p_client_content_id
    limit 1;
    if found then return v_id; end if;
  end if;

  insert into public.content_moderation_events(
    actor_user_id, target_user_id, content_type, content_id, client_content_id,
    storage_bucket, storage_path, decision, status, categories, risk_score,
    extracted_text, evidence_snapshot, provider, provider_model,
    provider_request_id, failure_reason
  ) values (
    p_actor_user_id, p_target_user_id, p_content_type, p_content_id,
    nullif(left(coalesce(p_client_content_id, ''), 200), ''),
    nullif(left(coalesce(p_storage_bucket, ''), 100), ''),
    nullif(left(coalesce(p_storage_path, ''), 1000), ''),
    p_decision,
    case when p_decision = 'REVIEW' then 'PENDING_REVIEW' else 'AUTO_CLOSED' end,
    coalesce(p_categories, '{}'), greatest(0, least(1, coalesce(p_risk_score, 0))),
    nullif(left(coalesce(p_extracted_text, ''), 2000), ''),
    coalesce(p_evidence_snapshot, '{}'::jsonb),
    left(coalesce(p_provider, 'unknown'), 80),
    left(coalesce(p_provider_model, 'unknown'), 120),
    nullif(left(coalesce(p_provider_request_id, ''), 200), ''),
    nullif(left(coalesce(p_failure_reason, ''), 200), '')
  )
  on conflict (actor_user_id, content_type, client_content_id)
    where client_content_id is not null
  do update set
    content_id = coalesce(excluded.content_id, content_moderation_events.content_id),
    storage_bucket = coalesce(excluded.storage_bucket, content_moderation_events.storage_bucket),
    storage_path = coalesce(excluded.storage_path, content_moderation_events.storage_path)
  returning id into v_id;

  if p_decision in ('BLOCK', 'REVIEW') then
    insert into public.content_safety_actor_state(
      user_id, blocked_attempts, review_attempts, restricted_until,
      last_incident_at, updated_at
    ) values (
      p_actor_user_id,
      case when p_decision = 'BLOCK' then 1 else 0 end,
      case when p_decision = 'REVIEW' then 1 else 0 end,
      null, timezone('utc', now()), timezone('utc', now())
    )
    on conflict (user_id) do update set
      blocked_attempts = content_safety_actor_state.blocked_attempts
        + case when p_decision = 'BLOCK' then 1 else 0 end,
      review_attempts = content_safety_actor_state.review_attempts
        + case when p_decision = 'REVIEW' then 1 else 0 end,
      restricted_until = case
        when content_safety_actor_state.blocked_attempts
          + case when p_decision = 'BLOCK' then 1 else 0 end >= 3
        then greatest(
          coalesce(content_safety_actor_state.restricted_until, '-infinity'::timestamptz),
          timezone('utc', now()) + interval '24 hours'
        )
        else content_safety_actor_state.restricted_until
      end,
      last_incident_at = timezone('utc', now()),
      updated_at = timezone('utc', now());
  end if;

  if p_decision = 'REVIEW' then
    insert into public.system_messages(user_id, peer_user_id, event_type, text, metadata)
    select
      admin_row.user_id,
      admin_row.user_id,
      'admin_queue_item',
      'A content safety item requires human review.',
      jsonb_build_object(
        'source', 'content_safety',
        'queue_type', 'content_moderation',
        'record_id', v_id,
        'content_type', p_content_type,
        'decision', p_decision,
        'admin_role', admin_row.role
      )
    from public.internal_admins admin_row;
  end if;
  return v_id;
end;
$$;

revoke all on function public.rpc_service_record_content_moderation_event(
  uuid, uuid, text, uuid, text, text, text, text, text[], numeric, text,
  jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_record_content_moderation_event(
  uuid, uuid, text, uuid, text, text, text, text, text[], numeric, text,
  jsonb, text, text, text, text
) to service_role;

create or replace function public.rpc_service_send_moderated_private_message(
  p_sender_user_id uuid,
  p_receiver_user_id uuid,
  p_client_message_id text,
  p_text text,
  p_message_type text default 'text',
  p_reply_to_message_id uuid default null,
  p_storage_path text default null,
  p_decision text default 'ALLOW',
  p_categories text[] default '{}',
  p_risk_score numeric default 0,
  p_provider text default 'unknown',
  p_provider_model text default 'unknown',
  p_provider_request_id text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing public.messages%rowtype;
  v_message public.messages%rowtype;
  v_event_id uuid;
  v_restricted_until timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_sender_user_id is null or p_receiver_user_id is null
     or p_sender_user_id = p_receiver_user_id
     or nullif(btrim(p_client_message_id), '') is null
     or char_length(p_text) > 5000
     or p_message_type not in ('text', 'mood_sticker')
     or p_decision not in ('ALLOW', 'BLOCK', 'REVIEW') then
    raise exception using errcode = '22023', message = 'INVALID_MODERATED_MESSAGE';
  end if;

  select * into v_existing
  from public.messages message_row
  where message_row.sender_id = p_sender_user_id
    and message_row.client_message_id = p_client_message_id
  limit 1;
  if found then
    return jsonb_build_object('ok', true, 'message', to_jsonb(v_existing), 'idempotent', true);
  end if;

  select actor_state.restricted_until into v_restricted_until
  from public.content_safety_actor_state actor_state
  where actor_state.user_id = p_sender_user_id;
  if v_restricted_until > timezone('utc', now()) then
    return jsonb_build_object(
      'ok', false, 'code', 'MESSAGING_TEMPORARILY_RESTRICTED',
      'restricted_until', v_restricted_until
    );
  end if;

  if exists (
    select 1 from public.blocks block_row
    where (block_row.blocker_id = p_sender_user_id and block_row.blocked_id = p_receiver_user_id)
       or (block_row.blocker_id = p_receiver_user_id and block_row.blocked_id = p_sender_user_id)
  ) then
    raise exception using errcode = '42501', message = 'MESSAGING_BLOCKED';
  end if;

  if p_decision <> 'ALLOW' then
    v_event_id := public.rpc_service_record_content_moderation_event(
      p_sender_user_id, p_receiver_user_id, 'private_message', null,
      p_client_message_id, null, null, p_decision, p_categories, p_risk_score,
      null, jsonb_build_object(
        'text', p_text,
        'receiver_user_id', p_receiver_user_id,
        'message_type', p_message_type,
        'reply_to_message_id', p_reply_to_message_id,
        'storage_path', p_storage_path
      ),
      p_provider, p_provider_model, p_provider_request_id, p_failure_reason
    );
    return jsonb_build_object(
      'ok', false,
      'code', case when p_decision = 'BLOCK' then 'MESSAGE_CONTENT_NOT_ALLOWED' else 'MESSAGE_REVIEW_REQUIRED' end,
      'review_id', v_event_id
    );
  end if;

  insert into public.messages(
    text, client_message_id, sender_id, receiver_id, is_read,
    message_type, reply_to_message_id, storage_path
  ) values (
    p_text, p_client_message_id, p_sender_user_id, p_receiver_user_id, false,
    p_message_type, p_reply_to_message_id, p_storage_path
  )
  returning * into v_message;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_message));
end;
$$;

revoke all on function public.rpc_service_send_moderated_private_message(
  uuid, uuid, text, text, text, uuid, text, text, text[], numeric,
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_send_moderated_private_message(
  uuid, uuid, text, text, text, uuid, text, text, text[], numeric,
  text, text, text, text
) to service_role;

create or replace function public.rpc_service_edit_moderated_private_message(
  p_sender_user_id uuid,
  p_message_id uuid,
  p_text text,
  p_decision text,
  p_categories text[] default '{}',
  p_risk_score numeric default 0,
  p_provider text default 'unknown',
  p_provider_model text default 'unknown',
  p_provider_request_id text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing public.messages%rowtype;
  v_updated public.messages%rowtype;
  v_event_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_existing from public.messages
  where id = p_message_id and sender_id = p_sender_user_id
  for update;
  if not found or v_existing.message_type <> 'text' or v_existing.deleted_for_all then
    raise exception using errcode = '42501', message = 'MESSAGE_EDIT_FORBIDDEN';
  end if;
  if nullif(btrim(coalesce(p_text, '')), '') is null or char_length(p_text) > 5000
     or p_decision not in ('ALLOW', 'BLOCK', 'REVIEW') then
    raise exception using errcode = '22023', message = 'INVALID_MODERATED_MESSAGE';
  end if;
  if p_text = v_existing.text then
    return jsonb_build_object('ok', true, 'message', to_jsonb(v_existing), 'idempotent', true);
  end if;
  if p_decision <> 'ALLOW' then
    v_event_id := public.rpc_service_record_content_moderation_event(
      p_sender_user_id, v_existing.receiver_id, 'private_message_edit', p_message_id,
      p_message_id::text || ':' || md5(p_text), null, null, p_decision,
      p_categories, p_risk_score, null,
      jsonb_build_object('text', p_text, 'previous_text', v_existing.text),
      p_provider, p_provider_model, p_provider_request_id, p_failure_reason
    );
    return jsonb_build_object(
      'ok', false,
      'code', case when p_decision = 'BLOCK' then 'MESSAGE_CONTENT_NOT_ALLOWED' else 'MESSAGE_REVIEW_REQUIRED' end,
      'review_id', v_event_id
    );
  end if;

  insert into public.message_edits(message_id, editor_user_id, previous_text)
  values (v_existing.id, p_sender_user_id, coalesce(v_existing.text, ''));
  update public.messages
  set text = p_text, edited_at = timezone('utc', now())
  where id = v_existing.id
  returning * into v_updated;
  return jsonb_build_object('ok', true, 'message', to_jsonb(v_updated));
end;
$$;

revoke all on function public.rpc_service_edit_moderated_private_message(
  uuid, uuid, text, text, text[], numeric, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_edit_moderated_private_message(
  uuid, uuid, text, text, text[], numeric, text, text, text, text
) to service_role;

-- Legacy clients remain usable, but obvious prohibited text cannot bypass the
-- server by inserting directly instead of using the new Edge Function.
create or replace function public.trg_enforce_private_message_safety_floor()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assessment jsonb;
begin
  if new.message_type <> 'text' then return new; end if;
  if tg_op = 'UPDATE' and new.text is not distinct from old.text then return new; end if;
  if auth.role() = 'service_role' then return new; end if;
  v_assessment := public.content_safety_assess_private_message(new.text);
  if v_assessment ->> 'decision' = 'BLOCK' then
    raise exception using errcode = '22023', message = 'MESSAGE_CONTENT_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_private_message_safety_floor on public.messages;
create trigger enforce_private_message_safety_floor
before insert or update of text on public.messages
for each row execute function public.trg_enforce_private_message_safety_floor();

revoke all on function public.trg_enforce_private_message_safety_floor()
  from public, anon, authenticated;

create or replace function public.rpc_admin_get_content_moderation_events(p_limit integer default 100)
returns table(
  event_id uuid,
  actor_user_id uuid,
  actor_profile_id uuid,
  actor_name text,
  target_user_id uuid,
  target_name text,
  content_type text,
  content_id uuid,
  client_content_id text,
  decision text,
  status text,
  categories text[],
  risk_score numeric,
  extracted_text text,
  evidence_snapshot jsonb,
  storage_bucket text,
  storage_path text,
  provider text,
  provider_model text,
  failure_reason text,
  created_at timestamptz,
  reviewed_at timestamptz,
  review_outcome text,
  review_notes text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  return query
  select
    event_row.id,
    event_row.actor_user_id,
    actor_profile.id,
    actor_profile.full_name,
    event_row.target_user_id,
    target_profile.full_name,
    event_row.content_type,
    event_row.content_id,
    event_row.client_content_id,
    event_row.decision,
    event_row.status,
    event_row.categories,
    event_row.risk_score,
    event_row.extracted_text,
    event_row.evidence_snapshot,
    event_row.storage_bucket,
    event_row.storage_path,
    event_row.provider,
    event_row.provider_model,
    event_row.failure_reason,
    event_row.created_at,
    event_row.reviewed_at,
    event_row.review_outcome,
    event_row.review_notes
  from public.content_moderation_events event_row
  left join public.profiles actor_profile on actor_profile.user_id = event_row.actor_user_id
  left join public.profiles target_profile on target_profile.user_id = event_row.target_user_id
  order by (event_row.status = 'PENDING_REVIEW') desc, event_row.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.rpc_admin_get_content_moderation_events(integer) from public, anon;
grant execute on function public.rpc_admin_get_content_moderation_events(integer) to authenticated;

create or replace function public.rpc_admin_resolve_content_moderation_event(
  p_event_id uuid,
  p_outcome text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event public.content_moderation_events%rowtype;
  v_message public.messages%rowtype;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_outcome not in ('APPROVE', 'REJECT') or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_OUTCOME';
  end if;
  select * into v_event
  from public.content_moderation_events event_row
  where event_row.id = p_event_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'REVIEW_NOT_FOUND'; end if;
  if v_event.status <> 'PENDING_REVIEW' then
    raise exception using errcode = '22023', message = 'REVIEW_ALREADY_RESOLVED';
  end if;

  if p_outcome = 'APPROVE' and v_event.content_type = 'private_message' then
    if exists (
      select 1 from public.blocks block_row
      where (block_row.blocker_id = v_event.actor_user_id and block_row.blocked_id = v_event.target_user_id)
         or (block_row.blocker_id = v_event.target_user_id and block_row.blocked_id = v_event.actor_user_id)
    ) then
      raise exception using errcode = '42501', message = 'MESSAGE_DELIVERY_NO_LONGER_ALLOWED';
    end if;
    insert into public.messages(
      text, client_message_id, sender_id, receiver_id, is_read,
      message_type, reply_to_message_id, storage_path
    ) values (
      v_event.evidence_snapshot ->> 'text',
      v_event.client_content_id,
      v_event.actor_user_id,
      (v_event.evidence_snapshot ->> 'receiver_user_id')::uuid,
      false,
      coalesce(v_event.evidence_snapshot ->> 'message_type', 'text'),
      nullif(v_event.evidence_snapshot ->> 'reply_to_message_id', '')::uuid,
      nullif(v_event.evidence_snapshot ->> 'storage_path', '')
    )
    on conflict (sender_id, client_message_id) where client_message_id is not null
    do nothing
    returning * into v_message;
    if v_message.id is null then
      select * into v_message
      from public.messages message_row
      where message_row.sender_id = v_event.actor_user_id
        and message_row.client_message_id = v_event.client_content_id;
    end if;
  elsif p_outcome = 'APPROVE' and v_event.content_type = 'private_message_edit' then
    select * into v_message
    from public.messages message_row
    where message_row.id = v_event.content_id
      and message_row.sender_id = v_event.actor_user_id
    for update;
    if not found or v_message.deleted_for_all
       or v_message.text is distinct from (v_event.evidence_snapshot ->> 'previous_text') then
      raise exception using errcode = '40001', message = 'MESSAGE_EDIT_REVIEW_STALE';
    end if;
    if exists (
      select 1 from public.blocks block_row
      where (block_row.blocker_id = v_message.sender_id and block_row.blocked_id = v_message.receiver_id)
         or (block_row.blocker_id = v_message.receiver_id and block_row.blocked_id = v_message.sender_id)
    ) then
      raise exception using errcode = '42501', message = 'MESSAGE_DELIVERY_NO_LONGER_ALLOWED';
    end if;
    insert into public.message_edits(message_id, editor_user_id, previous_text)
    values (v_message.id, v_event.actor_user_id, coalesce(v_message.text, ''));
    update public.messages
    set text = v_event.evidence_snapshot ->> 'text',
        edited_at = timezone('utc', now())
    where id = v_message.id
    returning * into v_message;
  end if;

  update public.content_moderation_events
  set status = case when p_outcome = 'APPROVE' then 'APPROVED' else 'REJECTED' end,
      reviewed_at = timezone('utc', now()),
      reviewed_by = auth.uid(),
      review_outcome = p_outcome,
      review_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      content_id = coalesce(content_id, v_message.id)
  where id = p_event_id;

  return jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'status', case when p_outcome = 'APPROVE' then 'APPROVED' else 'REJECTED' end,
    'message_id', v_message.id
  );
end;
$$;

revoke all on function public.rpc_admin_resolve_content_moderation_event(uuid, text, text)
  from public, anon;
grant execute on function public.rpc_admin_resolve_content_moderation_event(uuid, text, text)
  to authenticated;

comment on table public.content_moderation_events is
  'Server-owned safety decisions and audited resolutions for private text and member-supplied images. Exact blocked/review evidence is admin-only.';
