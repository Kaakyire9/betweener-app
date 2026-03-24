-- Internal admin registry + secure admin RPCs for the operations dashboard.
-- This keeps admin reads/writes server-side and compatible with hardened RLS.

create table if not exists public.internal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'operations'
    check (role in ('operations', 'moderation', 'support', 'super_admin')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  created_by uuid references auth.users(id)
);

alter table public.internal_admins enable row level security;

revoke all on public.internal_admins from anon, authenticated;

create or replace function public.is_internal_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = auth.uid()
  );
$$;

revoke all on function public.is_internal_admin() from public;
grant execute on function public.is_internal_admin() to authenticated;

drop policy if exists "Internal admins can view verification docs" on storage.objects;
create policy "Internal admins can view verification docs"
on storage.objects
for select
using (
  bucket_id = 'verification-docs'
  and public.is_internal_admin()
);

create or replace function public.rpc_admin_dashboard_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  select jsonb_build_object(
    'pending_verifications', (
      select count(*)::int from public.verification_requests
      where status = 'pending'
    ),
    'rejected_unread', (
      select count(*)::int from public.verification_requests
      where status = 'rejected' and coalesce(user_notified, false) = false
    ),
    'open_reports', (
      select count(*)::int from public.reports
      where upper(coalesce(status, 'PENDING')) in ('PENDING', 'REVIEWING')
    ),
    'active_subscriptions', (
      select count(*)::int from public.subscriptions
      where is_active = true
    ),
    'silver_active', (
      select count(*)::int from public.subscriptions
      where is_active = true and type = 'SILVER'
    ),
    'gold_active', (
      select count(*)::int from public.subscriptions
      where is_active = true and type = 'GOLD'
    ),
    'members_total', (
      select count(*)::int from public.profiles
      where deleted_at is null
    ),
    'members_last_7d', (
      select count(*)::int from public.profiles
      where deleted_at is null
        and created_at >= timezone('utc'::text, now()) - interval '7 days'
    )
  )
  into result;

  return coalesce(result, '{}'::jsonb);
end;
$$;

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
  document_url text,
  full_name text,
  current_country text,
  avatar_url text,
  verification_level integer
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
    vr.document_url,
    p.full_name,
    p.current_country,
    p.avatar_url,
    p.verification_level
  from public.verification_requests vr
  left join public.profiles p on p.id = vr.profile_id
  order by
    case when coalesce(vr.status, 'pending') = 'pending' then 0 else 1 end,
    vr.submitted_at asc nulls last;
end;
$$;

create or replace function public.rpc_admin_review_verification_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.verification_requests%rowtype;
  next_level integer;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select *
    into request_row
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    return false;
  end if;

  update public.verification_requests
     set status = p_decision,
         reviewed_at = timezone('utc'::text, now()),
         reviewer_notes = nullif(trim(coalesce(p_notes, '')), ''),
         user_notified = false,
         updated_at = timezone('utc'::text, now())
   where id = p_request_id;

  if p_decision = 'approved' and request_row.profile_id is not null then
    next_level := case request_row.verification_type
      when 'social' then 1
      when 'passport' then 2
      when 'residence' then 2
      when 'workplace' then 2
      else 1
    end;

    update public.profiles
       set verification_level = greatest(coalesce(verification_level, 0), next_level),
           updated_at = timezone('utc'::text, now())
     where id = request_row.profile_id;
  end if;

  return true;
end;
$$;

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
  reported_verification_level integer
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
    reported_profile.verification_level
  from public.reports r
  left join public.profiles reporter_profile on reporter_profile.user_id = r.reporter_id
  left join public.profiles reported_profile on reported_profile.user_id = r.reported_id
  order by
    case when upper(coalesce(r.status, 'PENDING')) in ('PENDING', 'REVIEWING') then 0 else 1 end,
    r.created_at desc;
end;
$$;

create or replace function public.rpc_admin_update_report_status(
  p_report_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text;
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  normalized_status := upper(trim(coalesce(p_status, '')));
  if normalized_status not in ('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED') then
    raise exception 'invalid report status';
  end if;

  update public.reports
     set status = normalized_status
   where id = p_report_id;

  return found;
end;
$$;

revoke all on function public.rpc_admin_dashboard_overview() from public;
revoke all on function public.rpc_admin_get_verification_queue() from public;
revoke all on function public.rpc_admin_review_verification_request(uuid, text, text) from public;
revoke all on function public.rpc_admin_get_reports_queue() from public;
revoke all on function public.rpc_admin_update_report_status(uuid, text) from public;

grant execute on function public.rpc_admin_dashboard_overview() to authenticated;
grant execute on function public.rpc_admin_get_verification_queue() to authenticated;
grant execute on function public.rpc_admin_review_verification_request(uuid, text, text) to authenticated;
grant execute on function public.rpc_admin_get_reports_queue() to authenticated;
grant execute on function public.rpc_admin_update_report_status(uuid, text) to authenticated;
