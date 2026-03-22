create table if not exists public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'closed')),
  current_sign_in_method text
    check (current_sign_in_method in ('email', 'google', 'apple', 'magic_link', 'other')),
  previous_sign_in_method text
    check (previous_sign_in_method in ('email', 'google', 'apple', 'magic_link', 'other')),
  contact_email text,
  previous_account_email text,
  note text,
  evidence jsonb not null default '{}'::jsonb,
  linked_merge_case_id uuid references public.account_merge_cases(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists account_recovery_requests_status_idx
  on public.account_recovery_requests (status, created_at desc);

create or replace function public.set_account_recovery_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists account_recovery_requests_set_updated_at on public.account_recovery_requests;
create trigger account_recovery_requests_set_updated_at
before update on public.account_recovery_requests
for each row execute function public.set_account_recovery_requests_updated_at();

alter table public.account_recovery_requests enable row level security;

revoke all on public.account_recovery_requests from anon, authenticated;

create policy "account_recovery_requests_select_own"
on public.account_recovery_requests
for select
to authenticated
using (
  requester_user_id = auth.uid()
  or public.is_internal_admin()
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

  return v_request_id;
end;
$$;

revoke all on function public.rpc_request_account_recovery(text, text, text, text, text, jsonb) from public;
grant execute on function public.rpc_request_account_recovery(text, text, text, text, text, jsonb) to authenticated;
