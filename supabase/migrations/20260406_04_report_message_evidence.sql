-- Add private, server-verified message evidence to user reports.
-- The client passes a message id; the RPC verifies that it belongs to the reported member
-- before storing a moderation snapshot for admins.

alter table public.reports
  add column if not exists evidence_message_id uuid references public.messages(id) on delete set null,
  add column if not exists evidence_message_text text,
  add column if not exists evidence_message_type text,
  add column if not exists evidence_message_sender_id uuid references auth.users(id) on delete set null,
  add column if not exists evidence_message_created_at timestamptz,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

create index if not exists reports_evidence_message_idx
  on public.reports (evidence_message_id)
  where evidence_message_id is not null;

create or replace function public.rpc_submit_report(
  p_reported_id uuid,
  p_reason text,
  p_evidence_message_id uuid default null,
  p_client_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reason text;
  v_message public.messages%rowtype;
  v_report_id uuid;
  v_client_evidence jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_reported_id is null or p_reported_id = auth.uid() then
    raise exception 'invalid reported member';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'report reason required';
  end if;

  v_client_evidence := coalesce(p_client_evidence, '{}'::jsonb);
  if jsonb_typeof(v_client_evidence) <> 'object' then
    v_client_evidence := '{}'::jsonb;
  end if;

  if p_evidence_message_id is not null then
    select *
      into v_message
    from public.messages m
    where m.id = p_evidence_message_id
      and m.sender_id = p_reported_id
      and m.receiver_id = auth.uid()
    limit 1;

    if not found then
      raise exception 'message evidence not found for this report';
    end if;
  end if;

  insert into public.reports (
    reporter_id,
    reported_id,
    reason,
    evidence_message_id,
    evidence_message_text,
    evidence_message_type,
    evidence_message_sender_id,
    evidence_message_created_at,
    evidence
  )
  values (
    auth.uid(),
    p_reported_id,
    v_reason,
    case when p_evidence_message_id is null then null else v_message.id end,
    case
      when p_evidence_message_id is null then null
      when coalesce(v_message.is_view_once, false) then '[View-once message]'
      when coalesce(v_message.deleted_for_all, false) then '[Deleted message]'
      else left(coalesce(v_message.text, ''), 1200)
    end,
    case when p_evidence_message_id is null then null else coalesce(v_message.message_type, 'text') end,
    case when p_evidence_message_id is null then null else v_message.sender_id end,
    case when p_evidence_message_id is null then null else v_message.created_at end,
    jsonb_strip_nulls(
      v_client_evidence ||
      jsonb_build_object(
        'source', case when p_evidence_message_id is null then 'chat_thread' else 'chat_message' end,
        'message_id', p_evidence_message_id,
        'reported_user_id', p_reported_id
      )
    )
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.rpc_submit_report(uuid, text, uuid, jsonb) from public;
grant execute on function public.rpc_submit_report(uuid, text, uuid, jsonb) to authenticated;

drop function if exists public.rpc_admin_get_reports_queue();

create or replace function public.rpc_admin_get_reports_queue()
returns table (
  id uuid,
  reason text,
  status text,
  created_at timestamptz,
  reporter_user_id uuid,
  reported_user_id uuid,
  reporter_name text,
  reporter_avatar text,
  reporter_verification_level integer,
  reported_name text,
  reported_avatar text,
  reported_verification_level integer,
  evidence_message_id uuid,
  evidence_message_text text,
  evidence_message_type text,
  evidence_message_sender_id uuid,
  evidence_message_created_at timestamptz,
  evidence jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    r.id,
    r.reason,
    coalesce(r.status, 'PENDING') as status,
    r.created_at,
    r.reporter_id,
    r.reported_id,
    reporter_profile.full_name,
    reporter_profile.avatar_url,
    reporter_profile.verification_level,
    reported_profile.full_name,
    reported_profile.avatar_url,
    reported_profile.verification_level,
    r.evidence_message_id,
    r.evidence_message_text,
    r.evidence_message_type,
    r.evidence_message_sender_id,
    r.evidence_message_created_at,
    r.evidence
  from public.reports r
  left join public.profiles reporter_profile on reporter_profile.user_id = r.reporter_id
  left join public.profiles reported_profile on reported_profile.user_id = r.reported_id
  order by
    case when upper(coalesce(r.status, 'PENDING')) in ('PENDING', 'REVIEWING') then 0 else 1 end,
    r.created_at desc;
end;
$$;

revoke all on function public.rpc_admin_get_reports_queue() from public;
grant execute on function public.rpc_admin_get_reports_queue() to authenticated;
