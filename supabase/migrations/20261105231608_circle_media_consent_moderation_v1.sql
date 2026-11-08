begin;

alter table public.circle_media_assets
  add column if not exists provenance_type text,
  add column if not exists rights_attested_at timestamptz,
  add column if not exists rights_attested_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists moderation_status text not null default 'not_submitted',
  add column if not exists moderation_provider text,
  add column if not exists moderation_model text,
  add column if not exists moderation_categories text[] not null default '{}',
  add column if not exists moderation_scores jsonb not null default '{}'::jsonb,
  add column if not exists moderation_failure_reason text,
  add column if not exists moderation_scanned_object_path text,
  add column if not exists moderation_completed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists editorial_title text,
  add column if not exists editorial_subtitle text,
  add column if not exists editorial_body text;

alter table public.circle_media_assets
  drop constraint if exists circle_media_assets_provenance_type_valid;
alter table public.circle_media_assets
  add constraint circle_media_assets_provenance_type_valid check (
    provenance_type is null or provenance_type in ('original', 'licensed', 'member_submitted')
  );
alter table public.circle_media_assets
  drop constraint if exists circle_media_assets_moderation_status_valid;
alter table public.circle_media_assets
  add constraint circle_media_assets_moderation_status_valid check (
    moderation_status in ('not_submitted', 'pending', 'approved', 'review', 'rejected')
  );

create table if not exists public.circle_media_subject_approvals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.circle_media_assets(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  subject_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint circle_media_subject_approval_status_valid check (status in ('pending', 'approved', 'rejected')),
  constraint circle_media_subject_approval_unique unique (asset_id, subject_profile_id)
);

create index if not exists circle_media_subject_approvals_subject_idx
  on public.circle_media_subject_approvals(subject_profile_id, status, requested_at desc);

alter table public.circle_media_subject_approvals enable row level security;
revoke all on table public.circle_media_subject_approvals from public, anon, authenticated;
grant all on table public.circle_media_subject_approvals to service_role;

create or replace function private.quarantine_finalized_circle_media_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'ready' then
    new.status := 'quarantined';
    new.moderation_status := 'not_submitted';
  end if;
  return new;
end;
$$;

create or replace function private.get_my_circle_media_subject_approvals(p_actor_profile_id uuid)
returns table(
  asset_id uuid,
  circle_id uuid,
  title text,
  media_type text,
  poster_object_path text,
  uploader_name text,
  requested_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select approval.asset_id, approval.circle_id, coalesce(asset.editorial_title, 'Circle media'),
    asset.media_type, asset.poster_object_path, coalesce(uploader.full_name, 'A Circle member'), approval.requested_at
  from public.circle_media_subject_approvals approval
  join public.circle_media_assets asset on asset.id = approval.asset_id
  left join public.profiles uploader on uploader.id = asset.uploader_profile_id
  join public.profiles subject on subject.id = approval.subject_profile_id
  where approval.subject_profile_id = p_actor_profile_id
    and approval.status = 'pending'
    and subject.user_id = auth.uid()
    and public.is_circle_member(approval.circle_id, auth.uid())
  order by approval.requested_at desc;
$$;

drop trigger if exists circle_media_assets_quarantine_finalized on public.circle_media_assets;
create trigger circle_media_assets_quarantine_finalized
before update of status on public.circle_media_assets
for each row execute function private.quarantine_finalized_circle_media_asset();

create or replace function private.submit_circle_media_asset_for_moderation(
  p_asset_id uuid,
  p_provenance_type text,
  p_rights_attested boolean,
  p_subject_profile_ids uuid[] default '{}',
  p_title text default null,
  p_subtitle text default null,
  p_body text default null
)
returns public.circle_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
  v_subject_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if coalesce(p_rights_attested, false) is not true then
    raise exception 'media_rights_attestation_required';
  end if;
  if p_provenance_type not in ('original', 'licensed', 'member_submitted') then
    raise exception 'invalid_media_provenance';
  end if;

  select * into v_asset
  from public.circle_media_assets asset
  where asset.id = p_asset_id
  for update;

  if v_asset.id is null then raise exception 'circle_media_asset_not_found'; end if;
  if v_asset.uploader_user_id <> auth.uid()
     or (not public.is_circle_member(v_asset.circle_id, auth.uid())
       and not public.is_circle_owner(v_asset.circle_id, auth.uid())) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_asset.status <> 'quarantined' or v_asset.moderation_status <> 'not_submitted' then
    raise exception 'circle_media_asset_not_awaiting_moderation';
  end if;
  if coalesce(array_length(p_subject_profile_ids, 1), 0) > 12 then
    raise exception 'too_many_media_subjects';
  end if;

  foreach v_subject_id in array coalesce(p_subject_profile_ids, '{}'::uuid[]) loop
    if not exists (
      select 1
      from public.circle_members member
      where member.circle_id = v_asset.circle_id
        and member.profile_id = v_subject_id
        and member.status = 'active'
    ) then
      raise exception 'media_subject_must_be_active_circle_member';
    end if;
    insert into public.circle_media_subject_approvals(asset_id, circle_id, subject_profile_id)
    values (v_asset.id, v_asset.circle_id, v_subject_id)
    on conflict (asset_id, subject_profile_id) do nothing;
  end loop;

  update public.circle_media_assets
  set provenance_type = p_provenance_type,
      rights_attested_at = timezone('utc', now()),
      rights_attested_by_user_id = auth.uid(),
      editorial_title = nullif(btrim(coalesce(p_title, '')), ''),
      editorial_subtitle = nullif(btrim(coalesce(p_subtitle, '')), ''),
      editorial_body = nullif(btrim(coalesce(p_body, '')), ''),
      moderation_status = 'pending',
      updated_at = timezone('utc', now())
  where id = v_asset.id
  returning * into v_asset;

  return v_asset;
end;
$$;

create or replace function private.service_complete_circle_media_moderation(
  p_asset_id uuid,
  p_decision text,
  p_provider text,
  p_model text,
  p_categories text[] default '{}',
  p_scores jsonb default '{}'::jsonb,
  p_failure_reason text default null,
  p_scanned_object_path text default null
)
returns public.circle_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision, '')));
  v_has_pending_subject boolean;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if v_decision not in ('ALLOW', 'BLOCK', 'REVIEW') then
    raise exception 'invalid_moderation_decision';
  end if;

  select * into v_asset
  from public.circle_media_assets asset
  where asset.id = p_asset_id
  for update;
  if v_asset.id is null then raise exception 'circle_media_asset_not_found'; end if;
  if v_asset.status <> 'quarantined' or v_asset.moderation_status <> 'pending' then
    raise exception 'circle_media_asset_not_pending_moderation';
  end if;
  if v_asset.rights_attested_at is null or v_asset.provenance_type is null then
    raise exception 'circle_media_provenance_incomplete';
  end if;
  if p_scanned_object_path is distinct from (case
    when v_asset.media_type = 'video' then v_asset.poster_object_path
    else v_asset.object_path
  end) then
    raise exception 'moderation_object_path_mismatch';
  end if;

  select exists (
    select 1 from public.circle_media_subject_approvals approval
    where approval.asset_id = v_asset.id and approval.status = 'pending'
  ) into v_has_pending_subject;

  update public.circle_media_assets
  set moderation_status = case v_decision when 'ALLOW' then 'approved' when 'BLOCK' then 'rejected' else 'review' end,
      moderation_provider = nullif(btrim(coalesce(p_provider, '')), ''),
      moderation_model = nullif(btrim(coalesce(p_model, '')), ''),
      moderation_categories = coalesce(p_categories, '{}'),
      moderation_scores = coalesce(p_scores, '{}'::jsonb),
      moderation_failure_reason = nullif(btrim(coalesce(p_failure_reason, '')), ''),
      moderation_scanned_object_path = p_scanned_object_path,
      moderation_completed_at = timezone('utc', now()),
      status = case
        when v_decision = 'ALLOW' and not v_has_pending_subject then 'ready'
        when v_decision = 'BLOCK' then 'rejected'
        else 'quarantined'
      end,
      purge_after = case when v_decision = 'BLOCK' then timezone('utc', now()) + interval '7 days' else purge_after end,
      updated_at = timezone('utc', now())
  where id = v_asset.id
  returning * into v_asset;

  return v_asset;
end;
$$;

create or replace function private.respond_to_circle_media_subject_approval(
  p_asset_id uuid,
  p_actor_profile_id uuid,
  p_approve boolean
)
returns public.circle_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id and profile.user_id = auth.uid() and profile.deleted_at is null
  ) then raise exception 'not_authorized' using errcode = '42501'; end if;

  update public.circle_media_subject_approvals
  set status = case when p_approve then 'approved' else 'rejected' end,
      responded_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where asset_id = p_asset_id
    and subject_profile_id = p_actor_profile_id
    and status = 'pending';
  if not found then raise exception 'media_subject_approval_not_pending'; end if;

  select * into v_asset from public.circle_media_assets where id = p_asset_id for update;
  if not p_approve then
    update public.circle_media_assets
    set status = 'rejected', moderation_status = 'rejected', purge_after = timezone('utc', now()) + interval '7 days', updated_at = timezone('utc', now())
    where id = p_asset_id returning * into v_asset;
  elsif v_asset.moderation_status = 'approved' and not exists (
    select 1 from public.circle_media_subject_approvals approval
    where approval.asset_id = p_asset_id and approval.status <> 'approved'
  ) then
    update public.circle_media_assets
    set status = 'ready', updated_at = timezone('utc', now())
    where id = p_asset_id returning * into v_asset;
  end if;
  return v_asset;
end;
$$;

create or replace function public.rpc_submit_circle_media_asset_for_moderation(
  p_asset_id uuid,
  p_provenance_type text,
  p_rights_attested boolean,
  p_subject_profile_ids uuid[] default '{}',
  p_title text default null,
  p_subtitle text default null,
  p_body text default null
)
returns public.circle_media_assets
language sql
security definer
set search_path = ''
as $$ select private.submit_circle_media_asset_for_moderation(p_asset_id, p_provenance_type, p_rights_attested, p_subject_profile_ids, p_title, p_subtitle, p_body); $$;

create or replace function public.rpc_service_complete_circle_media_moderation(
  p_asset_id uuid,
  p_decision text,
  p_provider text,
  p_model text,
  p_categories text[] default '{}',
  p_scores jsonb default '{}'::jsonb,
  p_failure_reason text default null,
  p_scanned_object_path text default null
)
returns public.circle_media_assets
language sql
security definer
set search_path = ''
as $$ select private.service_complete_circle_media_moderation(p_asset_id, p_decision, p_provider, p_model, p_categories, p_scores, p_failure_reason, p_scanned_object_path); $$;

create or replace function public.rpc_respond_circle_media_subject_approval(
  p_asset_id uuid,
  p_actor_profile_id uuid,
  p_approve boolean
)
returns public.circle_media_assets
language sql
security definer
set search_path = ''
as $$ select private.respond_to_circle_media_subject_approval(p_asset_id, p_actor_profile_id, p_approve); $$;

create or replace function public.rpc_get_my_circle_media_subject_approvals(p_actor_profile_id uuid)
returns table(asset_id uuid, circle_id uuid, title text, media_type text, poster_object_path text, uploader_name text, requested_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$ select * from private.get_my_circle_media_subject_approvals(p_actor_profile_id); $$;

revoke all on function public.rpc_submit_circle_media_asset_for_moderation(uuid, text, boolean, uuid[], text, text, text) from public, anon;
revoke all on function public.rpc_service_complete_circle_media_moderation(uuid, text, text, text, text[], jsonb, text, text) from public, anon, authenticated;
revoke all on function public.rpc_respond_circle_media_subject_approval(uuid, uuid, boolean) from public, anon;
revoke all on function public.rpc_get_my_circle_media_subject_approvals(uuid) from public, anon;
grant execute on function public.rpc_submit_circle_media_asset_for_moderation(uuid, text, boolean, uuid[], text, text, text) to authenticated, service_role;
grant execute on function public.rpc_service_complete_circle_media_moderation(uuid, text, text, text, text[], jsonb, text, text) to service_role;
grant execute on function public.rpc_respond_circle_media_subject_approval(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.rpc_get_my_circle_media_subject_approvals(uuid) to authenticated, service_role;

commit;
