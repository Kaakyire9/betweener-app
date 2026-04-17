-- Let users withdraw their own pending verification submissions without
-- erasing review/audit history. Cancelled requests leave active queues and
-- allow the user to submit a cleaner replacement.

alter table public.verification_requests
  drop constraint if exists verification_requests_status_check;

alter table public.verification_requests
  add constraint verification_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table public.verification_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text;

create index if not exists verification_requests_cancelled_at_idx
  on public.verification_requests (cancelled_at desc)
  where status = 'cancelled';

create or replace function public.rpc_cancel_my_verification_request(
  p_request_id uuid,
  p_cancel_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  request_row public.verification_requests%rowtype;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
    into request_row
  from public.verification_requests
  where id = p_request_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'verification request not found';
  end if;

  if coalesce(request_row.status, 'pending') <> 'pending' then
    raise exception 'only pending verification requests can be withdrawn';
  end if;

  v_reason := nullif(left(trim(coalesce(p_cancel_reason, '')), 240), '');

  update public.verification_requests
     set status = 'cancelled',
         cancelled_at = timezone('utc'::text, now()),
         cancelled_by = auth.uid(),
         cancel_reason = coalesce(v_reason, 'Withdrawn by user'),
         reviewer_notes = case
           when nullif(trim(coalesce(reviewer_notes, '')), '') is null
             then 'Withdrawn by user'
           else reviewer_notes
         end,
         user_notified = true,
         updated_at = timezone('utc'::text, now())
   where id = request_row.id;

  return true;
end;
$$;

revoke all on function public.rpc_cancel_my_verification_request(uuid, text) from public;
grant execute on function public.rpc_cancel_my_verification_request(uuid, text) to authenticated;

drop function if exists public.rpc_admin_get_verification_queue();

create or replace function public.rpc_admin_get_verification_queue()
returns table (
  id uuid,
  user_id uuid,
  profile_id uuid,
  verification_type text,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_notes text,
  auto_verification_score numeric,
  auto_verification_data jsonb,
  document_url text,
  full_name text,
  current_country text,
  avatar_url text,
  verification_level integer,
  verification_refresh_required boolean,
  verification_refresh_reason text,
  verification_refresh_target_level integer,
  verification_refresh_requested_at timestamptz
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
    vr.id,
    vr.user_id,
    vr.profile_id,
    vr.verification_type,
    coalesce(vr.status, 'pending') as status,
    vr.submitted_at,
    vr.reviewed_at,
    vr.reviewer_notes,
    vr.auto_verification_score,
    vr.auto_verification_data,
    vr.document_url,
    p.full_name,
    p.current_country,
    p.avatar_url,
    p.verification_level,
    coalesce(p.verification_refresh_required, false) as verification_refresh_required,
    p.verification_refresh_reason,
    p.verification_refresh_target_level,
    p.verification_refresh_requested_at
  from public.verification_requests vr
  left join public.profiles p on p.id = vr.profile_id
  where coalesce(vr.status, 'pending') <> 'cancelled'
  order by
    case when coalesce(vr.status, 'pending') = 'pending' then 0 else 1 end,
    vr.submitted_at asc nulls last;
end;
$$;

revoke all on function public.rpc_admin_get_verification_queue() from public;
grant execute on function public.rpc_admin_get_verification_queue() to authenticated;
