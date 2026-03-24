create table if not exists public.account_recovery_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_recovery_requests(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists account_recovery_request_events_request_idx
  on public.account_recovery_request_events (request_id, created_at desc);

alter table public.account_recovery_request_events enable row level security;

revoke all on public.account_recovery_request_events from anon, authenticated;

insert into public.account_recovery_request_events (
  request_id,
  event_type,
  actor_user_id,
  metadata
)
select
  arr.id,
  'request_created',
  arr.requester_user_id,
  jsonb_build_object(
    'status', arr.status,
    'current_sign_in_method', arr.current_sign_in_method,
    'previous_sign_in_method', arr.previous_sign_in_method,
    'contact_email', arr.contact_email,
    'previous_account_email', arr.previous_account_email
  )
from public.account_recovery_requests arr
where not exists (
  select 1
  from public.account_recovery_request_events arev
  where arev.request_id = arr.id
);

create or replace function public.rpc_request_account_recovery(
  p_current_sign_in_method text default null,
  p_previous_sign_in_method text default null,
  p_contact_email text default null,
  p_previous_account_email text default null,
  p_note text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_current_method text := lower(trim(coalesce(p_current_sign_in_method, '')));
  v_previous_method text := lower(trim(coalesce(p_previous_sign_in_method, '')));
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if v_current_method <> '' and v_current_method not in ('email', 'google', 'apple', 'magic_link', 'other') then
    raise exception 'invalid current sign-in method';
  end if;

  if v_previous_method <> '' and v_previous_method not in ('email', 'google', 'apple', 'magic_link', 'other') then
    raise exception 'invalid previous sign-in method';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;

  insert into public.account_recovery_requests (
    requester_user_id,
    requester_profile_id,
    current_sign_in_method,
    previous_sign_in_method,
    contact_email,
    previous_account_email,
    note,
    evidence
  )
  values (
    auth.uid(),
    v_profile_id,
    nullif(v_current_method, ''),
    nullif(v_previous_method, ''),
    nullif(trim(coalesce(p_contact_email, '')), ''),
    nullif(trim(coalesce(p_previous_account_email, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_evidence, '{}'::jsonb)
  )
  returning id into v_request_id;

  insert into public.account_recovery_request_events (
    request_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_request_id,
    'request_created',
    auth.uid(),
    jsonb_build_object(
      'current_sign_in_method', nullif(v_current_method, ''),
      'previous_sign_in_method', nullif(v_previous_method, ''),
      'contact_email', nullif(trim(coalesce(p_contact_email, '')), ''),
      'previous_account_email', nullif(trim(coalesce(p_previous_account_email, '')), ''),
      'note_present', nullif(trim(coalesce(p_note, '')), '') is not null
    )
  );

  return v_request_id;
end;
$$;

create or replace function public.rpc_admin_update_account_recovery_request(
  p_request_id uuid,
  p_status text,
  p_review_notes text default null,
  p_linked_merge_case_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_existing public.account_recovery_requests%rowtype;
  v_next_review_notes text;
  v_next_linked_merge_case_id uuid;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  if v_status not in ('pending', 'reviewing', 'resolved', 'closed') then
    raise exception 'invalid recovery request status';
  end if;

  select *
    into v_existing
  from public.account_recovery_requests
  where id = p_request_id
  for update;

  if not found then
    return false;
  end if;

  v_next_review_notes := coalesce(nullif(trim(coalesce(p_review_notes, '')), ''), v_existing.review_notes);
  v_next_linked_merge_case_id := coalesce(p_linked_merge_case_id, v_existing.linked_merge_case_id);

  update public.account_recovery_requests
     set status = v_status,
         linked_merge_case_id = v_next_linked_merge_case_id,
         review_notes = v_next_review_notes,
         reviewed_by = case
           when v_status in ('reviewing', 'resolved', 'closed') then auth.uid()
           else v_existing.reviewed_by
         end,
         reviewed_at = case
           when v_status in ('reviewing', 'resolved', 'closed') then timezone('utc'::text, now())
           else v_existing.reviewed_at
         end
   where id = p_request_id;

  insert into public.account_recovery_request_events (
    request_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    p_request_id,
    'request_updated',
    auth.uid(),
    jsonb_build_object(
      'from_status', v_existing.status,
      'to_status', v_status,
      'linked_merge_case_id', v_next_linked_merge_case_id,
      'review_notes', v_next_review_notes
    )
  );

  return true;
end;
$$;

create or replace function public.rpc_admin_get_account_recovery_request(
  p_request_id uuid
)
returns table (
  id uuid,
  requester_user_id uuid,
  requester_profile_id uuid,
  requester_name text,
  requester_avatar_url text,
  status text,
  current_sign_in_method text,
  previous_sign_in_method text,
  contact_email text,
  previous_account_email text,
  note text,
  evidence jsonb,
  linked_merge_case_id uuid,
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
    arr.id,
    arr.requester_user_id,
    arr.requester_profile_id,
    requester.full_name,
    requester.avatar_url,
    arr.status,
    arr.current_sign_in_method,
    arr.previous_sign_in_method,
    arr.contact_email,
    arr.previous_account_email,
    arr.note,
    arr.evidence,
    arr.linked_merge_case_id,
    arr.reviewed_by,
    arr.review_notes,
    arr.reviewed_at,
    arr.created_at,
    arr.updated_at
  from public.account_recovery_requests arr
  left join public.profiles requester on requester.id = arr.requester_profile_id
  where arr.id = p_request_id
  limit 1;
end;
$$;

create or replace function public.rpc_admin_get_account_recovery_request_events(
  p_request_id uuid
)
returns table (
  id uuid,
  request_id uuid,
  event_type text,
  actor_user_id uuid,
  actor_role text,
  metadata jsonb,
  created_at timestamptz
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
    arev.id,
    arev.request_id,
    arev.event_type,
    arev.actor_user_id,
    ia.role,
    arev.metadata,
    arev.created_at
  from public.account_recovery_request_events arev
  left join public.internal_admins ia on ia.user_id = arev.actor_user_id
  where arev.request_id = p_request_id
  order by arev.created_at desc;
end;
$$;

revoke all on function public.rpc_request_account_recovery(text, text, text, text, text, jsonb) from public;
revoke all on function public.rpc_admin_update_account_recovery_request(uuid, text, text, uuid) from public;
revoke all on function public.rpc_admin_get_account_recovery_request(uuid) from public;
revoke all on function public.rpc_admin_get_account_recovery_request_events(uuid) from public;

grant execute on function public.rpc_request_account_recovery(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.rpc_admin_update_account_recovery_request(uuid, text, text, uuid) to authenticated;
grant execute on function public.rpc_admin_get_account_recovery_request(uuid) to authenticated;
grant execute on function public.rpc_admin_get_account_recovery_request_events(uuid) to authenticated;
